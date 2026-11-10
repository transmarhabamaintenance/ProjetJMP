import { TripStatus } from '../domain/enums';

/** Vue liste d'un voyage (champs exposés par l'API). */
export interface TripSummaryDto {
  id: number;
  tripNum: string | null;
  salesOrder: string | null;
  patDoc: string | null;
  tourDate: string | null;
  vehicleId: string | null;
  customerName: string | null;
  driverName: string | null;
  tranche: number | null;
  plantName: string | null;
  stationId: number | null;
  stationName: string | null;
  city: string | null;
  totalLiters: number | null;
  status: string | null;
  plannedDeparture: string | null;
  distanceOneWayKm: number | null;
  distanceRoundTripKm: number | null;
  drivingMinOneWay: number | null;
  drivingMinRoundTrip: number | null;
  breakMinutes: number | null;
  loadingMinutes: number | null;
  unloadingMinutes: number | null;
  adminMinutes: number | null;
  etaStation: string | null;
  endUnloading: string | null;
  etaReturnPlant: string | null;
  totalDurationMin: number | null;
  includeReturn: boolean | null;
  fallbackUsed: boolean;
  computedAt: string | null;
  warnings: string[];
  estimatedFuelLiters: number;
  estimatedFuelCost: number;
}

/** Détail d'un voyage : lignes produit, coordonnées dépôt/station, tracé routier. */
export interface TripDetailDto {
  summary: TripSummaryDto;
  lines: { id: number; materialName: string; liters: number }[];
  plantLat: number | null;
  plantLon: number | null;
  plantName: string | null;
  stationLat: number | null;
  stationLon: number | null;
  geocodeSource: string | null;
  geocodeConfirmed: boolean;
  routeGeometry: string | null;
}

/** Corps de la requête PATCH /api/trips/{id} (dates en texte ISO). */
export interface TripPatchRequest {
  plannedDeparture?: string | null;
  driverName?: string;
  vehicleId?: string;
  customerName?: string;
  tranche?: number | null;
  /** Si présent, remplace la totalité des lignes produit du voyage (saisie manuelle post-import JIT). */
  lines?: { materialName?: string; liters?: number }[];
}

/** Corps de POST /api/trips/recalculate ; ids vide = tous les voyages. */
export interface RecalculateRequest {
  ids?: number[] | null;
}

/**
 * Corps de POST /api/trips : la fiche d'un voyage, colonne par colonne du classeur.
 * dates en texte ISO (tourDate = YYYY-MM-DD, plannedDeparture = YYYY-MM-DDTHH:mm).
 */
export interface TripCreateRequest {
  tourDate?: string;
  tripNum?: string;
  salesOrder?: string;
  patDoc?: string;
  vehicleId?: string;
  customerName?: string;
  driverName?: string;
  plantName?: string;
  shipToName?: string;
  city?: string;
  tranche?: number | null;
  plannedDeparture?: string;
  lines?: { materialName?: string; liters?: number }[];
}

export interface ImportIssueDto {
  level: string;
  lineNumber: number;
  message: string;
}

/** Rapport d'import d'un classeur Excel. */
export interface ImportReportDto {
  trips: number;
  lines: number;
  issues: ImportIssueDto[];
  journeyList: TripSummaryDto[];
}

export interface StatsDto {
  tripsCount: number;
  totalDistanceKm: number;
  totalDurationHours: number;
  litersByProduct: Record<string, number>;
  kmByDriver: Record<string, number>;
  hoursByVehicle: Record<string, number>;
}

export { TripStatus };
