import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CoordinatesRequest, StationDto } from './stations.dto';
import { StationService } from './station.service';

@ApiTags('Stations')
@Controller('api/stations')
export class StationController {
  constructor(private readonly stationService: StationService) {}

  @Get()
  @ApiOperation({ summary: 'Liste les stations avec leur statut de géocodage' })
  list(): Promise<StationDto[]> {
    return this.stationService.listAll();
  }

  @Put(':id')
  @ApiOperation({ summary: 'Corrige manuellement les coordonnées d\'une station' })
  update(@Param('id', ParseIntPipe) id: number, @Body() request: CoordinatesRequest): Promise<StationDto> {
    return this.stationService.updateCoordinates(id, request);
  }
}
