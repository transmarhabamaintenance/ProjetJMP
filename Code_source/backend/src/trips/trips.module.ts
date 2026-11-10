import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plant } from '../entities/plant.entity';
import { RouteCache } from '../entities/route-cache.entity';
import { Station } from '../entities/station.entity';
import { Trip } from '../entities/trip.entity';
import { TripLine } from '../entities/trip-line.entity';
import { ExcelTripImporter } from '../importer/excel-trip.importer';
import { RoutingModule } from '../routing/routing.module';
import { SettingsModule } from '../settings/settings.module';
import { ImportController } from './import.controller';
import { TripController } from './trip.controller';
import { TripService } from './trips.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Trip, TripLine, Plant, Station, RouteCache]),
    SettingsModule,
    RoutingModule,
  ],
  controllers: [TripController, ImportController],
  providers: [TripService, ExcelTripImporter],
  exports: [TripService],
})
export class TripsModule {}
