import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeoPoint } from './geo-point';
import { RouteResult } from './route-result';

/** Contrat du calcul d'itinéraire (implémentation production : OSRM). */
export interface OsrmClient {
  route(origin: GeoPoint, destination: GeoPoint): Promise<RouteResult | null>;
}

export const OSRM_CLIENT = 'OSRM_CLIENT';

/**
 * Client OSRM — distance, durée et tracé routiers (profil driving, geometries=polyline).
 */
@Injectable()
export class OsrmRestClient implements OsrmClient {
  private readonly logger = new Logger(OsrmRestClient.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get('OSRM_BASE_URL') ?? 'https://router.project-osrm.org').replace(/\/$/, '');
  }

  async route(origin: GeoPoint, destination: GeoPoint): Promise<RouteResult | null> {
    const coords = `${origin.lon.toFixed(6)},${origin.lat.toFixed(6)};${destination.lon.toFixed(6)},${destination.lat.toFixed(6)}`;
    const url = `${this.baseUrl}/route/v1/driving/${coords}?overview=full&geometries=polyline`;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return this.parse(await res.text());
    } catch (e) {
      this.logger.warn(`Échec du routage OSRM entre ${JSON.stringify(origin)} et ${JSON.stringify(destination)} : ${(e as Error).message}`);
      return null;
    }
  }

  private parse(body: string): RouteResult | null {
    if (!body || !body.trim()) {
      return null;
    }
    let root: any;
    try {
      root = JSON.parse(body);
    } catch {
      return null;
    }
    const routes = root?.routes;
    if (!Array.isArray(routes) || routes.length === 0) {
      return null;
    }
    const route = routes[0];
    const distanceMeters = Number(route.distance ?? 0);
    const durationSeconds = Number(route.duration ?? 0);
    const geometry = route.geometry != null ? String(route.geometry) : null;
    return {
      distanceKm: distanceMeters / 1000.0,
      durationCarMin: Math.round(durationSeconds / 60.0),
      geometry,
      fallbackUsed: false,
    };
  }
}
