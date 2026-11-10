import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Dépôt (plant) de départ des camions-citernes. */
@Entity('plants')
export class Plant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'double precision', nullable: true })
  lat: number;

  @Column({ type: 'double precision', nullable: true })
  lon: number;

  constructor(name?: string, lat?: number, lon?: number) {
    if (name !== undefined) {
      this.name = name;
      this.lat = lat;
      this.lon = lon;
    }
  }
}
