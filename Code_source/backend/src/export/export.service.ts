import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import PDFDocument = require('pdfkit');
import { addMinutes, formatDate, formatDateTime, parseDate, parseDateTime, today } from '../common/datetime';
import { Trip } from '../entities/trip.entity';
import { RestStop } from '../entities/rest-stop.entity';
import { BlackPoint, BlackPointKind } from '../entities/black-point.entity';
import { SafetyService, TripSafetyMatch } from '../safety/safety.service';
import { directionOfTrajet } from '../safety/rest-stops.parser';

/** Numéros donnés au chauffeur, sous les consignes de sécurité en bas de la fiche. */
const NUMEROS_CHAUFFEUR = [
  'الشرطة / Police : 19',
  'الدرك الملكي / Gendarmerie : 177',
  'الوقاية المدنية / Pompiers : 15',
  'المستعجلات / SAMU : 115',
  'واتساب / WhatsApp : 06 61 73 59 78',
];

/** Heure de fin de trajet de la fiche : consigne d'arrivée avant la nuit. */
const FIN_TRAJET_HEURE = '18:00';

/** Export du plan de voyage du jour en Excel (exceljs) et en PDF (pdfkit). */
@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    @InjectRepository(Trip) private readonly tripRepository: Repository<Trip>,
    private readonly safetyService: SafetyService,
  ) {}

  private async tripsFor(date: string | undefined, tripId?: number): Promise<Trip[]> {
    if (tripId) {
      const trip = await this.tripRepository.findOne({
        where: { id: tripId },
        relations: ['plant', 'station', 'lines'],
      });
      return trip ? [trip] : [];
    }
    const day = date ?? formatDate(today());
    return this.tripRepository.find({
      where: { tourDate: day },
      order: { id: 'ASC' },
      relations: ['plant', 'station', 'lines'],
    });
  }

  // ------------------------------------------------------------------
  // Export Excel
  // ------------------------------------------------------------------

  async exportExcel(date: string | undefined, tripId?: number): Promise<Buffer> {
    const trips = await this.tripsFor(date, tripId);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'JMP Planner';
    workbook.lastModifiedBy = 'JMP Planner';
    workbook.created = new Date();
    workbook.modified = new Date();

    const usedSheetNames = new Set<string>();

    if (trips.length === 0) {
      const emptySheet = workbook.addWorksheet('Plan de voyage');
      emptySheet.addRow(['PLAN DE VOYAGE (JMP) — AUCUN VOYAGE']);
      emptySheet.addRow([`Aucun voyage planifié pour la date : ${date ?? formatDate(today())}`]);
    } else {
      // Rapproche chaque voyage des stations de repos et points noirs correspondants.
      const safetyByTrip = new Map<number, TripSafetyMatch>();
      for (const trip of trips) {
        const origin = trip.plant?.name?.match(/MOHAMMEDIA/i) ? 'MOHAMMEDIA' : trip.plant?.name;
        const destination = trip.station?.city ?? trip.customerName;
        safetyByTrip.set(trip.id, await this.safetyService.matchForTrip(origin, destination));
      }

      // Si export d'un seul voyage : UNE SEULE feuille JMP (pas de synthèse)
      if (tripId && trips.length === 1) {
        const trip = trips[0];
        const rawName = trip.tripNum ? `JMP - ${trip.tripNum}` : `JMP - Voyage ${trip.id}`;
        const sheetName = this.sanitizeSheetName(rawName, usedSheetNames);
        const sheet = workbook.addWorksheet(sheetName);
        this.populateJmpSheet(sheet, trip, safetyByTrip.get(trip.id));
      } else {
        // Export global : synthèse + une feuille JMP par voyage
        const synthSheetName = this.sanitizeSheetName('Synthèse du plan', usedSheetNames);
        const summarySheet = workbook.addWorksheet(synthSheetName);
        this.buildSummarySheet(summarySheet, trips, date);

        for (const trip of trips) {
          const rawName = trip.tripNum ? `JMP - ${trip.tripNum}` : `JMP - Voyage ${trip.id}`;
          const sheetName = this.sanitizeSheetName(rawName, usedSheetNames);
          const sheet = workbook.addWorksheet(sheetName);
          this.populateJmpSheet(sheet, trip, safetyByTrip.get(trip.id));
        }
      }
    }

    const array = await workbook.xlsx.writeBuffer();
    return Buffer.from(array);
  }

  // ------------------------------------------------------------------
  // Export PDF
  // ------------------------------------------------------------------

  async exportPdf(date: string | undefined): Promise<Buffer> {
    const day = date ?? formatDate(today());
    const trips = await this.tripsFor(date);

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 20 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const columns = ['Trip', 'Véhicule', 'Chauffeur', 'Destination', 'Ville', 'Litres', 'Départ',
      'Km aller', 'Km A/R', 'Conduite', 'Pauses', 'ETA', 'Fin déchg.', 'Retour', 'Durée (h:mm)'];
    const pageWidth = doc.page.width - 40;
    const colWidth = pageWidth / columns.length;
    const rowHeight = 14;

    doc.font('Helvetica-Bold').fontSize(16).text(`Plan de livraison JMP — ${this.formatFrDate(day)}`, 20, doc.y, { width: pageWidth });
    doc.moveDown();

    let y = doc.y + 4;
    const drawHeader = () => {
      doc.font('Helvetica-Bold').fontSize(8);
      columns.forEach((col, i) => doc.text(col, 20 + i * colWidth, y, { width: colWidth - 2, lineBreak: false }));
      y += rowHeight;
      doc.moveTo(20, y).lineTo(20 + pageWidth, y).stroke();
    };
    drawHeader();

    doc.font('Helvetica').fontSize(8);
    for (const t of trips) {
      if (y + rowHeight > doc.page.height - 20) {
        doc.addPage();
        y = 20;
        drawHeader();
        doc.font('Helvetica').fontSize(8);
      }
      const values = [
        t.tripNum ?? '',
        t.vehicleId ?? '',
        t.driverName ?? '',
        t.station?.name ?? '',
        t.station?.city ?? '',
        String(t.totalLiters ?? 0),
        this.fmtDateTime(t.plannedDeparture),
        t.distanceOneWayKm == null ? '' : t.distanceOneWayKm.toFixed(1),
        t.distanceRoundTripKm == null ? '' : t.distanceRoundTripKm.toFixed(1),
        t.drivingMinOneWay == null ? '' : String(t.drivingMinOneWay),
        t.breakMinutes == null ? '' : String(t.breakMinutes),
        this.fmtDateTime(t.etaStation),
        this.fmtDateTime(t.endUnloading),
        this.fmtDateTime(t.etaReturnPlant),
        t.totalDurationMin == null ? '' : this.durationHm(Number(t.totalDurationMin)),
      ];
      values.forEach((value, i) => {
        doc.text(String(value), 20 + i * colWidth, y + 3, { width: colWidth - 2, lineBreak: false, ellipsis: true });
      });
      y += rowHeight;
      doc.moveTo(20, y).lineTo(20 + pageWidth, y).stroke();
    }

    doc.end();
    return done;
  }

  private sanitizeSheetName(name: string, used: Set<string>): string {
    let clean = name.replace(/[\\/?*\[\]:]/g, '-').trim();
    if (clean.length > 31) clean = clean.substring(0, 31);
    let final = clean;
    let i = 2;
    while (used.has(final)) {
      final = clean.substring(0, 27) + `_${i}`;
      i++;
    }
    used.add(final);
    return final;
  }

  private durationHm(totalMinutes: number | null | undefined): string {
    if (totalMinutes == null) return '';
    const m = Math.max(0, Math.round(Number(totalMinutes)));
    return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
  }

  /** Dédoublonnage insensible à la casse et aux accents, en conservant l'ordre. */
  private dedup(items: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of items) {
      const key = item.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }

  /** Clé de comparaison insensible à la casse et aux accents. */
  private normKey(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  }

  /**
   * Clients du voyage = destinataires « Ship To Name », dans l'ordre des lignes du classeur :
   * un même camion et un même chauffeur avec des Ship To différents livrent plusieurs clients.
   * Une ligne sans Ship To propre livre la station du voyage ; les litres sont totalisés par client.
   */
  private clientsOf(trip: Trip): Array<{ name: string; city: string; liters: number }> {
    const clients: Array<{ name: string; city: string; liters: number }> = [];
    for (const line of trip.lines ?? []) {
      const name = (line.shipToName ?? trip.station?.name ?? '').trim();
      if (!name) continue;
      const city = ((line.shipToName ? line.city : null) ?? trip.station?.city ?? '').trim();
      const liters = Number(line.liters) || 0;
      const existing = clients.find((c) => this.normKey(c.name) === this.normKey(name));
      if (existing) {
        existing.liters += liters;
        if (!existing.city) existing.city = city;
      } else {
        clients.push({ name, city, liters });
      }
    }
    if (clients.length === 0) {
      const name = (trip.station?.name ?? trip.customerName ?? '').trim();
      if (name) {
        clients.push({ name, city: trip.station?.city ?? '', liters: Number(trip.totalLiters) || 0 });
      }
    }
    return clients;
  }

  private buildSummarySheet(sheet: ExcelJS.Worksheet, trips: Trip[], date?: string | undefined): void {
    const dayLabel = date ?? formatDate(today());

    const borderThin: Partial<ExcelJS.Borders> = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };

    const headerFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    const altFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF3FB' } };
    const totalFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

    const headers = [
      'Voyage', 'Véhicule', 'Chauffeur', 'Destination', 'Ville', 'Litres',
      'Départ', 'Km aller', 'Km A/R', 'Conduite (h)', 'Pauses (min)', 'ETA station',
      'Fin déchargement', 'Retour dépôt', 'Durée (h)', 'Alertes',
    ];

    sheet.mergeCells('A1:P1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `SYNTHÈSE DU PLAN DE VOYAGE — ${dayLabel}`;
    titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = headerFill;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;

    const totalTrips = trips.length;
    const totalLiters = trips.reduce((s, t) => s + (t.totalLiters ?? 0), 0);
    const totalKm = trips.reduce((s, t) => s + (t.distanceRoundTripKm ?? 0), 0);
    sheet.mergeCells('A2:P2');
    const statsCell = sheet.getCell('A2');
    statsCell.value = `Nombre de voyages : ${totalTrips}   |   Total litres : ${totalLiters.toLocaleString()} L   |   Distance totale A/R : ${totalKm.toFixed(1)} km`;
    statsCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1F4E79' } };
    statsCell.alignment = { horizontal: 'left', vertical: 'middle' };
    sheet.getRow(2).height = 20;

    sheet.getRow(3).height = 8;

    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = headerFill;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = borderThin;
    });
    headerRow.height = 30;

    let totalLitersNum = 0;
    let totalKmNum = 0;
    let totalDurationNum = 0;

    for (let i = 0; i < trips.length; i++) {
      const t = trips[i];
      const rowNum = 5 + i;
      const isAlt = i % 2 === 1;

      const row = [
        t.tripNum ?? '',
        t.vehicleId ?? '',
        t.driverName ?? '',
        t.station?.name ?? '',
        t.station?.city ?? '',
        t.totalLiters ?? 0,
        this.fmtDateTime(t.plannedDeparture),
        t.distanceOneWayKm ?? 0,
        t.distanceRoundTripKm ?? 0,
        this.durationHm(t.drivingMinOneWay),
        t.breakMinutes ?? 0,
        this.fmtDateTime(t.etaStation),
        this.fmtDateTime(t.endUnloading),
        this.fmtDateTime(t.etaReturnPlant),
        this.durationHm(t.totalDurationMin),
        (t.warnings ?? []).join(' ; '),
      ];

      totalLitersNum += t.totalLiters ?? 0;
      totalKmNum += t.distanceRoundTripKm ?? 0;
      totalDurationNum += t.totalDurationMin ?? 0;

      sheet.addRow(row);
      const dataRow = sheet.getRow(rowNum);
      dataRow.eachCell((cell, colIdx) => {
        cell.font = { name: 'Arial', size: 9 };
        cell.border = borderThin;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        if (isAlt) {
          cell.fill = altFill;
        }
        if (colIdx === 1 || colIdx === 2 || colIdx === 4 || colIdx === 5 || colIdx === 16) {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        }
        if (colIdx === 16 && cell.value && String(cell.value).length > 0) {
          cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFC00000' } };
        }
      });
      dataRow.height = 26;
    }

    const totalRowNum = 5 + trips.length;
    const totalRow = sheet.addRow([
      'TOTAUX', '', '', '', '', totalLitersNum, '', '', totalKmNum, '', '', '', '', '', this.durationHm(totalDurationNum), '',
    ]);
    totalRow.eachCell((cell, colIdx) => {
      cell.font = { name: 'Arial', size: 9, bold: true };
      cell.fill = totalFill;
      cell.border = borderThin;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (colIdx === 1 || colIdx === 2 || colIdx === 4 || colIdx === 5 || colIdx === 16) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });
    sheet.getRow(totalRowNum).height = 22;

    const widths: number[] = [14, 15, 16, 22, 14, 10, 16, 10, 10, 12, 10, 16, 16, 16, 12, 30];
    widths.forEach((w, i) => {
      sheet.getColumn(i + 1).width = w;
    });

    sheet.views = [{ state: 'frozen', ySplit: 4 }];
    sheet.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: totalRowNum, column: headers.length },
    };

    sheet.pageSetup = {
      orientation: 'landscape',
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    };
    sheet.pageSetup.printArea = `A1:P${totalRowNum}`;
  }

  private populateJmpSheet(
    sheet: ExcelJS.Worksheet,
    trip: Trip,
    safety?: TripSafetyMatch,
  ): void {
    const NAVY = '1B365D';
    const BAND = 'E8EEF5';
    const GRID = '8A97AB';
    const F = 'Arial';

    const borderThin: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FF' + GRID } },
      left: { style: 'thin', color: { argb: 'FF' + GRID } },
      bottom: { style: 'thin', color: { argb: 'FF' + GRID } },
      right: { style: 'thin', color: { argb: 'FF' + GRID } },
    };
    const borderMediumNavy: Partial<ExcelJS.Borders> = {
      bottom: { style: 'medium', color: { argb: 'FF' + NAVY } },
    };
    const bandFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + BAND } };
    const headFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NAVY } };
    const headFont = { name: F, size: 7.5, bold: true, color: { argb: 'FFFFFFFF' } };

    const box = (row: number, c1: number, c2: number, opts: {
      value?: string | number;
      font?: Partial<ExcelJS.Font>;
      fill?: ExcelJS.FillPattern;
      align?: Partial<ExcelJS.Alignment>;
      border?: Partial<ExcelJS.Borders>;
    }): void => {
      // Fusion préalable : les plages de la maquette sont des cellules fusionnées.
      if (c2 > c1) sheet.mergeCells(row, c1, row, c2);
      for (let c = c1; c <= c2; c++) {
        const cell = sheet.getCell(row, c);
        if (opts.fill) cell.fill = opts.fill;
        if (opts.border) cell.border = opts.border;
      }
      const cell = sheet.getCell(row, c1);
      if (opts.value !== undefined) cell.value = opts.value;
      if (opts.font) cell.font = opts.font as ExcelJS.Font;
      if (opts.align) cell.alignment = opts.align as ExcelJS.Alignment;
    };

    const head = (c1: number, c2: number, value: string): void => {
      box(r, c1, c2, { value, font: headFont, fill: headFill, align: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: borderThin });
    };

    let r = 1;

    // ---------- EN-TÊTE ----------
    box(r, 1, 11, {
      value: 'JOURNEY MANAGEMENT PLAN (JMP)   —   خطة إدارة الرحلة',
      font: { name: F, size: 15, bold: true, color: { argb: 'FF' + NAVY } },
      align: { horizontal: 'center', vertical: 'middle', wrapText: true },
    });
    sheet.getRow(r).height = 28;
    r = 2;
    const clients = this.clientsOf(trip);
    const clientName = clients.map((c) => c.name).join(' / ') || 'VIVO ENERGY';
    box(r, 1, 7, {
      value: `Plan de voyage N° : ${trip.tripNum ?? trip.id}   |   Client : ${clientName}`,
      font: { name: F, size: 9, bold: true },
      align: { horizontal: 'left', vertical: 'middle', indent: 1 },
      border: borderMediumNavy,
    });
    box(r, 8, 11, {
      value: `رقم خطة الرحلة : ${trip.tripNum ?? trip.id}   |   الزبون : ${clientName}`,
      font: { name: F, size: 9, bold: true },
      align: { horizontal: 'right', vertical: 'middle', indent: 1, readingOrder: 'rtl' },
      border: borderMediumNavy,
    });
    sheet.getCell(r, 1).border = {
      top: { style: 'medium', color: { argb: 'FF' + NAVY } },
      left: { style: 'medium', color: { argb: 'FF' + NAVY } },
      bottom: { style: 'thin', color: { argb: 'FF' + GRID } },
      right: { style: 'thin', color: { argb: 'FF' + GRID } },
    };
    sheet.getRow(r).height = 20;
    r = 4;
    sheet.getRow(3).height = 5;

    // ---------- TABLEAU 1 ----------
    box(r, 1, 7, {
      value: 'TABLEAU 1 : DÉTAILS DU PLAN DE VOYAGE',
      font: { name: F, size: 9, bold: true, color: { argb: 'FF' + NAVY } },
      fill: bandFill,
      align: { horizontal: 'left', vertical: 'middle', indent: 1 },
      border: { bottom: { style: 'thin', color: { argb: 'FF' + GRID } } },
    });
    box(r, 8, 11, {
      value: 'الجدول 1 : تفاصيل خطة الرحلة',
      font: { name: F, size: 9, bold: true, color: { argb: 'FF' + NAVY } },
      fill: bandFill,
      align: { horizontal: 'right', vertical: 'middle', indent: 1, readingOrder: 'rtl' },
      border: { bottom: { style: 'thin', color: { argb: 'FF' + GRID } } },
    });
    sheet.getCell(r, 1).border = {
      top: { style: 'medium', color: { argb: 'FF' + NAVY } },
      left: { style: 'medium', color: { argb: 'FF' + NAVY } },
      bottom: { style: 'thin', color: { argb: 'FF' + GRID } },
      right: { style: 'thin', color: { argb: 'FF' + GRID } },
    };
    sheet.getRow(r).height = 17;
    r += 1;

    head(1, 1, 'Voyage N°\nرقم الرحلة');
    head(2, 2, 'Date\nالتاريخ');
    head(3, 3, 'Chauffeur\nالسائق');
    head(4, 5, 'Matricule\nرقم الشاحنة');
    head(6, 6, 'Nombre de clients\nعدد الزبائن');
    head(7, 8, 'Type d\'itinéraire\nنوع المسار');
    head(9, 9, 'Arrivée avant nuit\nالوصول قبل الليل');
    head(10, 11, '2ème chauffeur\nالسائق الثاني');
    sheet.getRow(r).height = 26;

    r += 1;

    const nbClients = clients.length >= 3 ? 'Trois clients et plus [ X ]\nثلاثة زبائن أو أكثر [ X ]' : clients.length === 2 ? 'Deux clients [ X ]\nزبونين [ X ]' : 'Un seul client [ X ]\nزبون واحد [ X ]';
    const t1ranges: [number, number][] = [[1, 1], [2, 2], [3, 3], [4, 5], [6, 6], [7, 8], [9, 9], [10, 11]];
    const t1vals = [
      { v: trip.tripNum ?? trip.id, bold: true },
      { v: this.formatFrDate(trip.tourDate) },
      { v: trip.driverName ?? '', bold: true },
      { v: trip.vehicleId ?? '' },
      { v: nbClients },
      { v: 'Autoroute [ X ]\nطريق السيار [ X ]' },
      { v: 'Oui [ X ]\nنعم [ X ]' },
      { v: 'Non applicable (-)\nلا ينطبق (-)' },
    ];
    t1vals.forEach(({ v, bold }, i) => {
      const [c1, c2] = t1ranges[i];
      box(r, c1, c2, { value: v, font: { name: F, size: 8, bold: !!bold }, align: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: borderThin });
    });
    sheet.getRow(r).height = 26;
    r += 1;
    sheet.getRow(r).height = 7;
    r += 1;

    // ---------- TABLEAU 2 : BRIEF ----------
    box(r, 1, 7, {
      value: 'TABLEAU 2 - BRIEF : ITINÉRAIRE, CHARGEMENT & LIVRAISON',
      font: { name: F, size: 9, bold: true, color: { argb: 'FF' + NAVY } },
      fill: bandFill,
      align: { horizontal: 'left', vertical: 'middle', indent: 1 },
      border: { bottom: { style: 'thin', color: { argb: 'FF' + GRID } } },
    });
    box(r, 8, 11, {
      value: 'الجدول 2 - الإيجاز : المسار، التحميل والتسليم',
      font: { name: F, size: 9, bold: true, color: { argb: 'FF' + NAVY } },
      fill: bandFill,
      align: { horizontal: 'right', vertical: 'middle', indent: 1, readingOrder: 'rtl' },
      border: { bottom: { style: 'thin', color: { argb: 'FF' + GRID } } },
    });
    sheet.getCell(r, 1).border = {
      top: { style: 'medium', color: { argb: 'FF' + NAVY } },
      left: { style: 'medium', color: { argb: 'FF' + NAVY } },
      bottom: { style: 'thin', color: { argb: 'FF' + GRID } },
      right: { style: 'thin', color: { argb: 'FF' + GRID } },
    };
    sheet.getRow(r).height = 17;
    r += 1;

    // La colonne « Produits & Quantités » est supprimée : la place libérée (C:D) profite au
    // client, les autres colonnes gardent leur largeur d'origine.
    // Le lieu de chargement ouvre le tableau, la ville suit ; le reste garde son ordre.
    const t3headers: Array<[number, number, string]> = [
      [1, 1, 'Lieu chargement\nمكان التحميل'],
      [2, 2, 'Ville\nالمدينة'],
      [3, 4, 'Nom du client / Station\nاسم الزبون / المحطة'],
      [5, 5, 'ETA\nساعة الوصول'],
      [6, 6, 'Fin déchargement\nنهاية التفريغ'],
      [7, 7, 'Observations\nالملاحظات'],
      [8, 8, 'Lieu nuitée\nمكان المبيت'],
      [9, 9, 'Lieu départ\nمكان الانطلاق'],
      [10, 10, 'Compteur départ\nعداد الانطلاق'],
      [11, 11, 'Compteur arrêt\nعداد التوقف'],
    ];
    t3headers.forEach(([c1, c2, v]) => head(c1, c2, v));
    sheet.getRow(r).height = 28;

    r += 1;

    const plantName = trip.plant?.name ?? 'C.E.C MOHAMMEDIA FUELS';
    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      const volumeLabel = client.liters ? ` (${Math.round(client.liters)} L)` : '';
      // Une seule arrivée étant calculée par le moteur, les créneaux des clients suivants
      // restent vides : le contrôle les renseigne à l'impression.
      // Observations, lieu de nuitée et lieu de départ ne sont jamais pré-remplis.
      const vals: Array<[number, number, string]> = [
        [1, 1, plantName],
        [2, 2, client.city],
        [3, 4, `${client.name}${volumeLabel}`],
        [5, 5, i === 0 ? this.fmtTimeOnly(trip.etaStation) : ''],
        [6, 6, i === 0 ? this.fmtTimeOnly(trip.endUnloading) : ''],
        [7, 7, ''],
        [8, 8, ''],
        [9, 9, ''],
        [10, 10, ''],
        [11, 11, ''],
      ];
      vals.forEach(([c1, c2, v], index) => {
        const obs = index === 6;
        box(r, c1, c2, {
          value: v,
          font: { name: F, size: obs ? 7.5 : 8, bold: index === 1 },
          align: { horizontal: obs ? 'left' : 'center', vertical: 'middle', wrapText: true, indent: obs ? 1 : 0 },
          border: borderThin,
        });
      });
      sheet.getRow(r).height = 50;
      r += 1;
    }
    sheet.getRow(r).height = 7;
    r += 1;

    // ---------- TABLEAU 3 : BRIEF ----------
    box(r, 1, 7, {
      value: 'TABLEAU 3 - BRIEF : HORAIRES & DURÉES',
      font: { name: F, size: 9, bold: true, color: { argb: 'FF' + NAVY } },
      fill: bandFill,
      align: { horizontal: 'left', vertical: 'middle', indent: 1 },
      border: { bottom: { style: 'thin', color: { argb: 'FF' + GRID } } },
    });
    box(r, 8, 11, {
      value: 'الجدول 3 - الإيجاز : التوقيتات والمدد',
      font: { name: F, size: 9, bold: true, color: { argb: 'FF' + NAVY } },
      fill: bandFill,
      align: { horizontal: 'right', vertical: 'middle', indent: 1, readingOrder: 'rtl' },
      border: { bottom: { style: 'thin', color: { argb: 'FF' + GRID } } },
    });
    sheet.getCell(r, 1).border = {
      top: { style: 'medium', color: { argb: 'FF' + NAVY } },
      left: { style: 'medium', color: { argb: 'FF' + NAVY } },
      bottom: { style: 'thin', color: { argb: 'FF' + GRID } },
      right: { style: 'thin', color: { argb: 'FF' + GRID } },
    };
    sheet.getRow(r).height = 17;
    r += 1;

    head(1, 1, 'Métrique\nالمعيار');
    // Le management ne veut que des horaires dans le tableau 3 : le retour se lit au dépôt
    // de chargement (arrivée puis sortie chargée), les durées de trajet disparaissent.
    const t4ranges: [number, number][] = [[2, 3], [4, 5], [6, 7], [8, 11]];
    const t4h = [
      'Heure de départ\nساعة الانطلاق',
      'Heure de fin de trajet\nساعة نهاية السير',
      "Heure d'arrivée au lieu de chargement\nساعة الوصول إلى مكان التحميل",
      'Heure de sortie du lieu de chargement\nساعة الخروج من مكان التحميل',
    ];
    t4ranges.forEach(([c1, c2], i) => head(c1, c2, t4h[i]));
    sheet.getRow(r).height = 28;

    r += 1;

    const groundMin = Math.max(0, Number(trip.loadingMinutes) || 0) + Math.max(0, Number(trip.adminMinutes) || 0);
    // Sans retour prévu au programme, le voyage ne repasse pas par le lieu de chargement.
    const retourAuDepot = trip.includeReturn === false ? null : trip.etaReturnPlant;
    const t4prevus = [
      this.fmtTimeOnly(trip.plannedDeparture),
      FIN_TRAJET_HEURE,
      this.fmtTimeOnly(retourAuDepot),
      this.fmtTimePlus(retourAuDepot, groundMin),
    ];
    box(r, 1, 1, { value: 'Prévu\nالمخطط', font: { name: F, size: 8, bold: true }, align: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: borderThin });
    t4ranges.forEach(([c1, c2], i) => {
      box(r, c1, c2, { value: t4prevus[i], font: { name: F, size: 8 }, align: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: borderThin });
    });
    sheet.getRow(r).height = 20;
    r += 1;
    box(r, 1, 1, { value: 'Réel\nالفعلي', font: { name: F, size: 8, bold: true }, align: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: borderThin });
    t4ranges.forEach(([c1, c2]) => {
      box(r, c1, c2, { value: '', font: { name: F, size: 8 }, align: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: borderThin });
    });
    sheet.getRow(r).height = 26;
    r += 1;
    sheet.getRow(r).height = 7;
    r += 1;

    // ---------- TABLEAU 4 : DEBRIEF ----------
    box(r, 1, 7, {
      value: 'TABLEAU 4 - DEBRIEF : RISQUES, TÉLÉMATIQUE & ZONES',
      font: { name: F, size: 9, bold: true, color: { argb: 'FF' + NAVY } },
      fill: bandFill,
      align: { horizontal: 'left', vertical: 'middle', indent: 1 },
      border: { bottom: { style: 'thin', color: { argb: 'FF' + GRID } } },
    });
    box(r, 8, 11, {
      value: 'الجدول 4 - الحصر : المخاطر، التليماتيك والمناطق',
      font: { name: F, size: 9, bold: true, color: { argb: 'FF' + NAVY } },
      fill: bandFill,
      align: { horizontal: 'right', vertical: 'middle', indent: 1, readingOrder: 'rtl' },
      border: { bottom: { style: 'thin', color: { argb: 'FF' + GRID } } },
    });
    sheet.getCell(r, 1).border = {
      top: { style: 'medium', color: { argb: 'FF' + NAVY } },
      left: { style: 'medium', color: { argb: 'FF' + NAVY } },
      bottom: { style: 'thin', color: { argb: 'FF' + GRID } },
      right: { style: 'thin', color: { argb: 'FF' + GRID } },
    };
    sheet.getRow(r).height = 17;
    r += 1;

    const t5risques = [
      'Déconnexion GPS\nفصل GPS',
      'Déviation itinéraire\nتغيير المسار',
      'Freinage brusque\nفرملة مفاجئة',
      'Excès de vitesse\nتجاوز السرعة',
      'Conduite continue\nقيادة متواصلة',
      'Conduite de nuit\nقيادة ليلية',
    ];
    t5risques.forEach((v, i) => head(i + 1, i + 1, v));
    head(7, 11, 'Points noirs\nالنقاط السوداء');
    sheet.getRow(r).height = 28;

    r += 1;

    // Nombre de lignes estimées dans une cellule fusionnée (largeur en unités Excel),
    // pour ajuster la hauteur de ligne et ne pas masquer les listes longues.
    const estLines = (text: string, widthUnits: number, fontSize: number): number => {
      if (!text) return 1;
      const charsPerLine = Math.max(10, Math.floor(widthUnits * (11 / fontSize)));
      return text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil((line.length * 1.1) / charsPerLine)), 0);
    };
    const LINE_H = 11.5;

    const bp = safety?.blackPoints ?? [];
    const rs = safety?.restStops ?? [];
    const fmtBp = (p: BlackPoint): string => [p.zone, p.landmark].filter(Boolean).join(' - ');
    const fmtRs = (s: RestStop): string => s.name;
    const roadPoints = bp.filter((p) => p.kind === BlackPointKind.ROAD).map(fmtBp);
    const securityPoints = bp.filter((p) => p.kind === BlackPointKind.SECURITY).map(fmtBp);
    const pointsNoirs = roadPoints.concat(securityPoints);
    const pointsNoirsText = pointsNoirs.length ? pointsNoirs.map((p) => `• ${p}`).join('\n') : '';
    // Les risques ne sont pas pré-remplis : la cellule est vidée et laissée au contrôle
    // pour le relevé terrain (Oui/Non coché à la main sur l'imprimé).
    for (let i = 0; i < 6; i++) {
      box(r, i + 1, i + 1, { value: '', font: { name: F, size: 8, bold: true }, align: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: borderThin });
    }
    box(r, 7, 11, { value: pointsNoirsText, font: { name: F, size: 7.5 }, align: { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 }, border: borderThin });
    sheet.getRow(r).height = Math.max(58, estLines(pointsNoirsText, 66, 7.5) * LINE_H + 8);
    r += 1;

    // Repos autorisé : les aires changent selon le sens, aller et retour sont distincts.
    head(1, 2, 'Points de repos autorisés ALLER\nنقاط الراحة المصرح بها الذهاب');
    head(3, 4, 'Points de repos autorisés RETOUR\nنقاط الراحة المصرح بها الإياب');
    head(5, 7, 'Zones interdites\nالمناطق المحظورة');
    head(8, 11, 'Repos de nuit autorisés\nنقاط المبيت المصرح بها');
    sheet.getRow(r).height = 28;
    r += 1;

    // Valeurs : points de repos par sens, zones interdites, repos de nuit autorisés.
    const listOr = (items: string[], fallback: string): string =>
      items.length ? items.map((x) => `• ${x}`).join('\n') : fallback;
    const directionOf = (s: RestStop): string | null =>
      (s.direction === 'ALLER' || s.direction === 'RETOUR') ? s.direction : directionOfTrajet(s.trajet);
    const autorisees = rs.filter((s) => s.restAllowed);
    // Une aire sans sens indiqué dans le classeur source vaut pour les deux sens.
    const reposAller = autorisees.filter((s) => directionOf(s) !== 'RETOUR').map(fmtRs);
    const reposRetour = autorisees.filter((s) => directionOf(s) !== 'ALLER').map(fmtRs);
    const nuit = rs.filter((s) => s.nightAllowed).map(fmtRs);
    const interdites = bp
      .filter((p) => p.kind === BlackPointKind.FORBIDDEN_ZONE)
      .map((p) => [p.zone, p.landmark, p.address].filter(Boolean).join(' - '));
    const reposAllerText = listOr(this.dedup(reposAller), 'Aucun\nلا يوجد');
    const reposRetourText = listOr(this.dedup(reposRetour), 'Aucun\nلا يوجد');
    const interditesText = listOr(interdites, 'Aucune\nلا توجد');
    const nuitText = listOr(nuit, 'Aucun\nلا يوجد');
    box(r, 1, 2, { value: reposAllerText, font: { name: F, size: 7.5 }, align: { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 }, border: borderThin });
    box(r, 3, 4, { value: reposRetourText, font: { name: F, size: 7.5 }, align: { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 }, border: borderThin });
    box(r, 5, 7, { value: interditesText, font: { name: F, size: 8 }, align: { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 }, border: borderThin });
    box(r, 8, 11, { value: nuitText, font: { name: F, size: 8 }, align: { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 }, border: borderThin });
    const zonesLines = Math.max(
      estLines(reposAllerText, 34, 7.5),
      estLines(reposRetourText, 36, 7.5),
      estLines(interditesText, 59, 8),
      estLines(nuitText, 54, 8),
    );
    sheet.getRow(r).height = Math.max(26, zonesLines * LINE_H + 8);
    r += 1;
    sheet.getRow(r).height = 7;
    r += 1;

    // ---------- TABLEAU 5 : DEBRIEF ----------
    box(r, 1, 7, {
      value: 'TABLEAU 5 - DEBRIEF : VALIDATIONS, VISAS & OBSERVATIONS JMP',
      font: { name: F, size: 9, bold: true, color: { argb: 'FF' + NAVY } },
      fill: bandFill,
      align: { horizontal: 'left', vertical: 'middle', indent: 1 },
      border: { bottom: { style: 'thin', color: { argb: 'FF' + GRID } } },
    });
    box(r, 8, 11, {
      value: 'الجدول 5 - الحصر : التأشيرات والملاحظات',
      font: { name: F, size: 9, bold: true, color: { argb: 'FF' + NAVY } },
      fill: bandFill,
      align: { horizontal: 'right', vertical: 'middle', indent: 1, readingOrder: 'rtl' },
      border: { bottom: { style: 'thin', color: { argb: 'FF' + GRID } } },
    });
    sheet.getCell(r, 1).border = {
      top: { style: 'medium', color: { argb: 'FF' + NAVY } },
      left: { style: 'medium', color: { argb: 'FF' + NAVY } },
      bottom: { style: 'thin', color: { argb: 'FF' + GRID } },
      right: { style: 'thin', color: { argb: 'FF' + GRID } },
    };
    sheet.getRow(r).height = 17;
    r += 1;

    head(1, 3, 'Visa Contrôle\nتأشيرة المراقبة');
    head(4, 7, 'Remarques & Signature Chauffeur\nملاحظات وتوقيع السائق');
    head(8, 11, 'Observations JMP\nملاحظات خطة الرحلة');
    sheet.getRow(r).height = 28;

    r += 1;
    [[1, 3], [4, 7], [8, 11]].forEach(([c1, c2]) => box(r, c1, c2, { value: '', font: { name: F, size: 8 }, align: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: borderThin }));
    sheet.getRow(r).height = 48;
    r += 1;
    sheet.getRow(r).height = 7;
    r += 1;

    // ---------- CONSIGNES DE SÉCURITÉ ----------
    const SG = { name: F, size: 7, color: { argb: 'FF333333' } };
    const SB = { name: F, size: 7.5, bold: true, color: { argb: 'FF' + NAVY } };
    box(r, 1, 5, { value: 'CONSIGNES DE SÉCURITÉ  |  تعليمات السلامة — Conduite générale / إرشادات القيادة العامة', font: SB, align: { horizontal: 'left', vertical: 'middle' }, border: { bottom: { style: 'thin', color: { argb: 'FF' + NAVY } } } });
    box(r, 6, 11, { value: 'Règles de sécurité & véhicule / قواعد السلامة والمركبة', font: SB, align: { horizontal: 'left', vertical: 'middle', indent: 1 }, border: { bottom: { style: 'thin', color: { argb: 'FF' + NAVY } } } });
    sheet.getRow(r).height = 14;
    r += 1;

    const L = [
      ['Respecter la vitesse légale et l\'adapter aux conditions météo', 'احترام السرعة القانونية وتكييفها حسب حالة الطقس'],
      ['Respecter le code de la route', 'احترام قوانين السير'],
      ['Interdiction formelle de transporter des passagers tiers ou des colis', 'يمنع نقل المسافرين أو الطرود'],
      ['Contrôle du véhicule avant le départ et après chaque arrêt', 'مراقبة المركبة قبل الانطلاق وبعد كل توقف'],
    ];
    const Rgt = [
      ['Interdiction formelle de fumer dans le véhicule', 'يمنع التدخين داخل المركبة'],
      ['Usage du téléphone portable strictement interdit au volant', 'يمنع استعمال الهاتف أثناء القيادة'],
      ['Respect impératif du plan de voyage', 'الالتزام التام بخطة الرحلة'],
      ['Vérifier et signaler tout comportement ou événement suspect', 'التحقق والإبلاغ عن أي سلوك أو حدث مشبوه'],
    ];
    for (let i = 0; i < 4; i++) {
      box(r, 1, 5, { value: `• ${L[i][0]}\n   ${L[i][1]}`, font: SG, align: { horizontal: 'left', vertical: 'middle', wrapText: true } });
      box(r, 6, 11, { value: `• ${Rgt[i][0]}\n   ${Rgt[i][1]}`, font: SG, align: { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 } });
      sheet.getRow(r).height = 20;
      r += 1;
    }

    // ---------- INFORMATIONS AU CHAUFFEUR ----------
    // Sous les consignes de sécurité, avec la même présentation : titre souligné, texte simple.
    sheet.getRow(r).height = 7;
    r += 1;
    box(r, 1, 5, { value: 'INFORMATIONS AU CHAUFFEUR  |  معلومات للسائق', font: SB, align: { horizontal: 'left', vertical: 'middle' }, border: { bottom: { style: 'thin', color: { argb: 'FF' + NAVY } } } });
    box(r, 6, 11, { value: 'Numéros d\'appel / أرقام الاتصال', font: SB, align: { horizontal: 'left', vertical: 'middle', indent: 1 }, border: { bottom: { style: 'thin', color: { argb: 'FF' + NAVY } } } });
    sheet.getRow(r).height = 14;
    r += 1;

    for (let i = 0; i < 3; i++) {
      box(r, 1, 5, { value: `• ${NUMEROS_CHAUFFEUR[i]}`, font: SG, align: { horizontal: 'left', vertical: 'middle', wrapText: true } });
      box(r, 6, 11, { value: NUMEROS_CHAUFFEUR[i + 3] ? `• ${NUMEROS_CHAUFFEUR[i + 3]}` : '', font: SG, align: { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 } });
      sheet.getRow(r).height = 14;
      r += 1;
    }
    const lastLine = r - 1;

    // Largeurs de colonnes (A à K) : A = lieu de chargement, B = ville.
    const widths = [15, 13, 21, 24, 12, 14, 30, 15, 15, 12, 12];
    widths.forEach((w, i) => sheet.getColumn(i + 1).width = w);
    sheet.views = [{ showGridLines: false }];

    sheet.pageSetup = {
      paperSize: 9,
      orientation: 'landscape',
      fitToWidth: 1,
      fitToHeight: 1,
      // `fitToPage` active l'ajustement à une page (pageSetUpPr) dans Excel ;
      // `scale` doit rester indéfini, sinon Excel ignore fitToWidth/fitToHeight.
      fitToPage: true,
      scale: undefined,
      horizontalCentered: true,
      margins: { left: 0.3, right: 0.3, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 },
    };
    sheet.pageSetup.printArea = `A1:K${lastLine}`;
  }

  private fmtDateTime(value: string | null | undefined): string {
    const dt = parseDateTime(value);
    if (!dt) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }

  private fmtTimeOnly(value: string | null | undefined): string {
    if (!value) return '';
    const dt = parseDateTime(value);
    if (!dt) {
      const match = value.match(/(\d{2}:\d{2})/);
      return match ? match[1] : '';
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }

  /** Heure « HH:mm » après ajout de minutes à un horodatage (temps d'immobilisation au dépôt). */
  private fmtTimePlus(value: string | null | undefined, minutes: number): string {
    if (!value) return '';
    const dt = parseDateTime(value);
    if (!dt) return this.fmtTimeOnly(value);
    return this.fmtTimeOnly(formatDateTime(addMinutes(dt, Math.max(0, minutes))));
  }

  private formatFrDate(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = parseDate(iso);
    if (!d) return iso;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
}
