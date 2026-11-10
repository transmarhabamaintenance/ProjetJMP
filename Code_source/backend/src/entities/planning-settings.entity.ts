import { Column, Entity, PrimaryColumn } from 'typeorm';
import { DrivingMethod } from '../domain/enums';

/** Paramètres globaux de planification (ligne unique id = 1). */
@Entity('planning_settings')
export class PlanningSettings {
  @PrimaryColumn()
  id: number = 1;

  /** Coefficient appliqué à la durée routière voiture pour un camion. */
  @Column({ type: 'double precision', default: 1.25 })
  heavyTruckFactor: number = 1.25;

  /** Mode de calcul de la durée de conduite. */
  @Column({ type: 'varchar', default: DrivingMethod.OSRM })
  drivingMethod: DrivingMethod = DrivingMethod.OSRM;

  /** Vitesse moyenne fixe (km/h) utilisée si la conduite n'est pas calculée via OSRM. */
  @Column({ type: 'double precision', default: 65.0 })
  averageSpeedKmh: number = 65.0;

  /** Durée de conduite cumulée (minutes) après laquelle une pause est obligatoire. */
  @Column({ default: 270 })
  breakAfterMinutes: number = 270;

  /** Durée d'une pause (minutes). */
  @Column({ default: 45 })
  breakDurationMinutes: number = 45;

  /** Temps de chargement au dépôt (minutes). */
  @Column({ default: 60 })
  loadingMinutes: number = 60;

  /** Temps de déchargement à la station (minutes). */
  @Column({ default: 60 })
  unloadingMinutes: number = 60;

  /** Temps administratif au dépôt avant départ (minutes). */
  @Column({ default: 15 })
  adminMinutes: number = 15;

  /** Heure de départ par défaut (HH:mm). */
  @Column({ default: '06:00' })
  defaultDepartureTime: string = '06:00';

  /** Interdire la conduite de nuit. */
  @Column({ default: false })
  noNightDriving: boolean = false;

  /** Début de la plage de nuit (HH:mm). */
  @Column({ default: '21:00' })
  nightStart: string = '21:00';

  /** Fin de la plage de nuit (HH:mm). */
  @Column({ default: '05:00' })
  nightEnd: string = '05:00';

  /** Limite de conduite journalière (minutes). */
  @Column({ default: 540 })
  maxDrivingMinutesPerDay: number = 540;

  /** Inclure le retour au dépôt dans le calcul. */
  @Column({ default: true })
  includeReturn: boolean = true;

  /** Capacité nominale d'un camion-citerne (litres). */
  @Column({ type: 'double precision', default: 33000.0 })
  standardTankLiters: number = 33000.0;

  /** Consommation moyenne d'un camion (L/100 km). */
  @Column({ type: 'double precision', default: 38.0 })
  fuelConsumptionLPer100: number = 38.0;

  /** Prix du litre de gasoil (MAD). */
  @Column({ type: 'double precision', default: 13.5 })
  fuelPricePerLiter: number = 13.5;
}
