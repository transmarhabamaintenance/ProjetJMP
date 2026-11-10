import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlanningSettings } from '../entities/planning-settings.entity';
import { SettingsDto } from './settings.dto';

/** Lecture/mise à jour des paramètres globaux (ligne unique id = 1). */
@Injectable()
export class SettingsService {
  constructor(@InjectRepository(PlanningSettings) private readonly repository: Repository<PlanningSettings>) {}

  async get(): Promise<PlanningSettings> {
    const found = await this.repository.findOne({ where: { id: 1 } });
    if (found) return found;
    return this.repository.save(new PlanningSettings());
  }

  async getDto(): Promise<SettingsDto> {
    return this.toDto(await this.get());
  }

  async update(dto: SettingsDto): Promise<SettingsDto> {
    const settings = await this.get();
    this.apply(settings, dto);
    await this.repository.save(settings);
    return this.toDto(settings);
  }

  private apply(s: PlanningSettings, dto: SettingsDto): void {
    const fields: (keyof SettingsDto)[] = [
      'heavyTruckFactor', 'drivingMethod', 'averageSpeedKmh', 'breakAfterMinutes', 'breakDurationMinutes',
      'loadingMinutes', 'unloadingMinutes', 'adminMinutes', 'defaultDepartureTime', 'noNightDriving',
      'nightStart', 'nightEnd', 'maxDrivingMinutesPerDay', 'includeReturn', 'standardTankLiters',
      'fuelConsumptionLPer100', 'fuelPricePerLiter',
    ];
    for (const field of fields) {
      if (dto[field] !== undefined && dto[field] !== null) {
        (s as any)[field] = dto[field];
      }
    }
  }

  private toDto(s: PlanningSettings): SettingsDto {
    return {
      heavyTruckFactor: s.heavyTruckFactor,
      drivingMethod: s.drivingMethod,
      averageSpeedKmh: s.averageSpeedKmh,
      breakAfterMinutes: s.breakAfterMinutes,
      breakDurationMinutes: s.breakDurationMinutes,
      loadingMinutes: s.loadingMinutes,
      unloadingMinutes: s.unloadingMinutes,
      adminMinutes: s.adminMinutes,
      defaultDepartureTime: s.defaultDepartureTime,
      noNightDriving: s.noNightDriving,
      nightStart: s.nightStart,
      nightEnd: s.nightEnd,
      maxDrivingMinutesPerDay: s.maxDrivingMinutesPerDay,
      includeReturn: s.includeReturn,
      standardTankLiters: s.standardTankLiters,
      fuelConsumptionLPer100: s.fuelConsumptionLPer100,
      fuelPricePerLiter: s.fuelPricePerLiter,
    };
  }
}
