import { distanceKm, estimateRoadKm } from './haversine';

describe('HaversineUtil', () => {
  it('distance sur l\'équateur', () => {
    const km = distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    expect(Math.abs(km - 111.19)).toBeLessThan(1.0);
  });

  it('distance Mohammedia -> Tanger', () => {
    const km = distanceKm({ lat: 33.6866, lon: -7.383 }, { lat: 35.7595, lon: -5.834 });
    expect(km).toBeGreaterThan(240);
    expect(km).toBeLessThan(300);
  });

  it('estimation routière = vol d\'oiseau × 1,3', () => {
    const a = { lat: 33.6866, lon: -7.383 };
    const b = { lat: 35.7595, lon: -5.834 };
    expect(Math.abs(estimateRoadKm(a, b) - distanceKm(a, b) * 1.3)).toBeLessThan(0.001);
  });
});
