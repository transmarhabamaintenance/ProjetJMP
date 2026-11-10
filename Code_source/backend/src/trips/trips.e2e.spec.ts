import * as fs from 'fs';
import * as path from 'path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GEOCODER } from '../routing/geocoder';
import { Geocoder } from '../routing/geocoder';
import { GeoPoint } from '../routing/geo-point';
import { OSRM_CLIENT, OsrmClient } from '../routing/osrm.client';
import { RouteResult } from '../routing/route-result';
import { Trip } from '../entities/trip.entity';
import { TripLine } from '../entities/trip-line.entity';
import { Station } from '../entities/station.entity';
import { RouteCache } from '../entities/route-cache.entity';
import { User } from '../entities/user.entity';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { ImportReportDto, StatsDto, TripDetailDto, TripSummaryDto } from '../trips/trips.dto';
import { StationDto } from '../stations/stations.dto';

/**
 * Intégration de bout en bout : import de samples/Programe_VIVO.xlsx ->
 * 3 voyages planifiés, puis planification manuelle, sessions et rôles.
 * Aucun appel réseau (OSRM/Nominatim factices).
 */
const fakeGeocoder: Geocoder = {
  async geocode(query: string): Promise<GeoPoint | null> {
    const q = query.toUpperCase();
    if (q.includes('TANGER')) return { lat: 35.7595, lon: -5.834 };
    if (q.includes('OUTAT EL HAJ') || q.includes('OUTATE L HAJ')) return { lat: 33.3768, lon: -3.6855 };
    if (q.includes('MARRAKECH')) return { lat: 31.6295, lon: -7.9811 };
    return null;
  },
};

const fakeOsrm: OsrmClient = {
  async route(_origin: GeoPoint, destination: GeoPoint): Promise<RouteResult | null> {
    if (Math.abs(destination.lat - 35.7595) < 0.01) return { distanceKm: 332, durationCarMin: 240, geometry: 'fake:tanger', fallbackUsed: false };
    if (Math.abs(destination.lat - 31.6295) < 0.01) return { distanceKm: 330, durationCarMin: 240, geometry: 'fake:marrakech', fallbackUsed: false };
    if (Math.abs(destination.lat - 33.3768) < 0.01) return { distanceKm: 450, durationCarMin: 320, geometry: 'fake:outat', fallbackUsed: false };
    return null;
  },
};

