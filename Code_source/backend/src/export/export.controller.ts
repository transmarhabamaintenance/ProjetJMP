import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { formatDate, today } from '../common/datetime';
import { ExportService } from './export.service';

@ApiTags('Exports')
@Controller('api/export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('excel')
  @ApiOperation({ summary: 'Export Excel du plan de livraison d\'une date ou d\'un voyage spécifique' })
  async excel(
    @Query('date') date: string | undefined,
    @Query('tripId') tripId: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const day = date || formatDate(today());
    const id = tripId ? Number(tripId) : undefined;
    const bytes = await this.exportService.exportExcel(day, id);
    const filename = id ? `jmp-voyage-${id}.xlsx` : `plan-jmp-${day}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(bytes);
  }

  @Get('pdf')
  @ApiOperation({ summary: 'Export PDF du plan de livraison d\'une date' })
  async pdf(@Query('date') date: string | undefined, @Res() res: Response): Promise<void> {
    const day = date || formatDate(today());
    const bytes = await this.exportService.exportPdf(day);
    res.setHeader('Content-Disposition', `attachment; filename=plan-jmp-${day}.pdf`);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(bytes);
  }
}
