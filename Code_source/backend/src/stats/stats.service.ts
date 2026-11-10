import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { today } from '../common/datetime';
import { Trip } from '../entities/trip.entity';
import { materialKey } from '../importer/material-normalizer';
import { StatsDto } from '../trips/trips.dto';

/** Statistiques du jour à partir des voyages planifiés. */
@Injectable()
export class StatsService {
  constructor(@InjectRepository(Trip) private readonly tripRepository: Repository<Trip>) {}

  async stats(date?: string): Promise<StatsDto> {
    const day = date ? date : formatDateOrNull(today());
    const trips = await this.tripRepository.find({
      where: { tourDate: day },
      order: { id: 'ASC' },
    });

    let totalDistance = 0;
    let totalDurationMin = 0;
    const litersByProduct = new Map<string, number>();
    const kmByDriver: Record<string, number> = {};
    const hoursByVehicle: Record<string, number> = {};

    for (const trip of trips) {
      totalDistance += trip.distanceRoundTripKm ?? 0;
      totalDurationMin += trip.totalDurationMin == null ? 0 : Number(trip.totalDurationMin);

      if (trip.driverName != null) {
        kmByDriver[trip.driverName] = (kmByDriver[trip.driverName] ?? 0) + (trip.distanceRoundTripKm ?? 0);
      }
      if (trip.vehicleId != null) {
        hoursByVehicle[trip.vehicleId] = (hoursByVehicle[trip.vehicleId] ?? 0)
          + (trip.totalDurationMin == null ? 0 : Number(trip.totalDurationMin)) / 60.0;
      }
      for (const line of trip.lines ?? []) {
        const key = materialKey(line.materialName);
        if (key != null) {
          const existing = [...litersByProduct.keys()].find((label) => materialKey(label) === key);
          const label = existing ?? line.materialName;
          litersByProduct.set(label, (litersByProduct.get(label) ?? 0) + (line.liters ?? 0));
        }
      }
    }

    return {
      tripsCount: trips.length,
      totalDistanceKm: round2(totalDistance),
      totalDurationHours: Math.round(totalDurationMin / 60.0),
      litersByProduct: Object.fromEntries(litersByProduct),
      kmByDriver,
      hoursByVehicle,
    };
  }
}

function formatDateOrNull(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function round2(value: number): number {
  return Math.round(value * 100.0) / 100.0;
}
