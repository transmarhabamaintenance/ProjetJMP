import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { addMinutes, formatDateTime, formatDate, parseDate, parseDateTime } from '../common/datetime';
import { GeocodeSource, TripStatus } from '../domain/enums';
import { Plant } from '../entities/plant.entity';
import { RouteCache } from '../entities/route-cache.entity';
import { Station } from '../entities/station.entity';
import { Trip } from '../entities/trip.entity';
import { TripLine } from '../entities/trip-line.entity';
import { CalculationEngine, PlanInput, round2 } from '../engine/calculation-engine';
import { ExcelTripImporter, ImportFormat } from '../importer/excel-trip.importer';
import { normalize } from '../importer/material-normalizer';
import { ParsedTrip } from '../importer/import-models';
import { GeocodingService } from '../routing/geocoding.service';
import { RoutingService } from '../routing/routing.service';
import { SettingsService } from '../settings/settings.service';
import { PlanningSettings } from '../entities/planning-settings.entity';
import {
  ImportReportDto, RecalculateRequest, TripCreateRequest, TripDetailDto, TripPatchRequest, TripSummaryDto,
} from './trips.dto';

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

/**
 * Service central : import du classeur Excel, planification des voyages
 * (géocodage + routage + calcul des horaires) et consultation.
 */
@Injectable()
export class TripService {
  private readonly engine = new CalculationEngine();

  constructor(
    @InjectRepository(Trip) private readonly tripRepository: Repository<Trip>,
    @InjectRepository(Plant) private readonly plantRepository: Repository<Plant>,
    @InjectRepository(Station) private readonly stationRepository: Repository<Station>,
    @InjectRepository(RouteCache) private readonly routeCacheRepository: Repository<RouteCache>,
    private readonly excelTripImporter: ExcelTripImporter,
    private readonly settingsService: SettingsService,
    private readonly geocodingService: GeocodingService,
    private readonly routingService: RoutingService,
  ) {}

  // ------------------------------------------------------------------
  // Import
  // ------------------------------------------------------------------

