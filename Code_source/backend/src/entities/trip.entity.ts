import {
  Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn,
} from 'typeorm';
import { TripStatus } from '../domain/enums';
import { Plant } from './plant.entity';
import { Station } from './station.entity';
import { TripLine } from './trip-line.entity';

/** Voyage : un camion-citerne qui part d'un dépôt et livre une station-service. */
@Entity('trips')
@Index('idx_trip_date', ['tourDate'])
export class Trip {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  tripNum: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  salesOrder: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  patDoc: string;

  /** YYYY-MM-DD. Indexée : obligatoryement varchar, MySQL refuse d'indexer un TEXT. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  tourDate: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  vehicleId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customerName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  driverName: string;

  @Column({ type: 'integer', nullable: true })
  tranche: number;

  @ManyToOne(() => Plant, { eager: true, nullable: true })
  @JoinColumn({ name: 'plant_id' })
  plant: Plant;

  @ManyToOne(() => Station, { eager: true, nullable: true })
  @JoinColumn({ name: 'station_id' })
  station: Station;

  @Column({ type: 'double precision', nullable: true })
  totalLiters: number;

  @Column({ type: 'varchar', default: TripStatus.IMPORTED })
  status: TripStatus;

  /** YYYY-MM-DDTHH:mm[:ss] */
  @Column({ type: 'varchar', length: 19, nullable: true })
  plannedDeparture: string;

  // ----- Champs calculés par le moteur de planification -----

  @Column({ type: 'double precision', nullable: true })
  distanceOneWayKm: number;

  @Column({ type: 'double precision', nullable: true })
  distanceRoundTripKm: number;

  @Column({ type: 'boolean', nullable: true })
  distanceEstimated: boolean;

  @Column({ type: 'integer', nullable: true })
  drivingMinOneWay: number;

  @Column({ type: 'integer', nullable: true })
  drivingMinRoundTrip: number;

  @Column({ type: 'integer', nullable: true })
  breakMinutes: number;

  @Column({ type: 'integer', nullable: true })
  loadingMinutes: number;

  @Column({ type: 'integer', nullable: true })
  unloadingMinutes: number;

  @Column({ type: 'integer', nullable: true })
  adminMinutes: number;

  @Column({ type: 'varchar', length: 19, nullable: true })
  etaStation: string;

  @Column({ type: 'varchar', length: 19, nullable: true })
  endUnloading: string;

  @Column({ type: 'varchar', length: 19, nullable: true })
  etaReturnPlant: string;

  @Column({ type: 'integer', nullable: true })
  totalDurationMin: number;

  @Column({ type: 'boolean', nullable: true })
  includeReturn: boolean;

  @Column({ type: 'varchar', length: 19, nullable: true })
  computedAt: string;

  @OneToMany(() => TripLine, (line) => line.trip, { cascade: true, eager: true })
  lines: TripLine[];

  @Column({ type: 'simple-json', nullable: true })
  warnings: string[] = [];

  addLine(line: TripLine): void {
    this.lines = this.lines ?? [];
    this.lines.push(line);
    line.trip = this;
  }
}
