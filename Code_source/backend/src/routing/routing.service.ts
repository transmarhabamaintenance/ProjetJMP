import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plant } from '../entities/plant.entity';
import { RouteCache } from '../entities/route-cache.entity';
import { Station } from '../entities/station.entity';
import { formatDateTime } from '../common/datetime';
import { GeoPoint } from './geo-point';
import { OsrmClient, OSRM_CLIENT } from './osrm.client';
import * as haversine from './haversine';
import { fallback, notRoutable, RouteResult } from './route-result';

/**
 * Calcul distance/durée/tracé dépôt -> station, mis en cache en base.
 * Repli sur la distance à vol d'oiseau × 1,3 si OSRM est indisponible.
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    @InjectRepository(RouteCache) private readonly routeCacheRepository: Repository<RouteCache>,
    @Inject(OSRM_CLIENT) private readonly osrmClient: OsrmClient,
  ) {}

  async route(plant: Plant | null, station: Station | null): Promise<RouteResult> {
    if (!plant || !station || plant.lat == null || plant.lon == null || station.lat == null || station.lon == null) {
      return notRoutable();
    }

    const cached = await this.routeCacheRepository.findOne({ where: { originId: plant.id, destId: station.id } });
    if (cached) {
      return {
        distanceKm: cached.distanceKm,
        durationCarMin: cached.durationMin,
        geometry: cached.geometry,
        fallbackUsed: false,
      };
    }

    const origin: GeoPoint = { lat: plant.lat, lon: plant.lon };
    const destination: GeoPoint = { lat: station.lat, lon: station.lon };

    const result = await this.osrmClient.route(origin, destination);
    if (result && result.distanceKm != null) {
      await this.saveCache(plant, station, result);
      return result;
    }

    const estimate = haversine.estimateRoadKm(origin, destination);
    this.logger.warn(
      `OSRM indisponible pour '${plant.name}' -> '${station.name}', estimation à vol d'oiseau ×1,3 = ${estimate} km`,
    );
    return fallback(estimate);
  }

  private async saveCache(plant: Plant, station: Station, result: RouteResult): Promise<void> {
    const cache = new RouteCache();
    cache.originId = plant.id;
    cache.destId = station.id;
    cache.distanceKm = result.distanceKm;
    cache.durationMin = result.durationCarMin;
    cache.geometry = result.geometry;
    cache.computedAt = formatDateTime(new Date());
    await this.routeCacheRepository.save(cache);
  }
}
