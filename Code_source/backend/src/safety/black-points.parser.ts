import { pathToFileURL } from 'url';
import { BlackPoint, BlackPointKind } from '../entities/black-point.entity';

/**
 * Parseur positionnel du document « Points Noires.pdf ».
 *
 * Le PDF contient des tableaux dont les colonnes ne sont séparées par aucune ligne : on
 * reconstruit donc la structure à partir des coordonnées x/y des items de texte (pdfjs-dist).
 * Trois mises en page sont reconnues :
 *   - ROUTE (pages points noirs)         : Zone | Repère | Nature | Durabilité
 *   - FORBIDDEN_ZONE (zones interdites)  : (vide) | Nom | Zone interdite | Adresse
 *   - SECURITY (pages sûreté)            : Nom | Localisation | Nature | Durabilité
 */

interface PdfItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

/** Un item de texte + sa colonne sémantique attribuée. */
interface Placed {
  str: string;
  semantic: number;
}

/** Tolérance verticale pour regrouper les items d'une même ligne. */
const Y_TOLERANCE = 4;

/**
 * Charge pdfjs-dist, disponible uniquement en ESM : require() passe sur Node 22 mais
 * échoue sous le Node 20 d'Electron, d'où le repli sur import() d'une file URL.
 */
async function loadPdfjs(): Promise<any> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('pdfjs-dist/legacy/build/pdf.mjs');
  } catch {
    const target = pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href;
    return new Function('specifier', 'return import(specifier)')(target);
  }
}

/** Regroupe les items d'une page en lignes triées par x, de haut en bas. */
function groupLines(items: PdfItem[]): PdfItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PdfItem[][] = [];
  let current: PdfItem[] = [];
  let currentY: number | null = null;
  for (const item of sorted) {
    if (currentY === null || Math.abs(item.y - currentY) <= Y_TOLERANCE) {
      current.push(item);
      currentY = currentY === null ? item.y : currentY;
    } else {
      lines.push(current);
      current = [item];
      currentY = item.y;
    }
  }
  if (current.length) lines.push(current);
  return lines;
}

/** Repère la ligne d'en-tête et renvoie ses colonnes étiquetées (x de départ + libellé). */
function findHeader(
  lines: PdfItem[][],
  labels: string[],
): { index: number; cols: Array<{ x: number; label: string }> } | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const found = labels.every((l) => line.some((it) => it.str.trim().toLowerCase() === l.toLowerCase()));
    if (!found) continue;
    const cols = labels
      .map((l) => {
        const it = line.find((t) => t.str.trim().toLowerCase() === l.toLowerCase());
        return it ? { x: it.x, label: l } : null;
      })
      .filter((c): c is { x: number; label: string } => c !== null)
      .sort((a, b) => a.x - b.x);
    if (cols.length === labels.length) return { index: i, cols };
  }
  return null;
}

/** Seuils (x) entre colonnes = points médians entre les débuts de colonnes consécutives. */
function buildThresholds(cols: Array<{ x: number }>): number[] {
  const th: number[] = [];
  for (let i = 0; i < cols.length - 1; i++) th.push((cols[i].x + cols[i + 1].x) / 2);
  return th;
}

/** Index de colonne étiquetée d'un item, via les seuils. */
function labeledIndex(x: number, thresholds: number[]): number {
  let idx = 0;
  for (const t of thresholds) {
    if (x >= t) idx++;
  }
  return idx;
}

/** Nettoie un champ (espaces, numéros de page parasites en fin de champ). */
function cleanField(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/[\s]*\d{1,2}\s*$/, (m) => (m.trim().length <= 2 ? '' : m))
    .trim();
}

interface Layout {
  kind: BlackPointKind;
  labels: string[];
  /** Mappe l'index de colonne étiquetée -> index sémantique (-1 = ignorer). */
  semanticMap: number[];
  /** Index sémantique qui déclenche une nouvelle ligne (colonne clé). */
  rowKeySemantic: number;
  /** Ordre des champs sémantiques : zone, landmark, nature, durability, address. */
  fields: Array<'zone' | 'landmark' | 'nature' | 'durability' | 'address' | null>;
}

const ROAD_LAYOUT: Layout = {
  kind: BlackPointKind.ROAD,
  labels: ['Zone', 'Repère', 'Nature', 'Durabilité'],
  semanticMap: [0, 1, 2, 3],
  rowKeySemantic: 0,
  fields: ['zone', 'landmark', 'nature', 'durability', null],
};

