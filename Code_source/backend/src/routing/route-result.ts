/**
 * Résultat du calcul routier entre un dépôt et une station.
 * distanceKm : distance routière (ou estimation Haversine×1,3 si repli)
 * durationCarMin : durée OSRM profil voiture, null si repli
 * geometry : polyligne encodée, null si repli
 */
export interface RouteResult {
  distanceKm: number | null;
  durationCarMin: number | null;
  geometry: string | null;
  fallbackUsed: boolean;
}

export function notRoutable(): RouteResult {
  return { distanceKm: null, durationCarMin: null, geometry: null, fallbackUsed: false };
}

export function fallback(distanceKm: number): RouteResult {
  return { distanceKm, durationCarMin: null, geometry: null, fallbackUsed: true };
}
