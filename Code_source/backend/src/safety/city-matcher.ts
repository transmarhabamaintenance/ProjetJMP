/**
 * Rapprochement d'un voyage (dépôt d'origine + ville de la station livrée) avec les
 * stations de repos et les points noirs, par correspondance de villes.
 *
 * Le document des stations de repos indexe les aires par « Trajet » (ex. « MOHAMMEDIA-JERF-SAFI »),
 * celui des points noirs par « Zone » (ex. « Casa », « Bouznika »). On normalise donc toute
 * chaîne (sans accents, sans ponctuation, en majuscules) et l'on compare les segments de villes.
 */

/** Normalise une chaîne pour la comparaison : sans accents, sans ponctuation, majuscules. */
export function normalizeCity(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .replace(/[^\p{L}\p{N}]+/gu, ' ') // ponctuation / séparateurs -> espace
    .trim()
    .toUpperCase();
}

/** Découpe une chaîne normalisée en « tokens » de mots significatifs. */
export function tokenize(input: string): string[] {
  return normalizeCity(input).split(/\s+/).filter(Boolean);
}

/**
 * Alias de villes : une même ville peut apparaître sous plusieurs graphies dans les
 * documents (ex. CASA / CASABLANCA, JORF / EL JADIDA). Associe chaque variante normalisée
 * à une clé canonique.
 */
const CITY_ALIASES: Record<string, string> = {
  CASA: 'CASABLANCA',
  CASABLANCA: 'CASABLANCA',
  JORF: 'EL JADIDA',
  JERF: 'EL JADIDA',
  JAADIDA: 'EL JADIDA',
  'EL JADIDA': 'EL JADIDA',
  MOHAMMEDIA: 'MOHAMMEDIA',
  MEDIA: 'MOHAMMEDIA',
  'AIN HAROUDA': 'AIN HAROUDA',
  'HAD SOUALEM': 'HAD SOUALEM',
  SOUALEM: 'HAD SOUALEM',
  BERRECHID: 'BERRECHID',
  BERECHID: 'BERRECHID',
  KHOURIBGA: 'KHOURIBGA',
  KHORIBGA: 'KHOURIBGA',
  'OUED ZEM': 'OUED ZEM',
  'BENI MELLAL': 'BENI MELLAL',
  MARRAKECH: 'MARRAKECH',
  MARAKECH: 'MARRAKECH',
  SAFI: 'SAFI',
  SETTAT: 'SETTAT',
  'SIDI MAAROUF': 'SIDI MAAROUF',
  'SIDI BOU OTHMAN': 'SIDI BOU OTHMAN',
  BENGRIR: 'BENGRIR',
  BOUZNIKA: 'BOUZNIKA',
  SKHIRAT: 'SKHIRAT',
  TEMARA: 'TEMARA',
  RABAT: 'RABAT',
  SALE: 'SALE',
  KENITRA: 'KENITRA',
  MEKNES: 'MEKNES',
  FES: 'FES',
  TANGER: 'TANGER',
  LARACHE: 'LARACHE',
  ASSILAH: 'ASSILAH',
  TETOUAN: 'TETOUAN',
  NADOR: 'NADOR',
  OUJDA: 'OUJDA',
  AGADIR: 'AGADIR',
  OUARZAZATE: 'OUARZAZATE',
  GURCIF: 'GURCIF',
  'AIT BARKA': 'AIT BARKA',
  // ----- Alias arabes (feuille d'analyse des stations de repos) -----
  المحمدية: 'MOHAMMEDIA',
  المديه: 'MOHAMMEDIA',
  الرباط: 'RABAT',
  'القنيطرة': 'KENITRA',
  قنيطرة: 'KENITRA',
  'القنيطره': 'KENITRA',
  طنجة: 'TANGER',
  طنجه: 'TANGER',
  العرائش: 'LARACHE',
  أصيلة: 'ASSILAH',
  اصيلة: 'ASSILAH',
  تطوان: 'TETOUAN',
  مكناس: 'MEKNES',
  فاس: 'FES',
  مراكش: 'MARRAKECH',
  آسفي: 'SAFI',
  اسفي: 'SAFI',
  الصويرة: 'ESSAOUIRA',
  أكادير: 'AGADIR',
  اغادير: 'AGADIR',
  ورزازة: 'OUARZAZATE',
  ورزازات: 'OUARZAZATE',
  سطات: 'SETTAT',
  'الناظور': 'NADOR',
  وجدة: 'OUJDA',
  'بني ملال': 'BENI MELLAL',
  خريبكة: 'KHOURIBGA',
  برشيد: 'BERRECHID',
  'وادي زم': 'OUED ZEM',
  الجديدة: 'EL JADIDA',
  بوجدور: 'BOUDOUR',
};

/** Retourne la clé canonique d'une ville, ou la ville normalisée si inconnue. */
export function canonicalCity(city: string): string {
  const norm = normalizeCity(city);
  return CITY_ALIASES[norm] ?? norm;
}

/**
 * Construit l'ensemble des tokens canoniques d'un ou plusieurs champs texte.
 * Chaque token est mappé via les alias de villes pour comparer dans un référentiel unique.
 */
function buildCanonicalTokenSet(fields: Array<string | null | undefined>): Set<string> {
  const set = new Set<string>();
  for (const field of fields) {
    for (const token of tokenize(field ?? '')) {
      // Réapplique les alias puis re-découpe (ex. « JORF » -> « EL JADIDA » -> [EL, JADIDA]).
      for (const sub of tokenize(canonicalCity(token))) set.add(sub);
    }
  }
  return set;
}

/** Vrai si la ville canonique est présente dans l'ensemble de tokens canoniques. */
function cityInTokenSet(city: string, tokenSet: Set<string>): boolean {
  if (!city) return false;
  return tokenize(city).every((t) => tokenSet.has(t));
}

/**
 * Vrai si le texte (un « Trajet » ou une « Zone ») correspond bien au couple origine/destination.
 * On exige la présence de la destination livrée ; l'origine (dépôt, souvent Mohammedia) est
 * fortement pondérée mais certains trajets locaux ne la mentionnent pas explicitement.
 */
export function routeMatches(
  text: string,
  originCity: string | null | undefined,
  destinationCity: string | null | undefined,
): boolean {
  if (!normalizeCity(text)) return false;
  const destination = canonicalCity(destinationCity ?? '');
  // Sans destination exploitable, on ne peut pas trancher.
  if (!destination) return false;
  return cityInTokenSet(destination, buildCanonicalTokenSet([text]));
}

/** Vrai si la ville de destination (ou d'origine) figure dans la zone/repère/adresse d'un point noir. */
export function blackPointMatches(
  fields: Array<string | null | undefined>,
  originCity: string | null | undefined,
  destinationCity: string | undefined,
): boolean {
  const tokenSet = buildCanonicalTokenSet(fields);
  if (tokenSet.size === 0) return false;
  const destination = canonicalCity(destinationCity ?? '');
  const origin = canonicalCity(originCity ?? '');

  // Priorité à la destination livrée ; l'origine (dépôt) est aussi retenue car les
  // zones autour du dépôt concernent tous les départs.
  if (cityInTokenSet(destination, tokenSet)) return true;
  if (cityInTokenSet(origin, tokenSet)) return true;
  return false;
}
