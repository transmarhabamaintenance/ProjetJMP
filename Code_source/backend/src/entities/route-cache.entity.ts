import { Column, ColumnType, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** MySQL a besoin de MEDIUMTEXT (les polylignes OSRM dépassent 64 Ko) ; SQLite ne connaît que TEXT. */
const geometryType: ColumnType = process.env.DB_DRIVER === 'sqljs' ? 'text' : 'mediumtext';

/** Cache des résultats de routage OSRM dépôt -> station. */
@Entity('route_cache')
@Unique('uk_route_origin_dest', ['originId', 'destId'])
export class RouteCache {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  originId: number;

  @Column()
  destId: number;

  @Column({ type: 'double precision', nullable: true })
  distanceKm: number;

  @Column({ type: 'integer', nullable: true })
  durationMin: number;

  @Column({ type: geometryType, nullable: true })
  geometry: string;

  @Column({ type: 'varchar', length: 19, nullable: true })
  computedAt: string;
}
