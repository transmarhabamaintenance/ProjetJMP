import { GeoPoint } from './geo-point';

/** Contrat de géocodage (production : Nominatim ; les tests fournissent une implémentation factice). */
export interface Geocoder {
  geocode(query: string): Promise<GeoPoint | null>;
}

export const GEOCODER = 'GEOCODER';
