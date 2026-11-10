import { GeoPoint } from './geo-point';

/**
 * Repli interne : coordonnées approximatives des centres-villes marocains.
 * Utilisé quand Nominatim ne trouve pas la station ; reste « non confirmé ».
 */
const CITY_CENTERS: Record<string, GeoPoint> = {
  TANGER: { lat: 35.7595, lon: -5.834 },
  'TANGER-ASSILAH': { lat: 35.7595, lon: -5.834 },
  MARRAKECH: { lat: 31.6295, lon: -7.9811 },
  'OUTAT EL HAJ': { lat: 33.3768, lon: -3.6855 },
  CASABLANCA: { lat: 33.5731, lon: -7.5898 },
  MOHAMMEDIA: { lat: 33.6866, lon: -7.383 },
  RABAT: { lat: 34.0209, lon: -6.8416 },
  SALE: { lat: 34.0531, lon: -6.8223 },
  'SALA AL JADIDA': { lat: 33.6089, lon: -7.3609 },
  FES: { lat: 34.0333, lon: -5.0 },
  MEKNES: { lat: 33.8935, lon: -5.5473 },
  AGADIR: { lat: 30.4278, lon: -9.5981 },
  KENITRA: { lat: 34.261, lon: -6.5802 },
  OUJDA: { lat: 34.6814, lon: -1.9086 },
  NADOR: { lat: 35.1681, lon: -2.933 },
  SAFI: { lat: 32.2994, lon: -9.2372 },
  'EL JADIDA': { lat: 33.2316, lon: -8.5007 },
  'BENI MELLAL': { lat: 32.3373, lon: -6.3498 },
  SETTAT: { lat: 33.001, lon: -7.6167 },
  KHOURIBGA: { lat: 32.8811, lon: -6.9063 },
  TAZA: { lat: 34.2136, lon: -4.0033 },
  OUARZAZATE: { lat: 30.9335, lon: -6.893 },
  ESSAOUIRA: { lat: 31.5085, lon: -9.7595 },
  LAYOUNE: { lat: 27.1536, lon: -13.2033 },
  TETOUAN: { lat: 35.5785, lon: -5.3684 },
  'AL HOCEIMA': { lat: 35.244, lon: -3.931 },
  ERRACHIDIA: { lat: 31.9314, lon: -4.4245 },
  GUELMIM: { lat: 28.988, lon: -10.0574 },
  TAROUDANT: { lat: 30.4703, lon: -8.8767 },
  LARACHE: { lat: 35.1932, lon: -6.1558 },
  'SIDI KACEM': { lat: 34.2113, lon: -5.7117 },
  'SIDI SLIMANE': { lat: 34.2632, lon: -5.9252 },
  TAOURIRT: { lat: 34.4073, lon: -2.897 },
  KHENIFRA: { lat: 32.9359, lon: -5.6617 },
};

/** Centre-ville approximatif d'une ville marocaine connue, ou null. */
export function centerOf(city: string | null | undefined): GeoPoint | null {
  if (!city || !city.trim()) {
    return null;
  }
  return CITY_CENTERS[key(city)] ?? null;
}

function key(city: string): string {
  let normalized = city.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // suppression des non-latins (ex. « ل »), conservation des espaces
  normalized = normalized.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized.toUpperCase();
}
