import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plant } from '../entities/plant.entity';
import { RouteCache } from '../entities/route-cache.entity';
import { Station } from '../entities/station.entity';
import { GEOCODER } from './geocoder';
import { GeocodingService } from './geocoding.service';
import { NominatimGeocoder } from './nominatim.geocoder';
import { OSRM_CLIENT } from './osrm.client';
import { OsrmRestClient } from './osrm.client';
import { RoutingService } from './routing.service';

@Module({
  imports: [TypeOrmModule.forFeature([Plant, RouteCache, Station])],
  providers: [
    GeocodingService,
    RoutingService,
    NominatimGeocoder,
    OsrmRestClient,
    { provide: GEOCODER, useExisting: NominatimGeocoder },
    { provide: OSRM_CLIENT, useExisting: OsrmRestClient },
  ],
  exports: [GeocodingService, RoutingService, TypeOrmModule],
})
export class RoutingModule {}
