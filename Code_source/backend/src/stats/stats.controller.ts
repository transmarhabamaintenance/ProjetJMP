import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StatsService } from './stats.service';
import { StatsDto } from '../trips/trips.dto';

@ApiTags('Statistiques')
@Controller('api/stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get()
  @ApiOperation({ summary: 'Statistiques d\'une date (km, litres par produit, km par chauffeur, heures par véhicule)' })
  stats(@Query('date') date?: string): Promise<StatsDto> {
    return this.statsService.stats(date);
  }
}
