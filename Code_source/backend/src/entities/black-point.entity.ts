import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Type de point noir, selon la section du document source `samples/Points Noires.pdf`. */
export enum BlackPointKind {
  /** Point noir routier (danger) — tables « Zone / Repère / Nature / Durabilité ». */
  ROAD = 'ROAD',
  /** Zone interdite au stationnement / dépôt — tables « Nom / Zone interdite / Adresse ». */
  FORBIDDEN_ZONE = 'FORBIDDEN_ZONE',
  /** Point noir lié aux risques sûreté (vol, agression, pierres). */
  SECURITY = 'SECURITY',
}

/**
 * Point noir, zone interdite ou point de risque sûreté, extrait du document
 * « Points Noires.pdf » fourni par le management. Rapproché à chaque voyage
 * via les villes (origine dépôt + ville de la station livrée).
 */
@Entity('black_points')
export class BlackPoint {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32 })
  kind: BlackPointKind;

  /** Zone géographique, ex. « Casa », « Bouznika ». */
  @Column({ type: 'varchar', length: 255, nullable: true })
  zone: string;

  /** Repère / emplacement précis, ex. « Autoroute Mohammedia -Berchid ». */
  @Column({ type: 'varchar', length: 512, nullable: true })
  landmark: string;

  /** Nature du risque, ex. « déviation dangereuse », « lancement des pierres ». */
  @Column({ type: 'varchar', length: 512, nullable: true })
  nature: string;

  /** Durabilité, ex. « durable », « temporaire », « saisonnier ». */
  @Column({ type: 'varchar', length: 128, nullable: true })
  durability: string;

  /** Adresse (zones interdites), souvent en arabe dans le PDF. */
  @Column({ type: 'varchar', length: 512, nullable: true })
  address: string;

  /** Numéro de page du PDF d'origine (traçabilité). */
  @Column({ type: 'integer', nullable: true })
  sourcePage: number;

  constructor(init?: Partial<BlackPoint>) {
    if (init) Object.assign(this, init);
  }
}
