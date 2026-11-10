import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trip } from '../entities/trip.entity';
import { SafetyModule } from '../safety/safety.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  imports: [TypeOrmModule.forFeature([Trip]), SafetyModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
