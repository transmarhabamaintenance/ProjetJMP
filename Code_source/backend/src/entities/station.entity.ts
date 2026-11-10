import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { GeocodeSource } from '../domain/enums';

/** Station-service Shell de livraison. */
@Entity('stations')
export class Station {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  city: string;

  @Column({ type: 'double precision', nullable: true })
  lat: number;

  @Column({ type: 'double precision', nullable: true })
  lon: number;

  @Column({ type: 'varchar', nullable: true })
  geocodeSource: GeocodeSource;

  @Column({ default: false })
  geocodeConfirmed: boolean;

  constructor(name?: string, city?: string) {
    if (name !== undefined) {
      this.name = name;
      this.city = city;
      this.geocodeSource = GeocodeSource.CITY_CENTER;
      this.geocodeConfirmed = false;
    }
  }
}
