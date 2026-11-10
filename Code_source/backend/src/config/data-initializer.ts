import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { Plant } from '../entities/plant.entity';
import { PlanningSettings } from '../entities/planning-settings.entity';

/**
 * Initialise les données de référence au démarrage :
 * dépôt « C.E.C MOHAMMEDIA FUELS », ligne unique de paramètres (id = 1),
 * le premier compte administrateur et le compte de démonstration JMP_DEMO_*.
 */
@Injectable()
export class DataInitializer implements OnApplicationBootstrap {
  private readonly logger = new Logger(DataInitializer.name);

  constructor(
    @InjectRepository(Plant) private readonly plantRepository: Repository<Plant>,
    @InjectRepository(PlanningSettings) private readonly settingsRepository: Repository<PlanningSettings>,
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if ((await this.plantRepository.count()) === 0) {
      await this.plantRepository.save(new Plant('C.E.C MOHAMMEDIA FUELS', 33.6866, -7.383));
    }
    if (!(await this.settingsRepository.exist({ where: { id: 1 } }))) {
      await this.settingsRepository.save(new PlanningSettings());
    }
    const username = String(this.config.get('JMP_ADMIN_USERNAME') ?? 'admin');
    const password = String(this.config.get('JMP_ADMIN_PASSWORD') ?? 'admin123');
    const created = await this.authService.ensureAdmin(username, password);
    if (created) {
      this.logger.log(`Compte administrateur « ${username} » créé`);
      if (password === 'admin123') {
        this.logger.warn('Mot de passe administrateur par défaut : à changer dès la première connexion');
      }
    }
    const demoUsername = String(this.config.get('JMP_DEMO_USERNAME') ?? '');
    const demoPassword = String(this.config.get('JMP_DEMO_PASSWORD') ?? '');
    if (await this.authService.ensureUser(demoUsername, demoPassword, String(this.config.get('JMP_DEMO_FULLNAME') ?? 'Agent OBC'))) {
      this.logger.log(`Compte « ${demoUsername.trim()} » créé`);
    }
    this.logger.log('Données de référence initialisées');
  }
}
