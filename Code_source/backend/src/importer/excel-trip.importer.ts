import { BadRequestException, Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { normalize } from './material-normalizer';
import { ImportResult, issueError, issueWarn, ParsedLine, ParsedTrip } from './import-models';

/** Format de classeur attendu : JMP (BP) complet, JIT (Jet) une ligne par voyage, ou détection auto. */
export type ImportFormat = 'auto' | 'jmp' | 'jit';

/** Alias d'en-têtes normalisés -> nom canonique du champ. */
const HEADER_ALIASES: Record<string, string> = {
  'vehicle id': 'vehicleId',
  vehicleid: 'vehicleId',
  vehicule: 'vehicleId',
  'customer name': 'customerName',
  'org name': 'customerName',
  client: 'customerName',
  'ship to name': 'shipToName',
  'shipto name': 'shipToName',
  destination: 'shipToName',
  'city(ship to)': 'city',
  'city (ship to)': 'city',
  'city ship to': 'city',
  ville: 'city',
  'driver name': 'driverName',
  chauffeur: 'driverName',
  'plant name': 'plantName',
  depot: 'plantName',
  tranche: 'tranche',
  'trip num': 'tripNum',
  tripnum: 'tripNum',
  'n trip': 'tripNum',
  'sales order': 'salesOrder',
  salesorder: 'salesOrder',
  'pat.doc': 'patDoc',
  'pat doc': 'patDoc',
  patdoc: 'patDoc',
  'tour start date': 'tourDate',
  date: 'tourDate',
  'material name': 'materialName',
  produit: 'materialName',
  total: 'total',
};

const REQUIRED_HEADERS = ['vehicleId', 'shipToName', 'plantName', 'materialName', 'total'];
/** Classes JIT (plan Jet) : une ligne = un voyage, sans produit ni quantité. */
const REQUIRED_HEADERS_JIT = ['vehicleId', 'shipToName', 'plantName'];

interface RawRow {
  lineNumber: number;
  vehicleId: string | null;
  customerName: string | null;
  shipToName: string | null;
  city: string | null;
  driverName: string | null;
  plantName: string | null;
  tranche: number | null;
  tripNum: string | null;
  salesOrder: string | null;
  patDoc: string | null;
  tourDate: Date | null;
  materialName: string | null;
  total: number | null;
  liters: number | null;
}

/**
 * Importe le classeur Excel (.xlsx) du programme de livraison de carburant.
 *
 * Particularités gérées :
 * - en-têtes reconnus par nom (ordre libre, casse/espaces tolérés) ;
 * - fill-down des colonnes A à G et héritage Trip Num / Sales Order / Pat.Doc / Date ;
 * - dates en numéro de série Excel ou texte ; cellules formule (résultat en cache) ;
 * - normalisation U+00A0 ; lignes totalement vides ignorées ;
 * - format JIT (plan Jet) : une ligne = un voyage, sans Material Name ni Total,
 *   Pat.Doc servant de Trip Num, quantités à saisir à la main ensuite.
 */
@Injectable()
export class ExcelTripImporter {
  async parse(buffer: Buffer, standardTankLiters: number, format: ImportFormat = 'auto'): Promise<ImportResult> {
    const workbook = new Workbook();
    try {
      await workbook.xlsx.load(buffer as any);
    } catch (e) {
      throw new BadRequestException(`Impossible de lire le fichier Excel : ${(e as Error).message}`);
    }
    return this.parseWorkbook(workbook, standardTankLiters, format);
  }

  parseWorkbook(workbook: Workbook, standardTankLiters: number, format: ImportFormat = 'auto'): ImportResult {
    const result = new ImportResult();
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException(
        'En-têtes introuvables : la feuille doit contenir une ligne avec les colonnes Vehicle Id, '
        + 'Ship To Name, Plant Name, Material Name, Total, etc.',
      );
    }

    const headerRowIndex = this.findHeaderRow(sheet);
    if (headerRowIndex < 0) {
      throw new BadRequestException(
        'En-têtes introuvables : la feuille doit contenir une ligne avec les colonnes Vehicle Id, '
        + 'Ship To Name, Plant Name, Material Name, Total, etc.',
      );
    }

    const columns = this.mapColumns(sheet.getRow(headerRowIndex));
    const jit = format === 'jit'
      || (format === 'auto' && columns['materialName'] === undefined && columns['total'] === undefined);
    this.checkRequiredColumns(columns, jit);

    const rawRows = this.readRows(sheet, headerRowIndex, columns, result);
    this.assembleTrips(rawRows, result, standardTankLiters, jit);
    return result;
  }

  // ------------------------------------------------------------------
  // Lecture des en-têtes
  // ------------------------------------------------------------------

  private findHeaderRow(sheet: any): number {
    const limit = Math.min(sheet.rowCount, 21);
    for (let r = 1; r <= limit; r++) {
      const row = sheet.getRow(r);
      const canonical = new Set<string>();
      row.eachCell({ includeEmpty: false }, (cell: any) => {
        const header = this.headerKey(cell);
        if (header) canonical.add(header);
      });
      if (canonical.has('vehicleId') && (canonical.has('materialName') || canonical.has('shipToName'))) {
        return r;
      }
    }
    return -1;
  }

  private mapColumns(headerRow: any): Record<string, number> {
    const columns: Record<string, number> = {};
    headerRow.eachCell({ includeEmpty: false }, (cell: any, colNumber: number) => {
      const canonical = this.headerKey(cell);
      if (canonical && columns[canonical] === undefined) {
        columns[canonical] = colNumber;
      }
    });
    return columns;
  }

  private headerKey(cell: any): string | null {
    const value = this.cellText(cell);
    const normalizedValue = normalize(value);
    if (normalizedValue == null) return null;
    const key = normalizedValue.toLowerCase();
    return HEADER_ALIASES[key] ?? key;
  }

  private checkRequiredColumns(columns: Record<string, number>, jit: boolean): void {
    const required = jit ? REQUIRED_HEADERS_JIT : REQUIRED_HEADERS;
    const missing = required.filter((h) => columns[h] === undefined);
    if (missing.length > 0) {
      throw new BadRequestException(`Colonne(s) requise(s) absente(s) du fichier : ${missing.join(', ')}`);
    }
  }

  // ------------------------------------------------------------------
  // Lecture des lignes de données
  // ------------------------------------------------------------------

  private readRows(sheet: any, headerRowIndex: number, columns: Record<string, number>, result: ImportResult): RawRow[] {
    const rows: RawRow[] = [];
    for (let r = headerRowIndex + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const raw: RawRow = {
        lineNumber: r,
        vehicleId: this.stringAt(row, columns, 'vehicleId'),
        customerName: this.stringAt(row, columns, 'customerName'),
        shipToName: this.stringAt(row, columns, 'shipToName'),
        city: this.stringAt(row, columns, 'city'),
        driverName: this.stringAt(row, columns, 'driverName'),
        plantName: this.stringAt(row, columns, 'plantName'),
        tranche: this.integerAt(row, columns, 'tranche'),
        tripNum: this.stringAt(row, columns, 'tripNum'),
        salesOrder: this.stringAt(row, columns, 'salesOrder'),
        patDoc: this.stringAt(row, columns, 'patDoc'),
        tourDate: this.dateAt(row, columns, 'tourDate'),
        materialName: this.stringAt(row, columns, 'materialName'),
        total: this.decimalAt(row, columns, 'total'),
        liters: null,
      };

      if (this.isEmptyRow(raw)) {
        result.skippedEmptyRows++;
        continue;
      }
      if (raw.materialName == null && raw.total != null) {
        result.addIssue(issueError(raw.lineNumber, 'Ligne avec un total mais sans nom de produit'));
      } else if (raw.materialName != null && raw.total == null) {
        result.addIssue(issueError(raw.lineNumber, 'Ligne avec un produit mais sans total (litres)'));
      }
      if (raw.total != null) {
        raw.liters = raw.total;
      }
      rows.push(raw);
    }
    return rows;
  }

  // ------------------------------------------------------------------
  // Assemblage des voyages (fill-down + héritage)
  // ------------------------------------------------------------------

  private assembleTrips(rows: RawRow[], result: ImportResult, standardTankLiters: number, jit: boolean): void {
    let current: ParsedTrip | null = null;
    const carry: Partial<RawRow> = {};

    for (const row of rows) {
      const isNewTrip = row.vehicleId != null;
      if (isNewTrip) {
        if (current != null) {
          this.finalizeTrip(current, result, standardTankLiters, jit);
        }
        current = new ParsedTrip(
          row.vehicleId,
          coalesce(row.customerName, carry.customerName),
          coalesce(row.shipToName, carry.shipToName),
          coalesce(row.city, carry.city),
          coalesce(row.driverName, carry.driverName),
          coalesce(row.plantName, carry.plantName),
          row.tranche != null ? row.tranche : (carry.tranche ?? null),
          // En JIT le fichier n'a pas de Trip Num : le Pat.Doc identifie le voyage (clé de ré-import).
          jit ? coalesce(row.tripNum, row.patDoc) : coalesce(row.tripNum, carry.tripNum),
          coalesce(row.salesOrder, carry.salesOrder),
          coalesce(row.patDoc, carry.patDoc),
          row.tourDate != null ? row.tourDate : (carry.tourDate as Date) ?? null,
          row.lineNumber,
        );
      } else {
        if (current == null) {
          result.addIssue(issueError(row.lineNumber, 'Ligne de continuation sans voyage précédent, ignorée'));
          continue;
        }
        this.inheritFields(current, row);
      }

      if (row.liters != null && row.materialName != null) {
        // Le Ship To de la ligne est conservé tel quel (pas de fill-down) : plusieurs
        // destinataires peuvent se partager le même camion et le même chauffeur.
        current.addLine({
          materialName: normalize(row.materialName)!,
          liters: row.liters,
          lineNumber: row.lineNumber,
          shipToName: row.shipToName,
          city: row.city,
        });
      }
      this.updateCarry(carry, row);
    }

    if (current != null) {
      this.finalizeTrip(current, result, standardTankLiters, jit);
    }
  }

  private inheritFields(trip: ParsedTrip, row: RawRow): void {
    if (trip.tripNum == null) trip.tripNum = row.tripNum;
    if (trip.salesOrder == null) trip.salesOrder = row.salesOrder;
    if (trip.patDoc == null) trip.patDoc = row.patDoc;
    if (trip.tourDate == null) trip.tourDate = row.tourDate;
  }

  private finalizeTrip(trip: ParsedTrip, result: ImportResult, standardTankLiters: number, jit: boolean): void {
    result.addTrip(trip);

    if (trip.shipToName == null) {
      result.addIssue(issueError(trip.firstLineNumber, `Voyage ${trip.tripNum} sans station (Ship To Name), ignoré`));
      return;
    }
    if (trip.plantName == null) {
      result.addIssue(issueError(trip.firstLineNumber, `Voyage ${trip.tripNum} sans dépôt (Plant Name), ignoré`));
      return;
    }
    if (trip.tourDate == null) {
      result.addIssue(issueError(trip.firstLineNumber, `Voyage ${trip.tripNum} sans date (Tour Start Date), ignoré`));
      return;
    }
    if (jit && trip.lines.length === 0) {
      result.addIssue(issueWarn(trip.firstLineNumber,
        `Voyage ${trip.tripNum} sans lignes produit : saisir les quantités à la main`));
      return;
    }
    const total = trip.totalLiters();
    if (Math.abs(total - standardTankLiters) > 0.5) {
      result.addIssue(issueWarn(trip.firstLineNumber,
        `Total du voyage ${trip.tripNum} (${formatNumber(total)} L) différent de la capacité standard (${standardTankLiters} L)`));
    }
    if (trip.lines.length === 0) {
      result.addIssue(issueError(trip.firstLineNumber, `Voyage ${trip.tripNum} sans ligne de produit`));
    }
  }

  // ------------------------------------------------------------------
  // Helpers de lecture des cellules
  // ------------------------------------------------------------------

  private cell(row: any, columns: Record<string, number>, field: string): any {
    const colNumber = columns[field];
    if (colNumber === undefined) return null;
    return row.getCell(colNumber);
  }

  private stringAt(row: any, columns: Record<string, number>, field: string): string | null {
    return normalize(this.cellText(this.cell(row, columns, field)));
  }

  private integerAt(row: any, columns: Record<string, number>, field: string): number | null {
    const value = this.stringAt(row, columns, field);
    if (value == null) return null;
    const int = Number.parseInt(value, 10);
    if (Number.isInteger(int) && String(int) === value) return int;
    const dbl = Number.parseFloat(value);
    return Number.isFinite(dbl) ? Math.trunc(dbl) : null;
  }

  /** Valeur brute déballée : les cellules formule exposent leur résultat en cache. */
  private rawValue(cell: any): any {
    if (cell == null) return null;
    let v = cell.value;
    if (v != null && typeof v === 'object' && 'result' in v) {
      v = (v as any).result; // formule : résultat en cache
    }
    return v;
  }

  /** Représentation texte d'une cellule, quel que soit son type. */
  private cellText(cell: any): string | null {
    const v = this.rawValue(cell);
    if (v == null) return null;
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return formatNumber(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (v instanceof Date) return cell.text ?? String(v);
    if (Array.isArray((v as any).richText)) {
      return (v as any).richText.map((part: any) => part.text ?? '').join('');
    }
    if (typeof (v as any).text === 'string') return (v as any).text;
    if ((v as any).error != null) return null;
    return String(v);
  }

  private decimalAt(row: any, columns: Record<string, number>, field: string): number | null {
    const v = this.rawValue(this.cell(row, columns, field));
    if (v == null) return null;
    if (typeof v === 'number') {
      if (isDateFormattedCell(this.cell(row, columns, field))) return null;
      return v;
    }
    const text = normalize(this.cellText(this.cell(row, columns, field)));
    if (text == null) return null;
    const cleaned = text.replace(/\u00A0/g, '').replace(/ /g, '').replace(/,/g, '');
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private dateAt(row: any, columns: Record<string, number>, field: string): Date | null {
    const cell = this.cell(row, columns, field);
    const v = this.rawValue(cell);
    if (v == null) return null;
    if (v instanceof Date) {
      return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    }
    if (typeof v === 'number') {
      return excelSerialToDate(v);
    }
    const text = this.cellText(cell)?.trim();
    if (!text) return null;
    return parseTextDate(text);
  }

  private isEmptyRow(raw: RawRow): boolean {
    return raw.vehicleId == null && raw.customerName == null && raw.shipToName == null && raw.city == null
      && raw.driverName == null && raw.plantName == null && raw.tranche == null && raw.tripNum == null
      && raw.salesOrder == null && raw.patDoc == null && raw.tourDate == null && raw.materialName == null
      && raw.total == null;
  }

  private updateCarry(carry: Partial<RawRow>, row: RawRow): void {
    for (const field of ['vehicleId', 'customerName', 'shipToName', 'city', 'driverName', 'plantName',
      'tranche', 'tripNum', 'salesOrder', 'patDoc', 'tourDate'] as (keyof RawRow)[]) {
      if (row[field] != null) {
        (carry as any)[field] = row[field];
      }
    }
  }
}

function coalesce<T>(first: T | null, second: T | null | undefined): T | null {
  return first != null ? first : (second ?? null);
}

/** Représentation numérique lisible (valeur entière sans décimale superflue). */
function formatNumber(value: number): string {
  return String(value);
}

function isDateFormattedCell(cell: any): boolean {
  const fmt = cell?.numFmt;
  if (typeof fmt !== 'string') return false;
  return /[dmyhs]/i.test(fmt.replace(/\[[^\]]*\]/g, '')) && !/^[0-9.,;%#eE+\-\s"]*$/g.test(fmt);
}

/**
 * Convertit un numéro de série Excel (système 1900, bug du 29/02/1900 géré) en Date locale.
 */
export function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial <= 0 || serial > 2958465) {
    return null;
  }
  const dayFraction = serial - Math.floor(serial);
  const wholeDays = Math.floor(serial);
  // Excel compte fictivement 1900 comme bissextile : les séries >= 61 sont décalées d'un jour.
  const epochDays = wholeDays >= 61 ? wholeDays - 25569 : wholeDays - 25568;
  const ms = epochDays * 86_400_000 + Math.round(dayFraction * 86_400_000);
  const utc = new Date(ms);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

/** Formats de date texte acceptés (le premier correspond au format de cellule mm-dd-yy). */
const TEXT_DATE_PATTERNS = ['MM-dd-yy', 'MM-dd-yyyy', 'MM/dd/yy', 'MM/dd/yyyy', 'dd/MM/yyyy', 'dd-MM-yyyy', 'yyyy-MM-dd'];

export function parseTextDate(text: string): Date | null {
  for (const pattern of TEXT_DATE_PATTERNS) {
    const parsed = tryPattern(text, pattern);
    if (parsed) return parsed;
  }
  return null;
}

function tryPattern(text: string, pattern: string): Date | null {
  const regex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/.exec(text);
  if (!regex) return null;
  const [, a, b, c] = regex;
  let year = Number(c);
  if (c.length === 2) year = pattern.includes('yy') && !pattern.includes('yyyy') ? 2000 + year : year;
  let month: number;
  let day: number;
  switch (pattern) {
    case 'yyyy-MM-dd':
      [year, month, day] = [Number(a), Number(b), Number(c)];
      break;
    case 'dd/MM/yyyy':
    case 'dd-MM-yyyy':
      [day, month, year] = [Number(a), Number(b), Number(c)];
      break;
    default:
      [month, day, year] = [Number(a), Number(b), c.length === 2 ? 2000 + Number(c) : Number(c)];
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getMonth() !== month - 1 || date.getDate() !== day || date.getFullYear() !== year) return null;
  return date;
}
