import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/auth.decorators';
import { UserRole } from '../domain/enums';
import { SafetyImportReport, SafetyService } from './safety.service';

@ApiTags('Sûreté')
@Controller('api/safety')
export class SafetyController {
  constructor(private readonly safetyService: SafetyService) {}

  @Get('counts')
  @ApiOperation({ summary: 'Nombre de stations de repos et de points noirs en base' })
  counts(): Promise<{ restStops: number; blackPoints: number }> {
    return this.safetyService.counts();
  }

  @Post('import')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Recharge les stations de repos (.xls) et les points noirs (.pdf) depuis samples/' })
  import(): Promise<SafetyImportReport> {
    return this.safetyService.importFromSamples();
  }
}
