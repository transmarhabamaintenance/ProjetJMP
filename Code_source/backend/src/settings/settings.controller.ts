import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SettingsDto } from './settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('Paramètres')
@Controller('api/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Lit les paramètres de planification' })
  get(): Promise<SettingsDto> {
    return this.settingsService.getDto();
  }

  @Put()
  @ApiOperation({ summary: 'Met à jour les paramètres de planification' })
  update(@Body() dto: SettingsDto): Promise<SettingsDto> {
    return this.settingsService.update(dto);
  }
}
