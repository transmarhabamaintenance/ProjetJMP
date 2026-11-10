import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RecalculateRequest, TripCreateRequest, TripDetailDto, TripPatchRequest, TripSummaryDto } from './trips.dto';
import { TripService } from './trips.service';

@ApiTags('Voyages')
@Controller('api/trips')
export class TripController {
  constructor(private readonly tripService: TripService) {}

  @Get()
  @ApiOperation({ summary: 'Liste des voyages (filtres : date, chauffeur, véhicule, ville)' })
  list(
    @Query('date') date?: string,
    @Query('driver') driver?: string,
    @Query('vehicle') vehicle?: string,
    @Query('city') city?: string,
  ): Promise<TripSummaryDto[]> {
    return this.tripService.listTrips(date, driver, vehicle, city);
  }

  @Post('recalculate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recalcule un ou plusieurs voyages (tous si ids vide)' })
  @ApiBody({ type: Object, required: false })
  recalculate(@Body() request?: RecalculateRequest): Promise<TripSummaryDto[]> {
    return this.tripService.recalculate(request);
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Planifie un voyage saisi à la main (mêmes champs que le classeur)' })
  create(@Body() request: TripCreateRequest): Promise<TripDetailDto> {
    return this.tripService.createTrip(request);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'un voyage (lignes produit, tracé routier, alertes)' })
  detail(@Param('id', ParseIntPipe) id: number): Promise<TripDetailDto> {
    return this.tripService.getDetail(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifie l\'heure de départ, le chauffeur, le véhicule, etc. puis recalcule' })
  patch(@Param('id', ParseIntPipe) id: number, @Body() request: TripPatchRequest): Promise<TripSummaryDto> {
    return this.tripService.patch(id, request);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprime un voyage et ses lignes (réservé à un administrateur)' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.tripService.removeTrip(id);
  }
}
