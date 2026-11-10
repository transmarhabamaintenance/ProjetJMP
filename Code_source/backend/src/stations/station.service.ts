import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GeocodeSource } from '../domain/enums';
import { Station } from '../entities/station.entity';
import { Trip } from '../entities/trip.entity';
import { CoordinatesRequest, StationDto } from './stations.dto';

/** Gestion des stations : listage, statut de géocodage et correction manuelle. */
@Injectable()
export class StationService {
  constructor(
    @InjectRepository(Station) private readonly stationRepository: Repository<Station>,
    @InjectRepository(Trip) private readonly tripRepository: Repository<Trip>,
  ) {}

  async listAll(): Promise<StationDto[]> {
    const stations = await this.stationRepository.find();
    const trips = await this.tripRepository.find();
    const tripsByStation = new Map<number, number>();
    for (const t of trips) {
      const key = t.station?.id ?? -1;
      tripsByStation.set(key, (tripsByStation.get(key) ?? 0) + 1);
    }

    return stations
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .map((s) => this.toDto(s, tripsByStation.get(s.id) ?? 0));
  }

  async updateCoordinates(id: number, request: CoordinatesRequest): Promise<StationDto> {
    const station = await this.stationRepository.findOne({ where: { id } });
    if (!station) {
      throw new NotFoundException(`Station ${id} introuvable`);
    }
    if (request.lat != null) {
      station.lat = request.lat;
    }
    if (request.lon != null) {
      station.lon = request.lon;
    }
    station.geocodeSource = GeocodeSource.MANUAL;
    if (request.confirmed === true) {
      station.geocodeConfirmed = true;
    }
    await this.stationRepository.save(station);

    const trips = await this.tripRepository.find({ where: { station: { id } } });
    return this.toDto(station, trips.length);
  }

  private toDto(s: Station, tripsCount: number): StationDto {
    return {
      id: s.id,
      name: s.name,
      city: s.city ?? null,
      lat: s.lat ?? null,
      lon: s.lon ?? null,
      geocodeSource: s.geocodeSource ?? null,
      geocodeConfirmed: s.geocodeConfirmed,
      tripsCount,
    };
  }
}
