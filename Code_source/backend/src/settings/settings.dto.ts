import { DrivingMethod } from '../domain/enums';

/** Paramètres de planification exposés par l'API (GET/PUT /api/settings). */
export interface SettingsDto {
  heavyTruckFactor?: number;
  drivingMethod?: DrivingMethod;
  averageSpeedKmh?: number;
  breakAfterMinutes?: number;
  breakDurationMinutes?: number;
  loadingMinutes?: number;
  unloadingMinutes?: number;
  adminMinutes?: number;
  defaultDepartureTime?: string;
  noNightDriving?: boolean;
  nightStart?: string;
  nightEnd?: string;
  maxDrivingMinutesPerDay?: number;
  includeReturn?: boolean;
  standardTankLiters?: number;
  fuelConsumptionLPer100?: number;
  fuelPricePerLiter?: number;
}
