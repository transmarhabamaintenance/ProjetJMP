import { GeoPoint } from './geo-point';

const EARTH_RADIUS_KM = 6371.0;

/** Distance à vol d'oiseau (Haversine), repli si OSRM est indisponible. */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Estimation routière : distance à vol d'oiseau × facteur de sinuosité 1,3. */
export function estimateRoadKm(a: GeoPoint, b: GeoPoint): number {
  return distanceKm(a, b) * 1.3;
}
