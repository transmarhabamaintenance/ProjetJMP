export type DrivingMethod = 'OSRM' | 'AVERAGE_SPEED';

export interface TripLine {
  id: number;
  materialName: string;
  liters: number;
}

export interface TripSummary {
  id: number;
  tripNum: string;
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
  totalLiters: number;
  status: string;
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
  estimatedFuelLiters: number | null;
  estimatedFuelCost: number | null;
}

export interface TripDetail {
  summary: TripSummary;
  lines: TripLine[];
  plantLat: number | null;
  plantLon: number | null;
  plantName: string | null;
  stationLat: number | null;
  stationLon: number | null;
  geocodeSource: string | null;
  geocodeConfirmed: boolean;
  routeGeometry: string | null;
}

export interface ImportIssue {
  level: string;
  lineNumber: number | null;
  message: string;
}

export interface ImportReport {
  trips: number;
  lines: number;
  issues: ImportIssue[];
  journeyList: TripSummary[];
}

export interface Stats {
  tripsCount: number;
  totalDistanceKm: number;
  totalDurationHours: number;
  litersByProduct: Record<string, number>;
  kmByDriver: Record<string, number>;
  hoursByVehicle: Record<string, number>;
}

export interface Settings {
  heavyTruckFactor: number;
  drivingMethod: DrivingMethod;
  averageSpeedKmh: number;
  breakAfterMinutes: number;
  breakDurationMinutes: number;
  loadingMinutes: number;
  unloadingMinutes: number;
  adminMinutes: number;
  defaultDepartureTime: string;
  noNightDriving: boolean;
  nightStart: string;
  nightEnd: string;
  maxDrivingMinutesPerDay: number;
  includeReturn: boolean;
  standardTankLiters: number;
  fuelConsumptionLPer100: number;
  fuelPricePerLiter: number;
}

export interface Station {
  id: number;
  name: string;
  city: string;
  lat: number | null;
  lon: number | null;
  geocodeSource: string | null;
  geocodeConfirmed: boolean;
  tripsCount: number;
}

export interface TripCreateRequest {
  tourDate: string;
  tripNum?: string;
  salesOrder?: string;
  patDoc?: string;
  vehicleId?: string;
  customerName?: string;
  driverName?: string;
  plantName: string;
  shipToName: string;
  city?: string;
  tranche?: number | null;
  plannedDeparture?: string;
  lines: { materialName: string; liters: number }[];
}

export type UserRole = 'USER' | 'ADMIN';

export interface UserDto {
  id: number;
  username: string;
  fullName: string | null;
  role: UserRole;
}

export interface LoginResponse {
  token: string;
  user: UserDto;
}

export interface TripPatchRequest {
  plannedDeparture?: string | null;
  driverName?: string | null;
  vehicleId?: string | null;
  customerName?: string | null;
  tranche?: number | null;
  lines?: { materialName?: string; liters?: number }[];
}

export interface SafetyImportReport {
  restStops: number;
  blackPoints: number;
  byKind: Record<string, number>;
  source: string;
}

export interface SafetyCounts {
  restStops: number;
  blackPoints: number;
}