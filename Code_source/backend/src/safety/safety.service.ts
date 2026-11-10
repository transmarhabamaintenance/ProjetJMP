import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { BlackPoint } from '../entities/black-point.entity';
import { RestStop } from '../entities/rest-stop.entity';
import { parseRestStopsWorkbook } from './rest-stops.parser';
import { parseBlackPointsPdf } from './black-points.parser';
import { blackPointMatches, routeMatches } from './city-matcher';

/** Rapport d'import des données de sûreté (points noirs + stations de repos). */
export interface SafetyImportReport {
  restStops: number;
  blackPoints: number;
  byKind: Record<string, number>;
  source: string;
}

/** Résultat du rapprochement d'un voyage avec les données de sûreté. */
export interface TripSafetyMatch {
  restStops: RestStop[];
  blackPoints: BlackPoint[];
}

/**
 * Charge les stations de repos (classeur .xls) et les points noirs (PDF) fournis par le
 * management, les stocke en base, et les rapproche de chaque voyage par ville.
 * Source par défaut : le dossier `samples/` à la racine du dépôt.
 */
@Injectable()
export class SafetyService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SafetyService.name);

  constructor(
    @InjectRepository(RestStop) private readonly restStopRepository: Repository<RestStop>,
    @InjectRepository(BlackPoint) private readonly blackPointRepository: Repository<BlackPoint>,
  ) {}

  /** Dossier `samples/` à la racine du dépôt (relatif au backend). */
  private samplesDir(): string {
    return path.resolve(__dirname, '..', '..', '..', 'samples');
  }

  /** Importe automatiquement les fichiers de `samples/` si les tables sont vides. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const restCount = await this.restStopRepository.count();
      const blackCount = await this.blackPointRepository.count();
      if (restCount > 0 || blackCount > 0) return; // déjà initialisé
      const report = await this.importFromSamples();
      this.logger.log(
        `Données de sûreté importées : ${report.restStops} stations de repos, ` +
          `${report.blackPoints} points noirs (${report.source})`,
      );
    } catch (err) {
      this.logger.warn(
        `Import initial des données de sûreté impossible (${(err as Error).message}). ` +
          'Utilisez POST /api/safety/import une fois le serveur démarré.',
      );
    }
  }

  /** Recharge les deux fichiers depuis `samples/` et remplace le contenu des tables. */
  async importFromSamples(): Promise<SafetyImportReport> {
    const dir = this.samplesDir();
    if (!fs.existsSync(dir)) {
      throw new Error(`Dossier introuvable : ${dir}`);
    }
    const entries = fs.readdirSync(dir);
    const xls = entries.find((f) => f.toLowerCase().endsWith('.xls') && !f.toLowerCase().endsWith('.xlsx'));
    const xlsx = entries.find((f) => f.toLowerCase().endsWith('.xlsx'));
    const pdf = entries.find((f) => f.toLowerCase().endsWith('.pdf') && /point/i.test(f));
    const pdfFallback = pdf ?? entries.find((f) => f.toLowerCase().endsWith('.pdf'));

    if (!xls && !xlsx) throw new Error(`Aucun classeur de stations de repos (.xls/.xlsx) dans ${dir}`);
    if (!pdfFallback) throw new Error(`Aucun document de points noirs (.pdf) dans ${dir}`);

    const xlsPath = path.join(dir, xls ?? xlsx!);
    const pdfPath = path.join(dir, pdfFallback);

    const restStops = parseRestStopsWorkbook(fs.readFileSync(xlsPath));
    const blackPoints = await parseBlackPointsPdf(fs.readFileSync(pdfPath));

    await this.replaceData(restStops, blackPoints);
    return this.buildReport(restStops, blackPoints, path.basename(xlsPath) + ' + ' + path.basename(pdfPath));
  }

  /** Remplace le contenu des tables (transactionnel) par les données analysées. */
  private async replaceData(restStops: RestStop[], blackPoints: BlackPoint[]): Promise<void> {
    await this.restStopRepository.manager.transaction(async (em) => {
      await em.clear(RestStop);
      await em.clear(BlackPoint);
      if (restStops.length) await em.save(RestStop, restStops);
      if (blackPoints.length) await em.save(BlackPoint, blackPoints);
    });
  }

  private buildReport(restStops: RestStop[], blackPoints: BlackPoint[], source: string): SafetyImportReport {
    const byKind: Record<string, number> = {};
    for (const bp of blackPoints) byKind[bp.kind] = (byKind[bp.kind] ?? 0) + 1;
    return { restStops: restStops.length, blackPoints: blackPoints.length, byKind, source };
  }

  /** Compteurs rapides pour le contrôle. */
  async counts(): Promise<{ restStops: number; blackPoints: number }> {
    return {
      restStops: await this.restStopRepository.count(),
      blackPoints: await this.blackPointRepository.count(),
    };
  }

  /**
   * Rapproche un voyage (ville d'origine = dépôt, ville de la station livrée) des stations
   * de repos et des points noirs correspondants, par correspondance de villes.
   */
  async matchForTrip(originCity: string | undefined, destinationCity: string | undefined): Promise<TripSafetyMatch> {
    if (!destinationCity && !originCity) return { restStops: [], blackPoints: [] };

    const [allStops, allPoints] = await Promise.all([
      this.restStopRepository.find(),
      this.blackPointRepository.find(),
    ]);

    const restStops = allStops.filter((s) => routeMatches(s.trajet, originCity, destinationCity));
    const blackPoints = allPoints.filter((bp) =>
      blackPointMatches([bp.zone, bp.landmark, bp.address], originCity, destinationCity),
    );
    return { restStops, blackPoints };
  }
}
