import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GeocodeSource } from '../domain/enums';
import { Station } from '../entities/station.entity';
import { centerOf } from './city-center-fallback';
import { Geocoder, GEOCODER } from './geocoder';
import { GeoPoint } from './geo-point';

/**
 * Géocodage des stations : cache en base, Nominatim puis repli sur le centre-ville.
 * Les coordonnées automatiques restent « non confirmées » tant que l'utilisateur ne les valide pas.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  constructor(
    @InjectRepository(Station) private readonly stationRepository: Repository<Station>,
    @Inject(GEOCODER) private readonly geocoder: Geocoder,
  ) {}

  /** Recherche et mémorise les coordonnées d'une station si celles-ci sont absentes. */
  async locate(station: Station): Promise<Station> {
    if (station.lat != null && station.lon != null) {
      return station;
    }
    const city = station.city ?? '';
    const query = [station.name, city, 'Maroc'].filter((part) => part.trim() !== '').join(', ');

    let point = await this.safeGeocode(query);
    let source = GeocodeSource.NOMINATIM;
    if (point == null) {
      point = centerOf(station.city);
      source = GeocodeSource.CITY_CENTER;
    }
    if (point == null) {
      return this.stationRepository.save(station);
    }
    station.lat = point.lat;
    station.lon = point.lon;
    station.geocodeSource = source;
    station.geocodeConfirmed = false;
    return this.stationRepository.save(station);
  }

  private async safeGeocode(query: string): Promise<GeoPoint | null> {
    try {
      return await this.geocoder.geocode(query);
    } catch (e) {
      this.logger.warn(`Géocodage impossible pour '${query}' : ${(e as Error).message}`);
      return null;
    }
  }
}
