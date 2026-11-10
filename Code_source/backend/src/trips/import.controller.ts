import { Controller, Body, HttpCode, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ImportReportDto } from './trips.dto';
import { TripService, UploadedFile as MulterFile } from './trips.service';

@ApiTags('Import')
@Controller('api/import')
export class ImportController {
  constructor(private readonly tripService: TripService) {}

  @Post()
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Importe un classeur .xlsx (format JMP ou JIT) et crée les voyages' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        format: { type: 'string', enum: ['auto', 'jmp', 'jit'], description: 'auto = détection par en-têtes' },
      },
    },
  })
  importWorkbook(
    @UploadedFile() file: MulterFile,
    @Body('format') format?: string,
  ): Promise<ImportReportDto> {
    return this.tripService.importWorkbook(file, format);
  }
}
