import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { ExportService } from './export.service';
import { Trip } from '../entities/trip.entity';
import { Plant } from '../entities/plant.entity';
import { Station } from '../entities/station.entity';
import { TripLine } from '../entities/trip-line.entity';
import { TripStatus } from '../domain/enums';
import { RestStop } from '../entities/rest-stop.entity';
import { BlackPoint, BlackPointKind } from '../entities/black-point.entity';
import { SafetyService, TripSafetyMatch } from '../safety/safety.service';

describe('ExportService', () => {
  let service: ExportService;

  const mockPlant: Plant = {
    id: 1,
    name: 'C.E.C MOHAMMEDIA FUELS',
    lat: 33.686,
    lon: -7.391,
  };

  const mockStation: Station = {
    id: 1,
    name: 'SHELL MARHABA TANGER',
    city: 'TANGER',
    lat: 35.759,
    lon: -5.833,
    geocodeSource: null,
    geocodeConfirmed: true,
  };

  const mockTrip1: Trip = {
    id: 101,
    tripNum: '3097361',
    salesOrder: '444379402',
    patDoc: '77751307',
    tourDate: '2026-10-09',
    vehicleId: 'MA23990D40',
    customerName: 'SHELL MARHABA TANGER',
    driverName: 'RACHID ELKHATTAB',
    tranche: 2,
    plant: mockPlant,
    station: mockStation,
    totalLiters: 33000,
    status: TripStatus.PLANNED,
    plannedDeparture: '2026-10-09T06:00:00',
    distanceOneWayKm: 345.5,
    distanceRoundTripKm: 691.0,
    distanceEstimated: false,
    drivingMinOneWay: 300,
    drivingMinRoundTrip: 600,
    breakMinutes: 45,
    loadingMinutes: 60,
    unloadingMinutes: 60,
    adminMinutes: 15,
    etaStation: '2026-10-09T11:45:00',
    endUnloading: '2026-10-09T12:45:00',
    etaReturnPlant: '2026-10-09T18:30:00',
    totalDurationMin: 750,
    includeReturn: true,
    computedAt: '2026-10-09T05:00:00',
    lines: [
      new TripLine('Shell Vpower Diesel', 3000),
      new TripLine('Shell Fuelsave Diesel 10ppm', 24000),
      new TripLine('Shell Fuelsave Super', 6000),
    ],
    warnings: [],
    addLine: () => {},
  };

  const mockTrip2: Trip = {
    id: 102,
    tripNum: '3098081',
    salesOrder: '444384441',
    patDoc: '77753343',
    tourDate: '2026-10-09',
    vehicleId: 'MA24744D40',
    customerName: 'SHELL OUTATE L HAJ',
    driverName: 'MOSTAFA LAKHAL',
    tranche: 4,
    plant: mockPlant,
    station: {
      id: 2,
      name: 'SHELL OUTATE L HAJ',
      city: 'OUTAT EL HAJ',
      lat: 33.345,
      lon: -3.812,
      geocodeSource: null,
      geocodeConfirmed: true,
    },
    totalLiters: 33000,
    status: TripStatus.PLANNED,
    plannedDeparture: '2026-10-09T06:00:00',
    distanceOneWayKm: 420.0,
    distanceRoundTripKm: 840.0,
    distanceEstimated: false,
    drivingMinOneWay: 360,
    drivingMinRoundTrip: 720,
    breakMinutes: 45,
    loadingMinutes: 60,
    unloadingMinutes: 60,
    adminMinutes: 15,
    etaStation: '2026-10-09T12:45:00',
    endUnloading: '2026-10-09T13:45:00',
    etaReturnPlant: '2026-10-09T20:30:00',
    totalDurationMin: 870,
    includeReturn: true,
    computedAt: '2026-10-09T05:00:00',
    lines: [
      new TripLine('Shell Fuelsave Super', 10000),
      new TripLine('Shell Fuelsave Diesel 10ppm', 23000),
    ],
    warnings: ['Conduite journalière de 12h supérieure à la limite'],
    addLine: () => {},
  };

  // Un camion et un chauffeur, deux Ship To différents : deux clients sur la même fiche.
  const mockTrip3: Trip = {
    ...mockTrip2,
    id: 103,
    tripNum: '3097618',
    vehicleId: 'MA25876D40',
    customerName: 'NM MANAGEMENT',
    driverName: 'YASSINE BAAZAOUI',
    station: {
      id: 3,
      name: 'SHELL HAOUZ',
      city: 'MARRAKECH',
      lat: 31.63,
      lon: -7.99,
      geocodeSource: null,
      geocodeConfirmed: true,
    },
    lines: [
      new TripLine('Shell Fuelsave Diesel 10ppm', 15000, 'SHELL HAOUZ', 'MARRAKECH'),
      new TripLine('Shell Fuelsave Super', 13000, 'SHELL KATRIA', 'KENITRA'),
    ],
    warnings: [],
    addLine: () => {},
  };

  const mockTripRepository = {
    find: jest.fn().mockImplementation(({ where }) => {
      if (where.tourDate === '2026-10-09') {
        return Promise.resolve([mockTrip1, mockTrip2]);
      }
      return Promise.resolve([]);
    }),
    findOne: jest.fn().mockImplementation(({ where }) => {
      if (where.id === 101) return Promise.resolve(mockTrip1);
      if (where.id === 102) return Promise.resolve(mockTrip2);
      if (where.id === 103) return Promise.resolve(mockTrip3);
      return Promise.resolve(null);
    }),
  };

  // Données de sûreté de test pour la destination TANGER.
  const tangerSafety: TripSafetyMatch = {
    restStops: [
      new RestStop({ trajet: 'MOHAMMEDIA-TANGER', name: 'BOUZNIKA', restAllowed: true, nightAllowed: true }),
      new RestStop({ trajet: 'MOHAMMEDIA-TANGER', name: 'KENITRA SHELL', restAllowed: true, nightAllowed: false }),
    ],
    blackPoints: [
      new BlackPoint({ kind: BlackPointKind.ROAD, zone: 'Bouznika', landmark: 'Pont Bouznika', nature: 'pont dangereux', durability: 'durable' }),
      new BlackPoint({ kind: BlackPointKind.SECURITY, zone: 'Mohammedia', landmark: "Sortie Autoroute Ouest", nature: 'vol (nuit)', durability: 'Temporaire' }),
      new BlackPoint({ kind: BlackPointKind.FORBIDDEN_ZONE, zone: 'ZI SKHIRAT', address: 'الصخيرات' }),
    ],
  };

  const mockSafetyService = {
    matchForTrip: jest.fn().mockImplementation((origin: string, destination: string) =>
      Promise.resolve(destination === 'TANGER' ? tangerSafety : { restStops: [], blackPoints: [] }),
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportService,
        {
          provide: getRepositoryToken(Trip),
          useValue: mockTripRepository,
        },
        {
          provide: SafetyService,
          useValue: mockSafetyService,
        },
      ],
    }).compile();

    service = module.get<ExportService>(ExportService);
  });

  it('génère un classeur Excel avec une feuille JMP par voyage et une feuille Synthèse', async () => {
    const buffer = await service.exportExcel('2026-10-09');
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(1000);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);

    // Vérifie la présence des feuilles de voyage JMP et de la synthèse
    const sheetNames = wb.worksheets.map((w) => w.name);
    expect(sheetNames.some((n) => n.includes('3097361'))).toBe(true);
    expect(sheetNames.some((n) => n.includes('3098081'))).toBe(true);
    expect(sheetNames.some((n) => n.includes('Synthèse'))).toBe(true);

    // Vérifie le contenu de la feuille JMP du voyage 3097361
    const jmpSheet = wb.worksheets.find((w) => w.name.includes('3097361'))!;
    expect(jmpSheet).toBeDefined();

    // Titre bilingue FR + AR
    expect(jmpSheet.getCell('A1').value).toContain('JOURNEY MANAGEMENT PLAN (JMP)');
    expect(jmpSheet.getCell('A1').value).toContain('خطة إدارة الرحلة');

    // Métadonnées bilingues (FR en A:G, AR en H:K)
    expect(String(jmpSheet.getCell('A2').value)).toContain('Plan de voyage N°');
    expect(String(jmpSheet.getCell('H2').value)).toContain('رقم خطة الرحلة');

    // Informations au chauffeur : sous les consignes, titre souligné + texte simple, pas un tableau.
    let numerosRow: number | undefined;
    let consignesRow: number | undefined;
    for (let row = 1; row <= 70; row++) {
      const v = String(jmpSheet.getCell(row, 1).value ?? '');
      if (consignesRow === undefined && v.includes('CONSIGNES DE SÉCURITÉ')) consignesRow = row;
      if (numerosRow === undefined && v.includes('INFORMATIONS AU CHAUFFEUR')) numerosRow = row;
    }
    expect(numerosRow).toBeDefined();
    expect(consignesRow).toBeDefined();
    expect(numerosRow!).toBeGreaterThan(consignesRow!);
    expect(String(jmpSheet.getCell(numerosRow!, 1).value)).toContain('معلومات للسائق');
    expect(String(jmpSheet.getCell(numerosRow!, 1).value)).not.toContain('OBLIGATOIRE');
    const numeros = [0, 1, 2].flatMap((i) => [
      String(jmpSheet.getCell(numerosRow! + 1 + i, 1).value ?? ''),
      String(jmpSheet.getCell(numerosRow! + 1 + i, 6).value ?? ''),
    ]).join(' ');
    expect(numeros).toContain('Police : 19');
    expect(numeros).toContain('Gendarmerie : 177');
    expect(numeros).toContain('Pompiers : 15');
    expect(numeros).toContain('SAMU : 115');
    expect(numeros).toContain('WhatsApp : 06 61 73 59 78');
    expect(numeros).toContain('الشرطة');
    expect(numeros).toContain('الدرك الملكي');
    expect(numeros).toContain('واتساب');
    // Le bloc n'est pas un tableau : aucune cellule ne doit être remplie ou encadrée.
    for (let i = 0; i < 3; i++) {
      const cell = jmpSheet.getCell(numerosRow! + 1 + i, 1);
      expect((cell.fill as ExcelJS.FillPattern).pattern).toBe('none');
      expect(cell.border?.top).toBeUndefined();
    }

    // Tableau 1 : en-têtes bilingues, valeurs d'identification du voyage.
    let t1HeaderRow: number | undefined;
    for (let row = 1; row <= 20; row++) {
      if (t1HeaderRow === undefined && String(jmpSheet.getCell(row, 1).value ?? '').startsWith('Voyage N°')) t1HeaderRow = row;
    }
    expect(t1HeaderRow).toBeDefined();
    expect(String(jmpSheet.getCell(t1HeaderRow!, 1).value)).toContain('رقم الرحلة');
    expect(String(jmpSheet.getCell(t1HeaderRow!, 3).value)).toContain('Chauffeur');
    expect(String(jmpSheet.getCell(t1HeaderRow! + 1, 1).value)).toBe('3097361');
    expect(String(jmpSheet.getCell(t1HeaderRow! + 1, 3).value)).toContain('RACHID ELKHATTAB');
    expect(String(jmpSheet.getCell(t1HeaderRow! + 1, 4).value)).toContain('MA23990D40');

    // Consignes de sécurité bilingues (en bas de feuille) : recherche dynamique de la ligne
    let vitesseRow: number | undefined;
    let fumerRow: number | undefined;
    for (let row = 1; row <= 60; row++) {
      const a = String(jmpSheet.getCell(row, 1).value ?? '');
      const f = String(jmpSheet.getCell(row, 6).value ?? '');
      if (a.includes('vitesse légale') && vitesseRow === undefined) vitesseRow = row;
      if (f.includes('fumer') && fumerRow === undefined) fumerRow = row;
    }
    expect(vitesseRow).toBeDefined();
    expect(fumerRow).toBeDefined();
    expect(String(jmpSheet.getCell(vitesseRow!, 1).value)).toContain('احترام السرعة');
    expect(String(jmpSheet.getCell(fumerRow!, 6).value)).toContain('يمنع التدخين');

    // Tableau 4 - DEBRIEF : contenu présent (structure dynamique, peu importe la ligne exacte)
    let foundPointsNoirsHeader = false;
    let foundReposHeader = false;
    let foundZonesHeader = false;
    let foundNuitHeader = false;
    let foundBouznika = false;
    let foundBouznikaRepos = false;
    let foundZiSkhirat = false;
    let foundProduitsHeader = false;
    let foundReposAller = false;
    let foundReposRetour = false;
    let risquesRow: number | undefined;
    for (let r = 1; r <= 45; r++) {
      for (let c = 1; c <= 11; c++) {
        const v = String(jmpSheet.getCell(r, c).value ?? '');
        if (v.includes('Points noirs') && !foundPointsNoirsHeader) foundPointsNoirsHeader = true;
        if (v.includes('Points de repos autorisés') && !foundReposHeader) foundReposHeader = true;
        if (v.includes('ALLER') && !foundReposAller) foundReposAller = true;
        if (v.includes('RETOUR') && !foundReposRetour) foundReposRetour = true;
        if (v.includes('Zones interdites') && !foundZonesHeader) foundZonesHeader = true;
        if (v.includes('Repos de nuit autorisés') && !foundNuitHeader) foundNuitHeader = true;
        if (v.includes('Bouznika - Pont Bouznika') && !foundBouznika) foundBouznika = true;
        if (v.includes('BOUZNIKA') && !foundBouznikaRepos) foundBouznikaRepos = true;
        if (v.includes('ZI SKHIRAT') && !foundZiSkhirat) foundZiSkhirat = true;
        if (v.includes('Produits & Quantités') && !foundProduitsHeader) foundProduitsHeader = true;
        if (v.includes('Déconnexion GPS') && risquesRow === undefined) risquesRow = r;
      }
    }
    expect(foundPointsNoirsHeader).toBe(true);
    expect(foundReposHeader).toBe(true);
    expect(foundReposAller).toBe(true);
    expect(foundReposRetour).toBe(true);
    expect(foundZonesHeader).toBe(true);
    expect(foundNuitHeader).toBe(true);
    expect(foundBouznika).toBe(true);
    expect(foundBouznikaRepos).toBe(true);
    expect(foundZiSkhirat).toBe(true);
    // Le tableau 2 ne comporte plus de colonne « Produits & Quantités ».
    expect(foundProduitsHeader).toBe(false);

    // Tableau 4 : les cellules de risques sont laissées vides (remplissage manuel).
    expect(risquesRow).toBeDefined();
    for (let c = 1; c <= 6; c++) {
      expect(jmpSheet.getCell(risquesRow! + 1, c).value ?? '').toBe('');
    }

    // Tableau 3 : libellés corrigés par le management (uniquement des horaires).
    let departLabel = '';
    let finTrajetLabel = '';
    let arriveeChargementLabel = '';
    let sortieChargementLabel = '';
    let foundDureeTrajet = false;
    let foundRetourDepot = false;
    for (let r = 1; r <= 45; r++) {
      for (let c = 1; c <= 11; c++) {
        const v = String(jmpSheet.getCell(r, c).value ?? '');
        if (v.includes('Heure de départ')) departLabel = v;
        if (v.includes('Heure de fin de trajet')) finTrajetLabel = v;
        if (v.includes("Heure d'arrivée au lieu de chargement")) arriveeChargementLabel = v;
        if (v.includes('Heure de sortie du lieu de chargement')) sortieChargementLabel = v;
        if (v.includes('Durée trajet')) foundDureeTrajet = true;
        if (v.includes('Heure retour dépôt')) foundRetourDepot = true;
      }
    }
    expect(departLabel).toContain('ساعة الانطلاق');
    expect(finTrajetLabel).toContain('ساعة نهاية السير');
    expect(arriveeChargementLabel).toContain('ساعة الوصول إلى مكان التحميل');
    expect(sortieChargementLabel).toContain('ساعة الخروج من مكان التحميل');
    expect(foundDureeTrajet).toBe(false);
    expect(foundRetourDepot).toBe(false);

    // Le 4e horaire est l'heure de sortie chargée : arrivée au dépôt + temps d'immobilisation.
    let prevusRow: number | undefined;
    for (let r = 1; r <= 45; r++) {
      if (prevusRow === undefined && String(jmpSheet.getCell(r, 1).value ?? '').startsWith('Prévu')) prevusRow = r;
    }
    expect(prevusRow).toBeDefined();
    // Heure de fin de trajet imposée à 18:00, quel que soit l'ETA calculée.
    expect(String(jmpSheet.getCell(prevusRow!, 4).value)).toBe('18:00');
    expect(String(jmpSheet.getCell(prevusRow!, 6).value)).toBe('18:30');
    // 18:30 (retour dépôt) + 60 min de chargement + 15 min d'administratif = 19:45.
    expect(String(jmpSheet.getCell(prevusRow!, 8).value)).toBe('19:45');

    // Tableau 2 : le lieu de chargement ouvre le tableau, la ville le suit.
    let t3HeaderRow: number | undefined;
    for (let r = 1; r <= 45; r++) {
      if (t3HeaderRow === undefined && String(jmpSheet.getCell(r, 1).value ?? '').startsWith('Lieu chargement')) {
        t3HeaderRow = r;
      }
    }
    expect(t3HeaderRow).toBeDefined();
    expect(String(jmpSheet.getCell(t3HeaderRow!, 2).value)).toContain('Ville');
    expect(String(jmpSheet.getCell(t3HeaderRow! + 1, 1).value)).toBe('C.E.C MOHAMMEDIA FUELS');
    expect(String(jmpSheet.getCell(t3HeaderRow! + 1, 2).value)).toBe('TANGER');
    expect(String(jmpSheet.getCell(t3HeaderRow! + 1, 3).value)).toContain('SHELL MARHABA TANGER (33000 L)');

    // Tableau 5 : signatures bilingues (quelque part sur la feuille)
    let foundVisa = false;
    let foundSignature = false;
    for (let r = 1; r <= 45; r++) {
      const v = String(jmpSheet.getCell(r, 1).value ?? '');
      const vd = String(jmpSheet.getCell(r, 4).value ?? '');
      if (v.includes('Visa')) foundVisa = true;
      if (vd.includes('Signature') && vd.includes('توقيع السائق')) foundSignature = true;
    }
    expect(foundVisa).toBe(true);
    expect(foundSignature).toBe(true);

    // Cellules réservées au relevé terrain : « Réel », compteurs et corps du Tableau 5 vides.
    let reelRow: number | undefined;
    let visaRow: number | undefined;
    for (let row = 1; row <= 60; row++) {
      if (reelRow === undefined && String(jmpSheet.getCell(row, 1).value ?? '').includes('Réel')) reelRow = row;
      if (visaRow === undefined && String(jmpSheet.getCell(row, 1).value ?? '').includes('Visa')) visaRow = row;
    }
    expect(reelRow).toBeDefined();
    // Ligne « Réel » : toutes les valeurs sont vides (2..11).
    for (let c = 2; c <= 11; c++) {
      expect(jmpSheet.getCell(reelRow!, c).value ?? '').toBe('');
    }
    // Compteurs départ / arrêt (colonnes J et K de la ligne d'itinéraire) : vides.
    let itineraryHeaderRow: number | undefined;
    for (let row = 1; row <= 60; row++) {
      if (itineraryHeaderRow === undefined && String(jmpSheet.getCell(row, 10).value ?? '').includes('Compteur départ')) {
        itineraryHeaderRow = row;
      }
    }
    expect(itineraryHeaderRow).toBeDefined();
    const itineraryRow = itineraryHeaderRow! + 1;
    expect(jmpSheet.getCell(itineraryRow, 10).value ?? '').toBe('');
    expect(jmpSheet.getCell(itineraryRow, 11).value ?? '').toBe('');
    // Tableau 5 : la ligne de saisie (sous les en-têtes) est vide.
    expect(jmpSheet.getCell(visaRow! + 1, 1).value ?? '').toBe('');
    expect(jmpSheet.getCell(visaRow! + 1, 4).value ?? '').toBe('');
    expect(jmpSheet.getCell(visaRow! + 1, 8).value ?? '').toBe('');
  });

  it('affiche tous les clients (Ship To Name) d\'un même camion-chauffeur', async () => {
    const buffer = await service.exportExcel(undefined, 103);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    const sheet = wb.worksheets[0];

    // Tableau 1 : le compteur suit les Ship To distincts, pas les lignes de produit.
    let compteurCell = '';
    for (let r = 1; r <= 16; r++) {
      const v = String(sheet.getCell(r, 6).value ?? '');
      if (v.includes('clients')) compteurCell = v;
    }
    expect(compteurCell).toContain('Deux clients');

    // Tableau 2 : une ligne par Ship To, lieu de chargement puis ville, avec volume propre.
    let headerRow: number | undefined;
    for (let r = 1; r <= 40; r++) {
      if (headerRow === undefined && String(sheet.getCell(r, 1).value ?? '').startsWith('Lieu chargement')) headerRow = r;
    }
    expect(headerRow).toBeDefined();
    const premiere = headerRow! + 1;
    expect(String(sheet.getCell(premiere, 1).value)).toBe('C.E.C MOHAMMEDIA FUELS');
    expect(String(sheet.getCell(premiere, 2).value)).toBe('MARRAKECH');
    expect(String(sheet.getCell(premiere, 3).value)).toBe('SHELL HAOUZ (15000 L)');
    expect(String(sheet.getCell(premiere, 5).value)).toBe('12:45');
    const seconde = premiere + 1;
    expect(String(sheet.getCell(seconde, 2).value)).toBe('KENITRA');
    expect(String(sheet.getCell(seconde, 3).value)).toBe('SHELL KATRIA (13000 L)');
    // Une seule arrivée calculée : les créneaux du 2e client restent à renseigner.
    expect(String(sheet.getCell(seconde, 5).value ?? '')).toBe('');
    // Le donneur d'ordre n'est jamais confondu avec le destinataire.
    expect(String(sheet.getCell(premiere, 3).value)).not.toContain('NM MANAGEMENT');

    // En-tête de fiche : les deux clients sont cités.
    expect(String(sheet.getCell(2, 1).value)).toContain('SHELL HAOUZ / SHELL KATRIA');
  });

  it('laisse observations, lieu de nuitée et lieu de départ vides même avec une alerte', async () => {
    // 3098081 porte une alerte de conduite journalière : elle ne doit pas être imprimée.
    const buffer = await service.exportExcel(undefined, 102);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    const sheet = wb.worksheets[0];

    let headerRow: number | undefined;
    for (let r = 1; r <= 40; r++) {
      if (headerRow === undefined && String(sheet.getCell(r, 1).value ?? '').startsWith('Lieu chargement')) headerRow = r;
    }
    expect(headerRow).toBeDefined();
    const ligne = headerRow! + 1;
    expect(String(sheet.getCell(ligne, 7).value ?? '')).toBe('');
    expect(String(sheet.getCell(ligne, 8).value ?? '')).toBe('');
    expect(String(sheet.getCell(ligne, 9).value ?? '')).toBe('');
    expect(String(sheet.getCell(ligne, 1).value)).toBe('C.E.C MOHAMMEDIA FUELS');
  });

  it('numerote les tableaux de 1 à 5 avec les groupes BRIEF et DEBRIEF', async () => {
    const buffer = await service.exportExcel(undefined, 101);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    const sheet = wb.worksheets[0];

    const titres: string[] = [];
    for (let r = 1; r <= 60; r++) {
      const v = String(sheet.getCell(r, 1).value ?? '');
      if (v.startsWith('TABLEAU')) titres.push(v);
    }
    expect(titres).toEqual([
      'TABLEAU 1 : DÉTAILS DU PLAN DE VOYAGE',
      'TABLEAU 2 - BRIEF : ITINÉRAIRE, CHARGEMENT & LIVRAISON',
      'TABLEAU 3 - BRIEF : HORAIRES & DURÉES',
      'TABLEAU 4 - DEBRIEF : RISQUES, TÉLÉMATIQUE & ZONES',
      'TABLEAU 5 - DEBRIEF : VALIDATIONS, VISAS & OBSERVATIONS JMP',
    ]);
  });

  it('génère un classeur avec uniquement le voyage demandé lorsqu\'un tripId est fourni', async () => {

    const buffer = await service.exportExcel(undefined, 101);
    expect(buffer).toBeDefined();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);

    // Uniquement la feuille du voyage 101
    expect(wb.worksheets).toHaveLength(1);
    expect(wb.worksheets[0].name).toContain('3097361');
  });

  it('génère une feuille d\'information si aucun voyage n\'est planifié', async () => {
    const buffer = await service.exportExcel('2026-10-20');
    expect(buffer).toBeDefined();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    expect(wb.worksheets).toHaveLength(1);
    expect(String(wb.worksheets[0].getCell('A1').value)).toContain('AUCUN VOYAGE');
  });

  it('génère un document PDF valide du plan de livraison', async () => {
    const buffer = await service.exportPdf('2026-10-09');
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.slice(0, 4).toString()).toBe('%PDF');
  });
});