  async importWorkbook(file: UploadedFile | undefined, format: string | undefined = 'auto'): Promise<ImportReportDto> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Le fichier doit être un classeur Excel (.xlsx ou .xls)');
    }
    const filename = (file.originalname ?? '').toLowerCase();
    if (!filename.endsWith('.xlsx') && !filename.endsWith('.xls')) {
      throw new BadRequestException('Le fichier doit être un classeur Excel (.xlsx ou .xls)');
    }
    const requestedFormat: ImportFormat = format === 'jmp' || format === 'jit' ? format : 'auto';
    const settings = await this.settingsService.get();
    const result = await this.excelTripImporter.parse(file.buffer, settings.standardTankLiters, requestedFormat);

    const trips = await this.tripRepository.manager.transaction(async (manager) => {
      const persisted: Trip[] = [];
      for (const parsed of result.trips) {
        persisted.push(await this.persist(manager, parsed));
      }
      return persisted;
    });

    const issues = result.issues.map((i) => ({ level: i.level, lineNumber: i.lineNumber, message: i.message }));
    const lines = result.trips.reduce((sum, t) => sum + t.lines.length, 0);

    // Planifie les voyages importés (géocodage + routage + horaires) pour que les
    // distances et durées soient immédiatement disponibles (dashboard, plan, exports).
    await this.recalculateTrips(trips, settings);

    return {
      trips: result.trips.length,
      lines,
      issues,
      journeyList: trips.map((t) => this.toSummary(t, settings)),
    };
  }

  private async persist(manager: EntityManager, parsed: ParsedTrip): Promise<Trip> {
    let trip: Trip | null = null;
    if (parsed.tripNum != null && parsed.tourDate != null) {
      trip = await manager.getRepository(Trip).findOne({
        where: { tripNum: parsed.tripNum, tourDate: formatDate(parsed.tourDate) },
      });
    }
    const isNew = trip == null;
    const t = isNew ? new Trip() : trip!;
    if (!isNew) {
      await manager.getRepository(TripLine)
        .createQueryBuilder()
        .delete()
        .where('trip_id = :tripId', { tripId: t.id })
        .execute();
      t.lines = [];
    }
    t.tripNum = parsed.tripNum;
    t.salesOrder = parsed.salesOrder;
    t.patDoc = parsed.patDoc;
    t.tourDate = parsed.tourDate ? formatDate(parsed.tourDate) : null;
    t.vehicleId = parsed.vehicleId;
    t.customerName = parsed.customerName;
    t.driverName = parsed.driverName;
    t.tranche = parsed.tranche;
    t.totalLiters = parsed.totalLiters();
    t.plant = await this.plantFor(manager, parsed);
    t.station = await this.stationFor(manager, parsed);
    t.status = TripStatus.IMPORTED;

    for (const line of parsed.lines) {
      t.addLine(new TripLine(line.materialName, line.liters, line.shipToName ?? null, line.city ?? null));
    }
    return manager.getRepository(Trip).save(t);
  }

  private async plantFor(manager: EntityManager, parsed: ParsedTrip): Promise<Plant> {
    const repo = manager.getRepository(Plant);
    const ci = await repo.createQueryBuilder('p').where('LOWER(p.name) = LOWER(:name)', { name: parsed.plantName }).getOne();
    if (ci) return ci;
    return repo.save(new Plant(parsed.plantName ?? '', null, null));
  }

  private async stationFor(manager: EntityManager, parsed: ParsedTrip): Promise<Station> {
    const repo = manager.getRepository(Station);
    const ci = await repo.createQueryBuilder('s').where('LOWER(s.name) = LOWER(:name)', { name: parsed.shipToName }).getOne();
    if (ci) return ci;
    return repo.save(new Station(parsed.shipToName ?? '', parsed.city));
  }

  // ------------------------------------------------------------------
  // Planification (géocodage + routage + moteur de calcul)
  // ------------------------------------------------------------------

  async recalculate(request: RecalculateRequest | undefined): Promise<TripSummaryDto[]> {
    const settings = await this.settingsService.get();
    const ids = request?.ids;
    let trips: Trip[];
    if (!ids || ids.length === 0) {
      trips = await this.tripRepository.find();
    } else {
      trips = await this.tripRepository.find({ where: ids.map((id) => ({ id })) });
    }
    await this.recalculateTrips(trips, settings);
    return trips.map((t) => this.toSummary(t, settings));
  }

  /**
   * Planifie un voyage saisi à la main : mêmes champs que le classeur, même persistance
   * (dépôt et station déduits du nom) puis même calcul que le flux d'import.
   */
  async createTrip(request: TripCreateRequest): Promise<TripDetailDto> {
    const settings = await this.settingsService.get();

    const tourDate = parseDate(request.tourDate);
    if (!tourDate) {
      throw new BadRequestException('Date du voyage (Tour Start Date) manquante, format attendu AAAA-MM-JJ');
    }
    const shipToName = (request.shipToName ?? '').trim();
    if (!shipToName) throw new BadRequestException('Station (Ship To Name) obligatoire');
    const plantName = (request.plantName ?? '').trim();
    if (!plantName) throw new BadRequestException('Dépôt (Plant Name) obligatoire');

    const departureRequested = (request.plannedDeparture ?? '').trim();
    const departure = departureRequested ? parseDateTime(departureRequested) : null;
    if (departureRequested && !departure) {
      throw new BadRequestException(`Heure de départ invalide « ${departureRequested} », format attendu AAAA-MM-JJTHH:mm`);
    }

    const parsed = new ParsedTrip(
      (request.vehicleId ?? '').trim() || null,
      (request.customerName ?? '').trim() || null,
      shipToName,
      (request.city ?? '').trim() || null,
      (request.driverName ?? '').trim() || null,
      plantName,
      request.tranche ?? null,
      (request.tripNum ?? '').trim() || null,
      (request.salesOrder ?? '').trim() || null,
      (request.patDoc ?? '').trim() || null,
      tourDate,
      0,
    );
    for (const line of request.lines ?? []) {
      const materialName = normalize(line.materialName);
      const liters = Number(line.liters);
      if (!materialName) throw new BadRequestException('Ligne de produit sans nom (Material Name)');
      if (!Number.isFinite(liters) || liters <= 0) {
        throw new BadRequestException(`Ligne ${materialName} : total (litres) manquant ou nul`);
      }
      parsed.addLine({ materialName, liters, lineNumber: 0 });
    }
    if (parsed.lines.length === 0) {
      throw new BadRequestException('Aucune ligne de produit (Material Name / Total)');
    }

    const trip = await this.tripRepository.manager.transaction((manager) => this.persist(manager, parsed));
    if (departure) {
      trip.plannedDeparture = formatDateTime(departure);
      await this.tripRepository.save(trip);
    }
    await this.recalculateTrips([trip], settings);
    return this.getDetail(trip.id);
  }

  /** Supprime un voyage et ses lignes, puis recalcule les autres voyages du même jour. */
  async removeTrip(id: number): Promise<void> {
    const trip = await this.tripRepository.findOne({ where: { id } });
    if (!trip) throw new NotFoundException(`Voyage ${id} introuvable`);

    await this.tripRepository.manager.transaction(async (manager) => {
      await manager.getRepository(TripLine)
        .createQueryBuilder()
        .delete()
        .where('trip_id = :id', { id })
        .execute();
      await manager.getRepository(Trip).delete({ id });
    });

    const settings = await this.settingsService.get();
    const sameDay = trip.tourDate ? await this.tripRepository.find({ where: { tourDate: trip.tourDate } }) : [];
    await this.recalculateTrips(sameDay, settings);
  }

  private async recalculateTrips(trips: Trip[], settings: PlanningSettings): Promise<void> {
    for (const trip of trips) {
      await this.planTrip(trip, settings);
    }
    this.addOverlapWarnings(trips);
    await this.tripRepository.save(trips);
  }

  private async planTrip(trip: Trip, settings: PlanningSettings): Promise<void> {
    const warnings: string[] = [];

    let station = trip.station;
    if (station) {
      station = await this.geocodingService.locate(station);
      trip.station = station;
      if (station.lat == null) {
        warnings.push('Station non géocodée : distance et horaires indisponibles');
      } else if (!station.geocodeConfirmed && station.geocodeSource === GeocodeSource.CITY_CENTER) {
        warnings.push('Station non confirmée : coordonnées approximatives (centre-ville)');
      }
    } else {
      warnings.push('Station non géocodée : distance et horaires indisponibles');
    }

    if (!trip.plant || trip.plant.lat == null) {
      warnings.push('Dépôt non géolocalisé : distance et horaires indisponibles');
    }

    const route = await this.routingService.route(trip.plant, station);
    let distanceKm = route.distanceKm;
    const routeDurationCarMin = route.durationCarMin;
    if (distanceKm == null) {
      distanceKm = 0.0;
    } else if (route.fallbackUsed) {
      warnings.push(`Distance estimée à vol d'oiseau ×1,3 (OSRM indisponible) : ${km(distanceKm)}`);
    }

    const total = trip.totalLiters == null ? 0 : trip.totalLiters;
    if (Math.abs(total - settings.standardTankLiters) > 0.5) {
      warnings.push(`Total chargé de ${decimal(total)} L différent de la capacité standard (${decimal(settings.standardTankLiters)} L)`);
    }

    const input: PlanInput = {
      distanceOneWayKm: distanceKm,
      routeDurationCarMin,
      tourDate: parseDate(trip.tourDate) ?? new Date(),
      departure: parseDateTime(trip.plannedDeparture),
      settings,
    };
    const result = this.engine.calculate(input);
    warnings.push(...result.warnings);

    trip.distanceOneWayKm = result.distanceOneWayKm;
    trip.distanceRoundTripKm = result.distanceRoundTripKm;
    trip.distanceEstimated = route.fallbackUsed;
    trip.drivingMinOneWay = result.drivingMinOneWay;
    trip.drivingMinRoundTrip = result.drivingMinRoundTrip;
    trip.breakMinutes = result.breakMinutes;
    trip.loadingMinutes = result.loadingMinutes;
    trip.unloadingMinutes = result.unloadingMinutes;
    trip.adminMinutes = result.adminMinutes;
    trip.plannedDeparture = formatDateTime(result.plannedDeparture);
    trip.etaStation = formatDateTime(result.etaStation);
    trip.endUnloading = formatDateTime(result.endUnloading);
    trip.etaReturnPlant = formatDateTime(result.etaReturnPlant);
    trip.totalDurationMin = result.totalDurationMin;
    trip.includeReturn = settings.includeReturn;
    trip.status = TripStatus.PLANNED;
    trip.computedAt = formatDateTime(new Date());
    trip.warnings = warnings;
  }

  /** Détecte les chevauchements de deux voyages le même jour (même chauffeur ou même véhicule). */
  private addOverlapWarnings(trips: Trip[]): void {
    const byDate = trips.filter((t) => t.tourDate != null);
    this.checkOverlap(byDate, true);
    this.checkOverlap(byDate, false);
  }

  private checkOverlap(trips: Trip[], byDriver: boolean): void {
    for (let i = 0; i < trips.length; i++) {
      const a = trips[i];
      for (let j = i + 1; j < trips.length; j++) {
        const b = trips[j];
        if (a.tourDate !== b.tourDate) continue;
        const keyA = byDriver ? a.driverName : a.vehicleId;
        const keyB = byDriver ? b.driverName : b.vehicleId;
        if (keyA == null || keyB == null || keyA.toLowerCase() !== keyB.toLowerCase()) continue;
        if (this.overlaps(a, b)) {
          const type = byDriver ? `le chauffeur ${keyA}` : `le véhicule ${keyA}`;
          const messageA = `Chevauchement avec le voyage ${b.tripNum} (${type})`;
          const messageB = `Chevauchement avec le voyage ${a.tripNum} (${type})`;
          if (!a.warnings.includes(messageA)) a.warnings.push(messageA);
          if (!b.warnings.includes(messageB)) b.warnings.push(messageB);
        }
      }
    }
  }

  private overlaps(a: Trip, b: Trip): boolean {
    const aStart = parseDateTime(a.plannedDeparture);
    const bStart = parseDateTime(b.plannedDeparture);
    if (aStart == null || bStart == null || a.totalDurationMin == null || b.totalDurationMin == null) {
      return false;
    }
    const aEnd = addMinutes(aStart, Number(a.totalDurationMin));
    const bEnd = addMinutes(bStart, Number(b.totalDurationMin));
    return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
  }

  // ------------------------------------------------------------------
  // Consultation
  // ------------------------------------------------------------------

  async listTrips(date: string | undefined, driver: string | undefined, vehicle: string | undefined, city: string | undefined): Promise<TripSummaryDto[]> {
    const settings = await this.settingsService.get();
    const qb = this.tripRepository
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.plant', 'plant')
      .leftJoinAndSelect('trip.station', 'station')
      .leftJoinAndSelect('trip.lines', 'lines')
      .orderBy('trip.tourDate', 'ASC')
      .addOrderBy('trip.plannedDeparture', 'ASC');

    if (date) {
      const parsed = parseDate(date);
      if (!parsed) throw new BadRequestException(`Invalid date value "${date}"`);
      qb.andWhere('trip.tourDate = :date', { date: formatDate(parsed) });
    }
    if (driver?.trim()) {
      qb.andWhere('LOWER(trip.driverName) LIKE :driver', { driver: `%${driver.toLowerCase()}%` });
    }
    if (vehicle?.trim()) {
      qb.andWhere('LOWER(trip.vehicleId) LIKE :vehicle', { vehicle: `%${vehicle.toLowerCase()}%` });
    }
    if (city?.trim()) {
      qb.andWhere('LOWER(station.city) LIKE :city', { city: `%${city.toLowerCase()}%` });
    }

    const trips = await qb.getMany();
    return trips.map((t) => this.toSummary(t, settings));
  }

  async getDetail(id: number): Promise<TripDetailDto> {
    const trip = await this.tripRepository.findOne({ where: { id } });
    if (!trip) {
      throw new NotFoundException(`Voyage ${id} introuvable`);
    }
    const settings = await this.settingsService.get();

    let geometry: string | null = null;
    if (trip.plant && trip.station) {
      const cache = await this.routeCacheRepository.findOne({
        where: { originId: trip.plant.id, destId: trip.station.id },
      });
      if (cache) geometry = cache.geometry;
    }

    return {
      summary: this.toSummary(trip, settings),
      lines: (trip.lines ?? []).map((l) => ({ id: l.id, materialName: l.materialName, liters: l.liters })),
      plantLat: trip.plant?.lat ?? null,
      plantLon: trip.plant?.lon ?? null,
      plantName: trip.plant?.name ?? null,
      stationLat: trip.station?.lat ?? null,
      stationLon: trip.station?.lon ?? null,
      geocodeSource: trip.station?.geocodeSource ?? null,
      geocodeConfirmed: trip.station?.geocodeConfirmed ?? false,
      routeGeometry: geometry,
    };
  }

  async patch(id: number, request: TripPatchRequest): Promise<TripSummaryDto> {
    const trip = await this.tripRepository.findOne({ where: { id } });
    if (!trip) {
      throw new NotFoundException(`Voyage ${id} introuvable`);
    }
    if (request.plannedDeparture != null) {
      const parsed = parseDateTime(request.plannedDeparture);
      if (!parsed) {
        throw new BadRequestException(`Invalid date-time value "${request.plannedDeparture}"`);
      }
      trip.plannedDeparture = formatDateTime(parsed);
    }
    if (request.driverName?.trim()) {
      trip.driverName = request.driverName.trim();
    }
    if (request.vehicleId?.trim()) {
      trip.vehicleId = request.vehicleId.trim();
    }
    if (request.customerName?.trim()) {
      trip.customerName = request.customerName.trim();
    }
    if (request.tranche != null) {
      trip.tranche = request.tranche;
    }
    if (request.lines != null) {
      const lines: TripLine[] = [];
      for (const line of request.lines) {
        const materialName = normalize(line.materialName);
        const liters = Number(line.liters);
        if (!materialName) throw new BadRequestException('Ligne de produit sans nom (Material Name)');
        if (!Number.isFinite(liters) || liters <= 0) {
          throw new BadRequestException(`Ligne ${materialName} : total (litres) manquant ou nul`);
        }
        lines.push(new TripLine(materialName, liters));
      }
      await this.tripRepository.manager.getRepository(TripLine)
        .createQueryBuilder()
        .delete()
        .where('trip_id = :id', { id })
        .execute();
      trip.lines = lines;
      for (const line of lines) line.trip = trip;
      trip.totalLiters = lines.reduce((sum, l) => sum + l.liters, 0);
    }

    const settings = await this.settingsService.get();
    await this.recalculateTrips([trip], settings);
    const reloaded = await this.tripRepository.findOne({ where: { id } });
    return this.toSummary(reloaded ?? trip, settings);
  }

  // ------------------------------------------------------------------
  // Mapping DTO
  // ------------------------------------------------------------------

  toSummary(t: Trip, settings: PlanningSettings): TripSummaryDto {
    const roundTrip = t.distanceRoundTripKm == null ? 0 : t.distanceRoundTripKm;
    const liters = (roundTrip * settings.fuelConsumptionLPer100) / 100.0;
    const cost = liters * settings.fuelPricePerLiter;

    return {
      id: t.id,
      tripNum: t.tripNum,
      salesOrder: t.salesOrder,
      patDoc: t.patDoc,
      tourDate: t.tourDate,
      vehicleId: t.vehicleId,
      customerName: t.customerName,
      driverName: t.driverName,
      tranche: t.tranche,
      plantName: t.plant?.name ?? null,
      stationId: t.station?.id ?? null,
      stationName: t.station?.name ?? null,
      city: t.station?.city ?? null,
      totalLiters: t.totalLiters,
      status: t.status ?? null,
      plannedDeparture: t.plannedDeparture,
      distanceOneWayKm: t.distanceOneWayKm,
      distanceRoundTripKm: t.distanceRoundTripKm,
      drivingMinOneWay: t.drivingMinOneWay,
      drivingMinRoundTrip: t.drivingMinRoundTrip,
      breakMinutes: t.breakMinutes,
      loadingMinutes: t.loadingMinutes,
      unloadingMinutes: t.unloadingMinutes,
      adminMinutes: t.adminMinutes,
      etaStation: t.etaStation,
      endUnloading: t.endUnloading,
      etaReturnPlant: t.etaReturnPlant,
      totalDurationMin: t.totalDurationMin == null ? null : Number(t.totalDurationMin),
      includeReturn: t.includeReturn,
      fallbackUsed: t.distanceEstimated === true,
      computedAt: t.computedAt,
      warnings: [...(t.warnings ?? [])],
      estimatedFuelLiters: round2(liters),
      estimatedFuelCost: round2(cost),
    };
  }
}

function km(value: number): string {
  return `${value.toFixed(1)} km`;
}

/** Rendu décimal stable (33000 -> "33000.0") pour les messages d'alerte. */
function decimal(value: number): string {
  return Number.isInteger(value) ? `${value.toFixed(1)}` : String(value);
}
