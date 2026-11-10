/** Avertissement ou erreur de l'import ; lineNumber = ligne du fichier (1 = première ligne). */
export interface ImportIssue {
  level: 'ERROR' | 'WARN';
  lineNumber: number;
  message: string;
}

export function issueError(line: number, message: string): ImportIssue {
  return { level: 'ERROR', lineNumber: line, message };
}

export function issueWarn(line: number, message: string): ImportIssue {
  return { level: 'WARN', lineNumber: line, message };
}

/** Une ligne de chargement d'un voyage (produit + litres + destinataire éventuel). */
export interface ParsedLine {
  materialName: string;
  liters: number;
  lineNumber: number;
  /** Ship To Name propre à la ligne ; null quand la ligne hérite du destinataire du voyage. */
  shipToName?: string | null;
  /** Ville de la ligne, quand elle a son propre Ship To. */
  city?: string | null;
}

/**
 * Voyage reconstitué à partir du classeur Excel.
 * Une ligne du fichier n'est pas un voyage : le voyage est l'ensemble des lignes
 * partageant la même fiche véhicule (fill-down sur les colonnes A à G).
 */
export class ParsedTrip {
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
  firstLineNumber: number;
  lines: ParsedLine[] = [];

  constructor(
    vehicleId: string | null, customerName: string | null, shipToName: string | null, city: string | null,
    driverName: string | null, plantName: string | null, tranche: number | null, tripNum: string | null,
    salesOrder: string | null, patDoc: string | null, tourDate: Date | null, firstLineNumber: number,
  ) {
    this.vehicleId = vehicleId;
    this.customerName = customerName;
    this.shipToName = shipToName;
    this.city = city;
    this.driverName = driverName;
    this.plantName = plantName;
    this.tranche = tranche;
    this.tripNum = tripNum;
    this.salesOrder = salesOrder;
    this.patDoc = patDoc;
    this.tourDate = tourDate;
    this.firstLineNumber = firstLineNumber;
  }

  addLine(line: ParsedLine): void {
    this.lines.push(line);
  }

  totalLiters(): number {
    return this.lines.reduce((sum, l) => sum + l.liters, 0);
  }
}

/** Rapport d'import : voyages détectés, avertissements et erreurs. */
export class ImportResult {
  trips: ParsedTrip[] = [];
  issues: ImportIssue[] = [];
  skippedEmptyRows = 0;

  addTrip(trip: ParsedTrip): void {
    this.trips.push(trip);
  }

  addIssue(issue: ImportIssue): void {
    this.issues.push(issue);
  }

  tripCount(): number {
    return this.trips.length;
  }
}
