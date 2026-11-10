import * as XLSX from 'xlsx';
import { RestStop } from '../entities/rest-stop.entity';

/** Lecture d'une valeur cellule sous forme de texte propre. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

/** Vrai si la cellule marque « X » (case cochée). */
function isMarked(value: unknown): boolean {
  return cellText(value).toUpperCase() === 'X';
}

/** Vrai si la cellule est vide ou « X » (une seule des deux colonnes Oui/Non est remplie). */
function isFlag(value: unknown): boolean {
  const t = cellText(value);
  return t === '' || t.toUpperCase() === 'X';
}

/**
 * Sens de trajet lu dans la colonne « المسار وعلاقته بالاتجاه » : الذهاب = aller,
 * الإياب / الاياب = retour. Null lorsque le classeur ne précise pas le sens.
 */
export function directionOfTrajet(trajet: string | null | undefined): string | null {
  const t = trajet ?? '';
  if (/ذهاب/.test(t)) return 'ALLER';
  if (/ياب/.test(t)) return 'RETOUR';
  return null;
}

/**
 * Analyse le classeur des stations de repos et renvoie les lignes normalisées.
 *
 * Feuille « AIRES AUTO » (colonnes) :
 *   0 Trajet | 1 aire repos | 2 repos Oui | 3 repos Non | 4 nuit Oui | 5 nuit Non
 *
 * Feuille « تحليل محطات الاستراحة » (analyse, en arabe) :
 *   0 PK | 1 usage | 2 analyse | 3 valable nuit | 4 nom | 5 trajet
 */
export function parseRestStopsWorkbook(buffer: Buffer): RestStop[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const stops: RestStop[] = [];

  // ----- Feuille AIRES AUTO -----
  const airesName = workbook.SheetNames.find((n) => /aires?\s+auto/i.test(n));
  if (airesName) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[airesName], {
      header: 1,
      blankrows: false,
    });
    for (const row of rows) {
      const trajet = cellText(row?.[0]);
      const name = cellText(row?.[1]);
      if (!trajet || !name) continue;
      // En-tête ou titre : on saute si la ligne ne porte pas de marqueur de repos.
      if (!isFlag(row?.[2]) && !isFlag(row?.[3])) continue;
      const restAllowed = isMarked(row?.[2]) && !isMarked(row?.[3]);
      const nightAllowed = isMarked(row?.[4]) && !isMarked(row?.[5]);
      stops.push(
        new RestStop({ trajet, name, restAllowed, nightAllowed, sourceSheet: airesName }),
      );
    }
  }

  // ----- Feuille d'analyse (arabe) -----
  const analysisName = workbook.SheetNames.find(
    (n) => n !== airesName && /[\u0600-\u06FF]/.test(n),
  );
  if (analysisName) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[analysisName], {
      header: 1,
      blankrows: false,
    });
    let lastTrajet = '';
    for (const row of rows) {
      const name = cellText(row?.[4]);
      const validForNight = cellText(row?.[3]);
      // Ligne d'en-tête de la feuille (« صالحة للبيت ام لا »).
      if (!name || /صالحة/.test(validForNight)) continue;
      // Ne considère que les lignes de données (portent نعم ou لا pour la nuitée).
      if (!/نعم|لا/.test(validForNight)) continue;
      // La colonne du trajet est fusionnée sur plusieurs aires d'un même sens : la valeur
      // du bloc se propage aux lignes suivantes, sinon ces aires seraient perdues.
      const trajet = cellText(row?.[5]) || lastTrajet;
      if (!trajet) continue;
      lastTrajet = trajet;
      stops.push(
        new RestStop({
          trajet,
          name,
          restAllowed: validForNight.includes('نعم'),
          nightAllowed: validForNight.includes('نعم'),
          pk: cellText(row?.[0]) || null,
          recommendedUse: cellText(row?.[1]) || null,
          analysis: cellText(row?.[2]) || null,
          validForNight,
          direction: directionOfTrajet(trajet),
          sourceSheet: analysisName,
        }),
      );
    }
  }

  return stops;
}
