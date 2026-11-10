import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { Plant } from './entities/plant.entity';
import { PlanningSettings } from './entities/planning-settings.entity';
import { RouteCache } from './entities/route-cache.entity';
import { Station } from './entities/station.entity';
import { Trip } from './entities/trip.entity';
import { TripLine } from './entities/trip-line.entity';
import { User } from './entities/user.entity';
import { RestStop } from './entities/rest-stop.entity';
import { BlackPoint } from './entities/black-point.entity';
import { AuthModule } from './auth/auth.module';
import { ensureMySQLDatabase } from './config/mysql-bootstrap';
import { DataInitializer } from './config/data-initializer';
import { GlobalExceptionFilter } from './common/global-exception.filter';
import { ExportModule } from './export/export.module';
import { RoutingModule } from './routing/routing.module';
import { SettingsModule } from './settings/settings.module';
import { StationsModule } from './stations/stations.module';
import { StatsModule } from './stats/stats.module';
import { TripsModule } from './trips/trips.module';
import { SafetyModule } from './safety/safety.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const entities = [Plant, PlanningSettings, RouteCache, Station, Trip, TripLine, User, RestStop, BlackPoint];
        // L'app desktop se passe de serveur MySQL : une base SQLite dans un fichier unique.
        if (String(config.get('DB_DRIVER')) === 'sqljs') {
          const location = String(config.get('SQLITE_FILE') ?? 'data/jmp.db');
          mkdirSync(dirname(location), { recursive: true });
          return { type: 'sqljs' as const, location, autoSave: true, entities, synchronize: true };
        }
        const database = String(config.get('MYSQL_DATABASE') ?? 'jmp');
        await ensureMySQLDatabase({
          host: String(config.get('MYSQL_HOST') ?? 'localhost'),
          port: Number(config.get('MYSQL_PORT') ?? 3306),
          username: String(config.get('MYSQL_USER') ?? 'root'),
          password: String(config.get('MYSQL_PASSWORD') ?? ''),
          database,
        });
        return {
          type: 'mysql' as const,
          host: String(config.get('MYSQL_HOST') ?? 'localhost'),
          port: Number(config.get('MYSQL_PORT') ?? 3306),
          username: String(config.get('MYSQL_USER') ?? 'root'),
          password: String(config.get('MYSQL_PASSWORD') ?? ''),
          database,
          // Dates stockées en texte naïf, donc aucune option de fuseau à régler.
          charset: 'utf8mb4',
          entities,
          synchronize: true,
        };
      },
    }),
    TypeOrmModule.forFeature([Plant, PlanningSettings]),
    AuthModule,
    SettingsModule,
    RoutingModule,
    StationsModule,
    TripsModule,
    StatsModule,
    ExportModule,
    SafetyModule,
  ],
  providers: [DataInitializer, { provide: APP_FILTER, useClass: GlobalExceptionFilter }],
})
export class AppModule {}
