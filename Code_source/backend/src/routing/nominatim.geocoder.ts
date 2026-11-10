import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeoPoint } from './geo-point';
import { Geocoder } from './geocoder';

/**
 * Géocodage via Nominatim (OpenStreetMap).
 * Respecte la politique d'usage : User-Agent identifiant et au plus 1 requête/s.
 */
@Injectable()
export class NominatimGeocoder implements Geocoder {
  private readonly logger = new Logger(NominatimGeocoder.name);
  private readonly url: string;

  constructor(config: ConfigService) {
    this.url = config.get('NOMINATIM_URL') ?? 'https://nominatim.openstreetmap.org/search';
  }

  async geocode(query: string): Promise<GeoPoint | null> {
    const requestUrl = `${this.url}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=ma`;
    try {
      const start = Date.now();
      const res = await fetch(requestUrl, {
        headers: {
          'User-Agent': 'JMP-Planner/0.0.1 (projet pédagogique ENAA)',
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const body = await res.text();
      const elapsed = Date.now() - start;
      await this.sleepToRespectRateLimit(elapsed);
      return this.parse(body);
    } catch (e) {
      this.logger.warn(`Échec du géocodage Nominatim pour '${query}' : ${(e as Error).message}`);
      return null;
    }
  }

  private parse(body: string): GeoPoint | null {
    if (!body || !body.trim()) {
      return null;
    }
    let root: unknown;
    try {
      root = JSON.parse(body);
    } catch {
      return null;
    }
    if (!Array.isArray(root) || root.length === 0) {
      return null;
    }
    const first = root[0] as { lat?: unknown; lon?: unknown };
    if (first?.lat != null && first?.lon != null) {
      return { lat: Number(first.lat), lon: Number(first.lon) };
    }
    return null;
  }

  private sleepToRespectRateLimit(elapsedMs: number): Promise<void> {
    const remaining = 1000 - elapsedMs;
    return remaining > 0 ? new Promise((resolve) => setTimeout(resolve, remaining)) : Promise.resolve();
  }
}
