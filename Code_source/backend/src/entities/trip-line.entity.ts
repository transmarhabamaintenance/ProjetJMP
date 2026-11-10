import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Trip } from './trip.entity';

/** Ligne de chargement d'un voyage (produit + litres). */
@Entity('trip_lines')
export class TripLine {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Trip, (trip) => trip.lines, { nullable: false })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @Column()
  materialName: string;

  @Column({ type: 'double precision' })
  liters: number;

  /**
   * « Ship To Name » de la ligne quand le classeur en mentionne un différent de celui du
   * voyage : un même camion/chauffeur qui livre plusieurs stations a plusieurs clients.
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  shipToName: string;

  /** Ville de livraison de la ligne, quand la ligne a son propre Ship To. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  city: string;

  constructor(materialName?: string, liters?: number, shipToName?: string | null, city?: string | null) {
    if (materialName !== undefined) {
      this.materialName = materialName;
      this.liters = liters;
    }
    this.shipToName = shipToName ?? null;
    this.city = city ?? null;
  }
}
