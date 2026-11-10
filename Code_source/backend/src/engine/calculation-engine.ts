import { DrivingMethod } from '../domain/enums';
import { PlanningSettings } from '../entities/planning-settings.entity';
import { addMinutes, atStartOfDay, hoursMinutesOf, minutesBetween, parseHm } from '../common/datetime';

export const NIGHT_WARNING = 'Conduite de nuit détectée';

/**
 * Moteur de calcul de planification JMP.
 *
 * Règles de pause : une pause est ajoutée après chaque bloc de conduite cumulée de
 * breakAfterMinutes, sauf si le reliquat de conduite est inférieur au seuil.
 */

export interface PlanInput {
  distanceOneWayKm: number;
  routeDurationCarMin: number | null;
  /** Date du tour (ancre le départ proposé automatiquement). */
  tourDate: Date;
  /** Heure de départ demandée (null = proposer automatiquement). */
  departure: Date | null;
  settings: PlanningSettings;
}

export interface PlanResult {
  distanceOneWayKm: number;
  distanceRoundTripKm: number;
  drivingMinOneWay: number;
  drivingMinRoundTrip: number;
  breakMinutes: number;
  loadingMinutes: number;
  unloadingMinutes: number;
  adminMinutes: number;
  plannedDeparture: Date;
  etaStation: Date;
  endUnloading: Date;
  etaReturnPlant: Date;
  totalDurationMin: number;
  warnings: string[];
}

export class CalculationEngine {
  /** Durée de conduite aller (min) : OSRM × coefficient poids lourd, sinon distance / vitesse moyenne. */
  drivingMinutesOneWay(distanceKm: number, routeDurationCarMin: number | null, s: PlanningSettings): number {
    if (s.drivingMethod === DrivingMethod.OSRM && routeDurationCarMin != null) {
      return Math.round(routeDurationCarMin * s.heavyTruckFactor);
    }
    const speed = s.averageSpeedKmh != null ? s.averageSpeedKmh : 65.0;
    return Math.ceil((distanceKm / speed) * 60.0);
  }

  /** Nombre de pauses pour une durée de conduite donnée. */
  breakCount(drivingMinutes: number, s: PlanningSettings): number {
    const threshold = s.breakAfterMinutes;
    const fullBlocks = Math.ceil(drivingMinutes / threshold);
    return Math.max(0, fullBlocks - 1);
  }

  /** Heure de départ effective : fournie, sinon défaut, sinon départ évitant la nuit. */
  resolveDeparture(
    departure: Date | null, tourDate: Date,
    distanceOneWayKm: number, routeDurationCarMin: number | null, s: PlanningSettings,
  ): Date {
    if (departure != null) {
      return departure;
    }
    const defaultTime = parseHm(s.defaultDepartureTime);
    if (!s.noNightDriving) {
      return this.atMinuteOfDay(tourDate, defaultTime);
    }
    return this.earliestNightFreeDeparture(tourDate, distanceOneWayKm, routeDurationCarMin, s);
  }

  /** Départ le plus tôt (créneau de 30 min entre 00:00 et 23:30) qui évite la conduite de nuit. */
  earliestNightFreeDeparture(
    tourDate: Date, distanceOneWayKm: number, routeDurationCarMin: number | null, s: PlanningSettings,
  ): Date {
    for (let minuteOfDay = 0; minuteOfDay < 24 * 60; minuteOfDay += 30) {
      const candidate = addMinutes(atStartOfDay(tourDate), minuteOfDay);
      if (!this.hasNightDriving(candidate, distanceOneWayKm, routeDurationCarMin, s)) {
        return candidate;
      }
    }
    return this.atMinuteOfDay(tourDate, parseHm(s.defaultDepartureTime));
  }

  /** Le voyage (aller + retour le cas échéant) comporte-t-il un segment de conduite de nuit ? */
  hasNightDriving(
    departure: Date, distanceOneWayKm: number, routeDurationCarMin: number | null, s: PlanningSettings,
  ): boolean {
    const drivingOneWay = this.drivingMinutesOneWay(distanceOneWayKm, routeDurationCarMin, s);
    const breaksOneWay = this.breakCount(drivingOneWay, s) * s.breakDurationMinutes;

    const driveStart = addMinutes(departure, s.adminMinutes);
    const etaStation = addMinutes(driveStart, drivingOneWay + breaksOneWay);
    if (this.overlapsNight(driveStart, etaStation, s)) {
      return true;
    }
    if (s.includeReturn) {
      const breaksReturn = this.breakCount(drivingOneWay, s) * s.breakDurationMinutes;
      const etaReturn = addMinutes(etaStation, s.unloadingMinutes + drivingOneWay + breaksReturn);
      return this.overlapsNight(addMinutes(etaStation, s.unloadingMinutes), etaReturn, s);
    }
    return false;
  }