const FORBIDDEN_LAYOUT: Layout = {
  kind: BlackPointKind.FORBIDDEN_ZONE,
  labels: ["Nom de l'emplacement", 'Zone interdite', 'Adresse'],
  semanticMap: [0, -1, 1], // « Zone interdite » est une étiquette constante : ignorée
  rowKeySemantic: 0,
  // sémantique 0 = nom (zone) ; sémantique 1 = adresse (arabe).
  fields: ['zone', 'address', null, null, null],
};

const SECURITY_LAYOUT: Layout = {
  kind: BlackPointKind.SECURITY,
  labels: ["Nom de l'emplacement", 'Localisation du point noir', 'Nature du Point Noir', 'Durabilité'],
  semanticMap: [0, 1, 2, 3],
  rowKeySemantic: 0,
  fields: ['zone', 'landmark', 'nature', 'durability', null],
};

/** Toutes les mises en page, dans l'ordre de détection. */
const LAYOUTS: Layout[] = [ROAD_LAYOUT, FORBIDDEN_LAYOUT, SECURITY_LAYOUT];

/** Extrait les tableaux d'une page selon une mise en page donnée. */
function extractFromLayout(lines: PdfItem[][], layout: Layout, pageNum: number): BlackPoint[] {
  const header = findHeader(lines, layout.labels);
  if (!header) return [];
  const thresholds = buildThresholds(header.cols);
  const points: BlackPoint[] = [];
  let current: Record<string, string> | null = null;

  const flush = () => {
    if (!current) return;
    const zone = cleanField(current.zone ?? '');
    const landmark = cleanField(current.landmark ?? '');
    const nature = cleanField(current.nature ?? '');
    const durability = cleanField(current.durability ?? '');
    const address = cleanField(current.address ?? '');
    if (zone || landmark || nature || address) {
      points.push(
        new BlackPoint({
          kind: layout.kind,
          zone: zone || null,
          landmark: landmark || null,
          nature: nature || null,
          durability: durability || null,
          address: address || null,
          sourcePage: pageNum,
        }),
      );
    }
    current = null;
  };

  for (let i = header.index + 1; i < lines.length; i++) {
    const line = lines[i];
    const placed: Placed[] = [];
    for (const item of line) {
      const str = item.str.trim();
      if (!str) continue;
      const li = labeledIndex(item.x, thresholds);
      if (li < 0 || li >= layout.semanticMap.length) continue;
      const semantic = layout.semanticMap[li];
      if (semantic < 0) continue;
      placed.push({ str, semantic });
    }
    if (!placed.length) continue;

    const hasRowKey = placed.some((p) => p.semantic === layout.rowKeySemantic);
    const append = (field: string | null, str: string) => {
      if (!field) return;
      current[field] = current[field] ? `${current[field]} ${str}` : str;
    };

    if (hasRowKey) {
      // Nouvelle ligne de données : on clôt la précédente puis on ouvre celle-ci.
      flush();
      current = {};
      for (const p of placed) append(layout.fields[p.semantic], p.str);
    } else if (current) {
      // Ligne de continuation : complète la colonne correspondante de la ligne en cours.
      for (const p of placed) append(layout.fields[p.semantic], p.str);
    }
  }
  flush();
  return points;
}

/**
 * Analyse le document « Points Noires.pdf » et renvoie tous les points/zones/sûreté extraits.
 * Les en-têtes, titres et pages de couverture sont ignorés automatiquement.
 */
export async function parseBlackPointsPdf(buffer: Buffer): Promise<BlackPoint[]> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs
    .getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    })
    .promise;

  const all: BlackPoint[] = [];
  try {
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const tc = await page.getTextContent();
      const items: PdfItem[] = (tc.items || [])
        .filter((it: any) => typeof it.str === 'string' && it.str.trim() !== '')
        .map((it: any) => ({
          str: it.str,
          x: it.transform[4],
          y: it.transform[5],
          width: it.width || 0,
        }));
      if (!items.length) continue;
      const lines = groupLines(items);
      for (const layout of LAYOUTS) {
        all.push(...extractFromLayout(lines, layout, pageNum));
      }
      page.cleanup?.();
    }
  } finally {
    await doc.destroy?.();
  }
  return all;
}
