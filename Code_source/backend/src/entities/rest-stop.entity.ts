import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Station-service d'autoroute / aire de repos autorisée (ou interdite) pour le repos
 * et le repos de nuit des camions-citernes.
 * Issue du classeur `samples/تحليل محطات الاستراحة.xls` (feuilles « AIRES AUTO »
 * et « تحليل محطات الاستراحة »).
 */
@Entity('rest_stops')
export class RestStop {
  @PrimaryGeneratedColumn()
  id: number;

  /** Trajet concerné, ex. « MOHAMMEDIA-JERF-SAFI ». Clé de rapprochement par villes. */
  @Column({ type: 'varchar', length: 255 })
  trajet: string;

  /** Nom de l'aire / de la station, ex. « CEPSA », « SHELL (Entrée SAFI) ». */
  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** Point de repos autorisé (colonne « point de repos ( Oui) »). */
  @Column({ default: false })
  restAllowed: boolean;

  /** Repos de nuit autorisé (colonne « Repos de nuit ( Oui) »). */
  @Column({ default: false })
  nightAllowed: boolean;

  /** PK approximatif si présent, ex. « PK 45 », « A2 - PK 65 ». */
  @Column({ type: 'varchar', length: 64, nullable: true })
  pk: string;

  /** Usage recommandé (arabe), feuille d'analyse. */
  @Column({ type: 'varchar', length: 512, nullable: true })
  recommendedUse: string;

  /** Analyse mouvement / risques (arabe), feuille d'analyse. */
  @Column({ type: 'text', nullable: true })
  analysis: string;

  /** Valable pour nuitée selon l'analyse (arabe : نعم / لا). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  validForNight: string;

  /** Nom de la feuille d'origine dans le classeur. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  sourceSheet: string;

  /**
   * Sens de trajet de l'aire : `ALLER` ou `RETOUR`, lu dans « المسار وعلاقته بالاتجاه »
   * (الذهاب / الإياب). Null quand le classeur ne précise pas le sens.
   */
  @Column({ type: 'varchar', length: 8, nullable: true })
  direction: string;

  constructor(init?: Partial<RestStop>) {
    if (init) Object.assign(this, init);
  }
}
