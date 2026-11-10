/** Station-service (listage + correction manuelle des coordonnées). */
export interface StationDto {
  id: number;
  name: string;
  city: string | null;
  lat: number | null;
  lon: number | null;
  geocodeSource: string | null;
  geocodeConfirmed: boolean;
  tripsCount: number;
}

/** Correction manuelle des coordonnées d'une station. */
export interface CoordinatesRequest {
  lat?: number;
  lon?: number;
  confirmed?: boolean;
}
