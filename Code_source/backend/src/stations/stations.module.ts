import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Station } from '../entities/station.entity';
import { Trip } from '../entities/trip.entity';
import { StationController } from './station.controller';
import { StationService } from './station.service';

@Module({
  imports: [TypeOrmModule.forFeature([Station, Trip])],
  controllers: [StationController],
  providers: [StationService],
})
export class StationsModule {}