  /** Exécute le calcul complet d'un voyage. */
  calculate(input: PlanInput): PlanResult {
    const s = input.settings;
    const warnings: string[] = [];

    const drivingOneWay = this.drivingMinutesOneWay(input.distanceOneWayKm, input.routeDurationCarMin, s);
    const breaksOneWay = this.breakCount(drivingOneWay, s) * s.breakDurationMinutes;

    const departure = this.resolveDeparture(
      input.departure, input.tourDate, input.distanceOneWayKm, input.routeDurationCarMin, s,
    );

    const driveStart = addMinutes(departure, s.adminMinutes);
    const etaStation = addMinutes(driveStart, drivingOneWay + breaksOneWay);
    const endUnloading = addMinutes(etaStation, s.unloadingMinutes);

    let drivingReturn = 0;
    let breaksReturn = 0;
    let etaReturn = endUnloading;
    let distanceRoundTrip = input.distanceOneWayKm;
    if (s.includeReturn) {
      drivingReturn = drivingOneWay;
      breaksReturn = this.breakCount(drivingOneWay, s) * s.breakDurationMinutes;
      etaReturn = addMinutes(endUnloading, drivingReturn + breaksReturn);
      distanceRoundTrip = input.distanceOneWayKm * 2;
    }

    this.checkWarnings(input, s, departure, driveStart, etaStation, endUnloading, etaReturn,
      drivingOneWay + drivingReturn, warnings);

    return {
      distanceOneWayKm: round2(input.distanceOneWayKm),
      distanceRoundTripKm: round2(distanceRoundTrip),
      drivingMinOneWay: drivingOneWay,
      drivingMinRoundTrip: drivingOneWay + drivingReturn,
      breakMinutes: breaksOneWay + breaksReturn,
      loadingMinutes: s.loadingMinutes,
      unloadingMinutes: s.unloadingMinutes,
      adminMinutes: s.adminMinutes,
      plannedDeparture: departure,
      etaStation,
      endUnloading,
      etaReturnPlant: etaReturn,
      totalDurationMin: Math.floor((etaReturn.getTime() - departure.getTime()) / 60_000),
      warnings: [...warnings],
    };
  }

  private checkWarnings(
    input: PlanInput, s: PlanningSettings, departure: Date, driveStart: Date, etaStation: Date,
    endUnloading: Date, etaReturn: Date, drivingTotal: number, warnings: string[],
  ): void {
    if (drivingTotal > s.maxDrivingMinutesPerDay) {
      warnings.push(
        `Conduite journalière de ${Math.floor(drivingTotal / 60)} h ${drivingTotal % 60} min ` +
        `supérieure à la limite de ${Math.floor(s.maxDrivingMinutesPerDay / 60)} h`,
      );
    }
    if (this.overlapsNight(driveStart, etaStation, s)) {
      warnings.push(`${NIGHT_WARNING} sur le trajet aller`);
    }
    if (s.includeReturn && this.overlapsNight(endUnloading, etaReturn, s)) {
      warnings.push(`${NIGHT_WARNING} sur le trajet retour`);
    }
    if (input.departure == null && s.noNightDriving
      && this.hasNightDriving(departure, input.distanceOneWayKm, input.routeDurationCarMin, s)) {
      warnings.push("Aucun départ n'évite entièrement la conduite de nuit ; départ par défaut retenu");
    }
  }

  /** Un segment [start, end] traverse-t-il la plage de nuit configurée ? */
  overlapsNight(start: Date, end: Date, s: PlanningSettings): boolean {
    const nightStart = parseHm(s.nightStart);
    const nightEnd = parseHm(s.nightEnd);
    const crossesMidnight = nightEnd <= nightStart; // nuit type 21:00 -> 05:00

    const startMin = hoursMinutesOf(start);
    const endMin = hoursMinutesOf(end);
    const segmentCrossesMidnight = end.getDate() !== start.getDate();

    if (!crossesMidnight) {
      // Plage de nuit dans une même journée civile [nightStart, nightEnd]
      if (segmentCrossesMidnight) {
        // Segment [startMin, 24:00] U [0, endMin]
        return startMin < nightEnd || endMin > nightStart;
      }
      return startMin < nightEnd && endMin > nightStart;
    }
    // Plage de nuit chevauchant minuit [nightStart, 24:00] U [0, nightEnd]
    if (segmentCrossesMidnight) return true; // le segment couvre minuit, la nuit aussi
    return endMin > nightStart || startMin < nightEnd;
  }

  private isNight(dt: Date, s: PlanningSettings): boolean {
    const time = hoursMinutesOf(dt);
    const start = parseHm(s.nightStart);
    const end = parseHm(s.nightEnd);
    if (end > start) {
      return time >= start && time < end;
    }
    // plage chevauchant minuit (ex. 21:00 -> 05:00)
    return time >= start || time < end;
  }

  private atMinuteOfDay(day: Date, minuteOfDay: number): Date {
    return addMinutes(atStartOfDay(day), minuteOfDay);
  }
}

export function round2(value: number): number {
  return Math.round(value * 100.0) / 100.0;
}
