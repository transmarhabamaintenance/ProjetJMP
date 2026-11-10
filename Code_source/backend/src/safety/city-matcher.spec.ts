import { normalizeCity, tokenize, canonicalCity, routeMatches, blackPointMatches } from './city-matcher';

describe('city-matcher', () => {
  describe('normalizeCity', () => {
    it('supprime accents, ponctuation et met en majuscules', () => {
      expect(normalizeCity('Mohammedia')).toBe('MOHAMMEDIA');
      expect(normalizeCity('Bénï Mellal')).toBe('BENI MELLAL');
      expect(normalizeCity('  JORF -MARRAKECH ')).toBe('JORF MARRAKECH');
    });

    it('gère les valeurs vides', () => {
      expect(normalizeCity(null)).toBe('');
      expect(normalizeCity(undefined)).toBe('');
      expect(normalizeCity('')).toBe('');
    });
  });

  describe('tokenize', () => {
    it('découpe en tokens propres', () => {
      expect(tokenize('MOHAMMEDIA - TANGER')).toEqual(['MOHAMMEDIA', 'TANGER']);
    });
  });

  describe('canonicalCity', () => {
    it('résout les alias français', () => {
      expect(canonicalCity('CASA')).toBe('CASABLANCA');
      expect(canonicalCity('JORF')).toBe('EL JADIDA');
      expect(canonicalCity('BERECHID')).toBe('BERRECHID');
    });

    it('conserve une ville inconnue normalisée', () => {
      expect(canonicalCity('OUTAT EL HAJ')).toBe('OUTAT EL HAJ');
    });
  });

  describe('routeMatches', () => {
    it('matche quand la destination figure dans le trajet', () => {
      expect(routeMatches('MOHAMMEDIA-TANGER', 'MOHAMMEDIA', 'TANGER')).toBe(true);
      expect(routeMatches('MOHAMMEDIA-JERF-SAFI', 'MOHAMMEDIA', 'SAFI')).toBe(true);
    });

    it('ne matche pas une destination absente', () => {
      expect(routeMatches('MOHAMMEDIA-TANGER', 'MOHAMMEDIA', 'SAFI')).toBe(false);
    });

    it('ne tranche pas sans destination exploitable', () => {
      expect(routeMatches('MOHAMMEDIA-TANGER', 'MOHAMMEDIA', undefined)).toBe(false);
    });
  });

  describe('blackPointMatches', () => {
    it('matche sur la destination livrée', () => {
      expect(blackPointMatches(['Tanger', 'Autoroute Tanger de Lakser lkbir'], 'MOHAMMEDIA', 'TANGER')).toBe(true);
    });

    it('matche sur la zone autour du dépôt (origine)', () => {
      expect(blackPointMatches(['Mohammedia ouest', 'Autoroute de media'], 'MOHAMMEDIA', 'TANGER')).toBe(true);
    });

    it('ne matche pas une zone sans rapport', () => {
      expect(blackPointMatches(['Agadir', 'agadir'], 'MOHAMMEDIA', 'TANGER')).toBe(false);
    });

    it('gère les alias', () => {
      expect(blackPointMatches(['Casa', 'Gaz II 800 m'], 'MOHAMMEDIA', 'CASABLANCA')).toBe(true);
    });
  });
});