describe('Import -> planification de bout en bout', () => {
  let app: INestApplication;
  let sampleFile: Buffer;
  let adminToken = '';
  let userToken = '';
  let tangerTrip: Trip;
  let marrakechTrip: Trip;
  let manualTripId = 0;

  const withToken = (token: string) => ({ Authorization: `Bearer ${token}` });

  const call = (token: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set(withToken(token)),
    post: (url: string) => request(app.getHttpServer()).post(url).set(withToken(token)),
    put: (url: string) => request(app.getHttpServer()).put(url).set(withToken(token)),
    patch: (url: string) => request(app.getHttpServer()).patch(url).set(withToken(token)),
    delete: (url: string) => request(app.getHttpServer()).delete(url).set(withToken(token)),
  });

  beforeAll(async () => {
    // La suite vide les tables : on vise une base de test, jamais la base de développement.
    process.env.MYSQL_DATABASE = process.env.MYSQL_TEST_DATABASE ?? 'jmp_test';
    sampleFile = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'samples', 'Programe_VIVO.xlsx'));

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GEOCODER).useValue(fakeGeocoder)
      .overrideProvider(OSRM_CLIENT).useValue(fakeOsrm)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    // MySQL refuse TRUNCATE sur une table référencée par une FK : DELETE dans l'ordre des dépendances.
    const manager = app.get(DataSource).manager;
    for (const entity of [TripLine, Trip, Station, RouteCache]) {
      await manager.createQueryBuilder(entity, 'row').delete().execute();
    }
    await manager.createQueryBuilder(User, 'row').delete().execute();
    await app.get(AuthService).ensureAdmin('admin', 'admin123');

    const session = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(200);
    adminToken = session.body.token;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('importe et calcule les trois voyages', async () => {
    // 1. Import du classeur
    const importRes = await call(adminToken)
      .post('/api/import')
      .attach('file', sampleFile, 'Programe_VIVO.xlsx')
      .expect(200);
    const report = importRes.body as ImportReportDto;
    expect(report.trips).toBe(3);
    expect(report.lines).toBe(8);
    expect(report.issues.filter((i) => i.level === 'ERROR')).toHaveLength(0);

    // L'import planifie déjà : distances et durées disponibles sans recalcul séparé.
    expect(report.journeyList.every((t) => t.status === 'PLANNED')).toBe(true);
    expect(report.journeyList.every((t) => (t.distanceRoundTripKm ?? 0) > 0)).toBe(true);
    expect(report.journeyList.every((t) => Number(t.totalDurationMin) > 0)).toBe(true);

    // 2. Recalcul (planification)
    await call(adminToken).post('/api/trips/recalculate').send({}).expect(200);

    const tripRepo = app.get(getRepositoryToken(Trip));
    const trips = await tripRepo.find();
    expect(trips).toHaveLength(3);

    const byStation = (name: string) => {
      const found = trips.find((t) => t.station?.name?.toLowerCase() === name.toLowerCase());
      if (!found) throw new Error(`Voyage vers ${name} introuvable`);
      return found;
    };
    tangerTrip = byStation('SHELL MARHABA TANGER');
    const outat = byStation('SHELL OUTATE L HAJ');
    marrakechTrip = byStation('SHELL HAOUZ');

    expect(trips.filter((t) => t.tourDate === '2026-10-09')).toHaveLength(3);
    expect(tangerTrip.totalLiters).toBeCloseTo(33000, 3);
    expect(outat.totalLiters).toBeCloseTo(33000, 3);
    expect(marrakechTrip.totalLiters).toBeCloseTo(33000, 3);
    expect(tangerTrip.status).toBe('PLANNED');

    // 4. Distances réalistes (ordres de grandeur routiers)
    expect(tangerTrip.distanceOneWayKm).toBeGreaterThan(300);
    expect(tangerTrip.distanceOneWayKm).toBeLessThan(360);
    expect(marrakechTrip.distanceOneWayKm).toBeGreaterThan(300);
    expect(marrakechTrip.distanceOneWayKm).toBeLessThan(380);
    expect(outat.distanceOneWayKm).toBeGreaterThan(400);
    expect(outat.distanceOneWayKm).toBeLessThan(500);

    // 5. Horaires cohérents
    expect(tangerTrip.plannedDeparture).toBe('2026-10-09T06:00');
    expect(tangerTrip.etaStation).toBe('2026-10-09T12:00');
    expect(new Date(tangerTrip.etaStation).getTime()).toBeGreaterThan(new Date(tangerTrip.plannedDeparture).getTime());
    expect(new Date(tangerTrip.endUnloading).getTime()).toBeGreaterThan(new Date(tangerTrip.etaStation).getTime());
    expect(new Date(tangerTrip.etaReturnPlant).getTime()).toBeGreaterThan(new Date(tangerTrip.endUnloading).getTime());
    expect(Number(tangerTrip.totalDurationMin)).toBeGreaterThan(0);

    // 6. Parcours de lecture du plan, du détail, de la carte et du tableau de bord
    const planRes = await call(adminToken).get('/api/trips').query({ date: '2026-10-09' }).expect(200);
    const plan = planRes.body as TripSummaryDto[];
    expect(plan).toHaveLength(3);

    const statsRes = await call(adminToken).get('/api/stats').query({ date: '2026-10-09' }).expect(200);
    const stats = statsRes.body as StatsDto;
    expect(stats.tripsCount).toBe(3);
    expect(Object.values(stats.litersByProduct).reduce((a, b) => a + b, 0)).toBeCloseTo(99000, 3);

    const detailRes = await call(adminToken).get(`/api/trips/${tangerTrip.id}`).expect(200);
    expect((detailRes.body as TripDetailDto).lines).toHaveLength(3);

    const stationsRes = await call(adminToken).get('/api/stations').expect(200);
    const stations = stationsRes.body as StationDto[];
    expect(stations).toHaveLength(3);
    expect(stations.every((s) => s.lat != null && s.lon != null)).toBe(true);

    const binary = ((r: NodeJS.ReadableStream, cb: (err: Error | null, body?: string) => void) => {
      let acc = '';
      r.setEncoding('latin1');
      r.on('data', (c: string) => { acc += c; });
      r.on('end', () => cb(null, acc));
    }) as never;
    const excelRes = await call(adminToken).get('/api/export/excel').query({ date: '2026-10-09' })
      .buffer().parse(binary).expect(200);
    expect(String(excelRes.body).length).toBeGreaterThan(1000);
    const pdfRes = await call(adminToken).get('/api/export/pdf').query({ date: '2026-10-09' })
      .buffer().parse(binary).expect(200);
    expect(String(pdfRes.body).length).toBeGreaterThan(1000);
  }, 60000);

  it('remplace les lignes d\'un voyage déjà importé (ré-import du même classeur)', async () => {
    await call(adminToken)
      .post('/api/import')
      .attach('file', sampleFile, 'Programe_VIVO.xlsx')
      .expect(200);

    const tripRepo = app.get(getRepositoryToken(Trip));
    const trips = await tripRepo.find();
    expect(trips).toHaveLength(3);
    const totalLines = trips.reduce((s, t) => s + t.lines.length, 0);
    expect(totalLines).toBe(8);
  }, 60000);

  it('planifie un voyage saisi à la main comme le ferait le classeur', async () => {
    const res = await call(adminToken)
      .post('/api/trips')
      .send({
        tourDate: '2026-10-09',
        tripNum: 'MAN-01',
        vehicleId: 'CAMION-MANUEL',
        customerName: 'Client saisi à la main',
        driverName: 'Chauffeur manuel',
        plantName: 'C.E.C MOHAMMEDIA FUELS',
        shipToName: 'SHELL HAOUZ',
        city: 'Marrakech',
        tranche: 1,
        lines: [
          { materialName: 'Gasoil', liters: 18000 },
          { materialName: 'Essence Super 95', liters: 15000 },
        ],
      })
      .expect(200);
    const detail = res.body as TripDetailDto;
    manualTripId = detail.summary.id;

    // Le voyage saisi passe par le même moteur que le voyage importé.
    expect(detail.summary.distanceOneWayKm).toBe(marrakechTrip.distanceOneWayKm);
    expect(detail.summary.drivingMinRoundTrip).toBe(marrakechTrip.drivingMinRoundTrip);
    expect(detail.summary.breakMinutes).toBe(marrakechTrip.breakMinutes);
    expect(detail.summary.plannedDeparture).toBe(marrakechTrip.plannedDeparture);
    expect(detail.summary.totalDurationMin).toBe(marrakechTrip.totalDurationMin);
    expect(detail.summary.warnings).toEqual(marrakechTrip.warnings);
    expect(detail.summary.status).toBe('PLANNED');
    expect(detail.summary.totalLiters).toBeCloseTo(33000, 3);
    expect(detail.lines).toHaveLength(2);
    expect(detail.stationLat).not.toBeNull();

    const fiche = await call(adminToken).get(`/api/trips/${manualTripId}`).expect(200);
    expect((fiche.body as TripDetailDto).summary.tripNum).toBe('MAN-01');

    // Fiche incomplète : message d'erreur de l'application, comme à l'import.
    const bad = await call(adminToken)
      .post('/api/trips')
      .send({ tourDate: '2026-10-09', plantName: 'C.E.C MOHAMMEDIA FUELS', shipToName: 'SHELL HAOUZ', lines: [] })
      .expect(400);
    expect(String(bad.body.message)).toContain('Aucune ligne de produit');

    const noDate = await call(adminToken).post('/api/trips').send({ shipToName: 'SHELL HAOUZ' }).expect(400);
    expect(String(noDate.body.message)).toContain('Date du voyage');
  }, 60000);

  it('ouvre une session et refuse un jeton absent ou invalide', async () => {
    await request(app.getHttpServer()).get('/api/trips').expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'mot-de-passe-invalide' })
      .expect(401);
    await call('jeton-fabrique').get('/api/trips').expect(401);

    const me = await call(adminToken).get('/api/auth/me').expect(200);
    expect(me.body.username).toBe('admin');
    expect(me.body.role).toBe('ADMIN');
  });

  it('réserve la modification, la suppression et les comptes à l\'administrateur', async () => {
    const created = await call(adminToken)
      .post('/api/auth/users')
      .send({ username: 'gestionnaire', password: 'jmp2026', fullName: 'Gestionnaire plan' })
      .expect(200);
    expect(created.body.role).toBe('USER');

    const sessions = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'gestionnaire', password: 'jmp2026' })
      .expect(200);
    userToken = sessions.body.token;

    // Consulter et créer restent ouverts à un simple utilisateur.
    await call(userToken).get('/api/trips').query({ date: '2026-10-09' }).expect(200);
    await call(userToken).post('/api/trips/recalculate').send({ ids: [] }).expect(200);
    await call(userToken).get('/api/export/excel').expect(200);
    await call(userToken).get('/api/stats').query({ date: '2026-10-09' }).expect(200);

    // Modifier, supprimer, gérer les comptes : refusés.
    await call(userToken).patch(`/api/trips/${tangerTrip.id}`).send({ driverName: 'Un autre' }).expect(403);
    await call(userToken).put('/api/settings').send({ adminMinutes: 20 }).expect(403);
    await call(userToken).put(`/api/stations/${marrakechTrip.station.id}`).send({ lat: 31.63, lon: -7.99 }).expect(403);
    await call(userToken).get('/api/auth/users').expect(403);
    await call(userToken).delete(`/api/trips/${manualTripId}`).expect(403);

    const users = await call(adminToken).get('/api/auth/users').expect(200);
    expect(users.body.some((u: { username: string }) => u.username === 'gestionnaire')).toBe(true);
    expect(JSON.stringify(users.body)).not.toContain('passwordHash');

    await call(adminToken).delete(`/api/auth/users/${created.body.id}`).expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'gestionnaire', password: 'jmp2026' })
      .expect(401);
  });

  it('supprime un voyage côté administrateur sans toucher les autres du jour', async () => {
    await call(adminToken).delete(`/api/trips/${manualTripId}`).expect(200);

    const trips = await app.get(getRepositoryToken(Trip)).find();
    expect(trips).toHaveLength(3);
    expect(trips.every((t) => t.lines.length > 0)).toBe(true);

    const planRes = await call(adminToken).get('/api/trips').query({ date: '2026-10-09' }).expect(200);
    expect(planRes.body).toHaveLength(3);
  });
});
