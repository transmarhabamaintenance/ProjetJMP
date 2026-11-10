import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { formatDate } from '../common/datetime';
import { ExcelTripImporter } from './excel-trip.importer';
import { ImportResult } from './import-models';

/**
 * Tests de l'importateur : fill-down, date série, double espace,
 * ordre des colonnes quelconque, héritage Trip Num / Sales Order / Pat.Doc / Date.
 */
const importer = new ExcelTripImporter();

async function bufferOf(rows: (string | number | Date | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Feuil1');
  for (const row of rows) {
    sheet.addRow(row.map((v) => (v === null ? '' : v)));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function parseRows(rows: (string | number | null)[][]): Promise<ImportResult> {
  return importer.parse(await bufferOf(rows), 33000);
}

const CANONICAL_HEADERS = ['Vehicle Id', 'Customer Name', 'Ship To Name', 'City(Ship To)', 'Driver Name',
  'Plant Name', 'Tranche', 'Trip Num', 'Sales Order', 'Pat.Doc', 'Tour Start Date', 'Material Name', 'Total'];

describe('ExcelTripImporter', () => {
  it('importe le fichier exemple (samples/Programe_VIVO.xlsx)', async () => {
    const file = path.join(__dirname, '..', '..', '..', 'samples', 'Programe_VIVO.xlsx');
    const buffer = fs.readFileSync(file);
    const result = await importer.parse(buffer, 33000);

    expect(result.trips.length).toBe(3);
    expect(result.issues.filter((i) => i.level === 'ERROR')).toHaveLength(0);
    expect(result.trips.reduce((s, t) => s + t.lines.length, 0)).toBe(8);

    const t1 = result.trips[0];
    expect(t1.vehicleId).toBe('MA23990D40');
    expect(t1.shipToName).toBe('SHELL MARHABA TANGER');
    expect(t1.city).toBe('TANGER');
    expect(t1.tripNum).toBe('3097361');
    expect(t1.salesOrder).toBe('444379402');
    expect(t1.patDoc).toBe('77751307');
    expect(formatDate(t1.tourDate!)).toBe('2026-10-09');
    expect(t1.lines).toHaveLength(3);
    expect(t1.lines[0].liters).toBe(3000);
    expect(t1.lines[0].materialName).toBe('Shell Vpower Diesel');
    expect(t1.totalLiters()).toBe(33000);

    const t2 = result.trips[1];
    expect(t2.shipToName).toBe('SHELL OUTATE L HAJ');
    expect(t2.tripNum).toBe('3098081');
    expect(t2.salesOrder).toBe('444384441');
    expect(t2.patDoc).toBe('77753343');
    expect(t2.lines).toHaveLength(2);
    expect(t2.totalLiters()).toBe(33000);

    const t3 = result.trips[2];
    expect(t3.shipToName).toBe('SHELL HAOUZ');
    expect(t3.city).toBe('MARRAKECH');
    expect(t3.lines).toHaveLength(3);
    expect(t3.lines[2].materialName).toBe('Shell Vpower Mogas');
    expect(t3.lines[2].liters).toBe(5000);
    expect(t3.totalLiters()).toBe(33000);
  }, 20000);

  it('accepte une date texte', async () => {
    const result = await parseRows([
      CANONICAL_HEADERS,
      ['MA11111', '', 'SHELL TEST', '', '', 'C.E.C MOHAMMEDIA FUELS', '', '999', '', '', '10-09-26', 'Diesel', 33000],
    ]);
    expect(result.trips).toHaveLength(1);
    expect(formatDate(result.trips[0].tourDate!)).toBe('2026-10-09');
  });

  it('accepte des colonnes dans un autre ordre', async () => {
    const result = await parseRows([
      ['Total', 'Material Name', 'Ville (colonne supplémentaire)', 'Vehicle Id',
        'Plant Name', 'Tour Start Date', 'Trip Num', 'Ship To Name', 'City(Ship To)'],
      [3000, 'Shell Fuelsave Super', 'ignorée', 'MA777',
        'C.E.C MOHAMMEDIA FUELS', 46304, '12345', 'SHELL OUJDA', 'OUJDA'],
    ]);
    expect(result.trips).toHaveLength(1);
    const trip = result.trips[0];
    expect(trip.vehicleId).toBe('MA777');
    expect(trip.shipToName).toBe('SHELL OUJDA');
    expect(trip.city).toBe('OUJDA');
    expect(trip.lines[0].materialName).toBe('Shell Fuelsave Super');
    expect(trip.lines[0].liters).toBe(3000);
    expect(formatDate(trip.tourDate!)).toBe('2026-10-09');
  });

  it('tolère les en-têtes avec espaces/casse différents et signale les totaux différents', async () => {
    const blank = new Array(13).fill('') as (string | number)[];
    const result = await parseRows([
      ['VeHicle  id', 'Customer Name', 'ship TO   NAME', 'City(Ship To)', 'Driver Name',
        'PLANT  name', 'Tranche', 'Trip Num', 'Sales Order', 'Pat.Doc', 'Tour Start Date',
        'Material Name', 'Total'],
      ['MA1', 'CLIENT', 'SHELL TANGER', 'TANGER', 'CHAUFFEUR', 'C.E.C MOHAMMEDIA FUELS',
        2, 100, '', '', 46304, 'Diesel', 15000],
      blank,
      ['', '', '', '', '', '', '', '', '', '', '', 'Super', 10000],
      ['MA2', '', 'SHELL RABAT', 'RABAT', '', 'C.E.C MOHAMMEDIA FUELS',
        '', 200, '', '', 46304, 'Diesel', 32000],
    ]);

    expect(result.trips).toHaveLength(2);
    const t1 = result.trips[0];
    expect(t1.vehicleId).toBe('MA1');
    expect(t1.shipToName).toBe('SHELL TANGER');
    expect(t1.lines).toHaveLength(2);
    expect(t1.totalLiters()).toBe(25000);
    expect(t1.tripNum).toBe('100');

    expect(result.issues.some((i) => i.level === 'WARN' && i.message.includes('capacité standard'))).toBe(true);
  });

  it('refuse un fichier sans en-têtes reconnus', async () => {
    await expect(importer.parse(await bufferOf([['a', 'b'], ['c', 'd']]), 33000))
      .rejects.toThrow('En-têtes introuvables');
  });

  it('importe le fichier JIT exemple (samples/Classeur2(jet).xlsx)', async () => {
    const file = path.join(__dirname, '..', '..', '..', 'samples', 'Classeur2(jet).xlsx');
    const buffer = fs.readFileSync(file);
    const result = await importer.parse(buffer, 33000);

    expect(result.trips).toHaveLength(8);
    expect(result.issues.filter((i) => i.level === 'ERROR')).toHaveLength(0);
    expect(result.trips.reduce((s, t) => s + t.lines.length, 0)).toBe(0);

    const t1 = result.trips[0];
    expect(t1.tripNum).toBe('77806592');
    expect(t1.patDoc).toBe('77806592');
    expect(t1.salesOrder).toBe('444826947');
    expect(t1.vehicleId).toBe('MA46964D40');
    expect(t1.customerName).toBe('TRANS MARHABA MAROC');
    expect(t1.shipToName).toBe('AERODROME AGADIR');
    expect(t1.plantName).toBe('DEPOT VIVO ENERGY CWX FUELS');
    expect(t1.driverName).toBe('Redouane Kandad');
    expect(formatDate(t1.tourDate!)).toBe('2026-10-23');

    expect(result.issues.some((i) => i.level === 'WARN' && i.message.includes('saisir les quantités'))).toBe(true);
    expect(result.issues.some((i) => i.message.includes('capacité standard'))).toBe(false);
  }, 20000);

  it('accepte le format JIT explicite et exige les colonnes JIT', async () => {
    const rows = [
      ['Sales Order', 'Plant Name', 'Org Name', 'Ship To Name', 'Driver Name', 'Vehicle Id', 'Tour Start Date', 'Pat.Doc'],
      ['4441', 'DEPOT X', 'TRANS Y', 'AERODROME Z', 'CHAUFFEUR', 'MA999', new Date(2026, 9, 23), '777'],
    ];
    const buffer = await bufferOf(rows);
    const result = await importer.parse(buffer, 33000, 'jit');
    expect(result.trips).toHaveLength(1);
    expect(result.trips[0].tripNum).toBe('777');
    expect(result.trips[0].totalLiters()).toBe(0);

    await expect(importer.parse(buffer, 33000, 'jmp'))
      .rejects.toThrow('Colonne(s) requise(s) absente(s) du fichier : materialName, total');
  });
});
