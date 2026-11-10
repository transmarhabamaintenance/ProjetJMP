/**
 * Normalisation des chaînes issues du fichier Excel : trim, espaces multiples réduits,
 * espaces insécables (U+00A0 / U+202F) gérés ; clé insensible à la casse.
 */
export function normalize(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim().replace(/\u00A0/g, ' ').replace(/\u202F/g, ' ').trim();
  if (trimmed === '') return null;
  return trimmed.replace(/[\s\u2000-\u200A\u202F\u205F\u3000\u00A0]+/g, ' ');
}

/** Clé de comparaison insensible à la casse ; deux produits avec la même clé sont identiques. */
export function materialKey(value: string | null | undefined): string | null {
  const normalized = normalize(value);
  return normalized == null ? null : normalized.toLowerCase();
}
