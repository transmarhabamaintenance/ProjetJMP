import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlackPoint } from '../entities/black-point.entity';
import { RestStop } from '../entities/rest-stop.entity';
import { SafetyController } from './safety.controller';
import { SafetyService } from './safety.service';

@Module({
  imports: [TypeOrmModule.forFeature([RestStop, BlackPoint])],
  controllers: [SafetyController],
  providers: [SafetyService],
  exports: [SafetyService],
})
export class SafetyModule {}
