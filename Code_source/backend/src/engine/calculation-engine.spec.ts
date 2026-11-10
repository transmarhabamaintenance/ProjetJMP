import { DrivingMethod } from '../domain/enums';
import { PlanningSettings } from '../entities/planning-settings.entity';
import { CalculationEngine, NIGHT_WARNING, PlanInput } from './calculation-engine';

/**
 * Tests du moteur : pauses, ETA, nuit, départ auto, retour.
 */
describe('CalculationEngine', () => {
  const engine = new CalculationEngine();
  let settings: PlanningSettings;

  beforeEach(() => {
    settings = new PlanningSettings();
  });

  const date2026_10_09 = () => new Date(2026, 9, 9);
  const on = (h: number, m: number) => new Date(2026, 9, 9, h, m, 0);

  // ----- Pauses -----

  it('calcule les pauses par blocs de conduite', () => {
    expect(engine.breakCount(270, settings)).toBe(0);
    expect(engine.breakCount(300, settings)).toBe(1);
    expect(engine.breakCount(540, settings)).toBe(1);
    expect(engine.breakCount(541, settings)).toBe(2);
    expect(engine.breakCount(100, settings)).toBe(0);
  });

  it('applique le seuil de pause configurable', () => {
    settings.breakAfterMinutes = 200;
    expect(engine.breakCount(350, settings)).toBe(1);
  });

  // ----- Durée de conduite -----

  it('applique le coefficient poids lourd sur la durée OSRM', () => {
    expect(engine.drivingMinutesOneWay(332, 240, settings)).toBe(300);
  });

  it('utilise la vitesse moyenne si OSRM indisponible', () => {
    expect(engine.drivingMinutesOneWay(300, null, settings)).toBe(277);
  });

  it('utilise la vitesse moyenne si le mode est AVERAGE_SPEED', () => {
    settings.drivingMethod = DrivingMethod.AVERAGE_SPEED;
    expect(engine.drivingMinutesOneWay(300, 240, settings)).toBe(277);
  });

  // ----- Planification complète (aller-retour Tanger) -----

  it('planifie un voyage aller-retour', () => {
    const date = date2026_10_09();
    const input: PlanInput = { distanceOneWayKm: 332, routeDurationCarMin: 240, tourDate: date, departure: on(6, 0), settings };
    const result = engine.calculate(input);

    expect(result.distanceOneWayKm).toBe(332);
    expect(result.distanceRoundTripKm).toBe(664);
    expect(result.drivingMinOneWay).toBe(300);
    expect(result.drivingMinRoundTrip).toBe(600);
    expect(result.breakMinutes).toBe(90);
    expect(result.etaStation.getTime()).toBe(on(12, 0).getTime());
    expect(result.endUnloading.getTime()).toBe(on(13, 0).getTime());
    expect(result.etaReturnPlant.getTime()).toBe(on(18, 45).getTime());
    expect(result.totalDurationMin).toBe(765);
    expect(result.loadingMinutes).toBe(60);
    expect(result.unloadingMinutes).toBe(60);
    expect(result.warnings.some((w) => w.includes('limite de 9 h'))).toBe(true);
  });

  // ----- Conduite de nuit -----

  it('détecte une conduite de nuit', () => {
    expect(engine.overlapsNight(new Date(2026, 9, 9, 20, 0), new Date(2026, 9, 9, 22, 0), settings)).toBe(true);
    expect(engine.overlapsNight(new Date(2026, 9, 9, 6, 0), new Date(2026, 9, 9, 12, 0), settings)).toBe(false);
    expect(engine.overlapsNight(new Date(2026, 9, 9, 23, 0), new Date(2026, 9, 10, 7, 0), settings)).toBe(true);
  });

  it('signale un voyage de nuit', () => {
    const result = engine.calculate({
      distanceOneWayKm: 700, routeDurationCarMin: 480, tourDate: date2026_10_09(), departure: on(18, 0), settings,
    });
    expect(result.warnings.some((w) => w.includes(NIGHT_WARNING))).toBe(true);
  });

  it('propose le départ le plus tôt qui évite la nuit', () => {
    settings.noNightDriving = true;
    const date = date2026_10_09();
    const proposed = engine.earliestNightFreeDeparture(date, 300, null, settings);
    expect(engine.hasNightDriving(proposed, 300, null, settings)).toBe(false);
    const minutes = proposed.getHours() * 60 + proposed.getMinutes();
    expect(proposed.getHours() < 7).toBe(true);
    expect(minutes).toBeGreaterThanOrEqual(0);
  });

  // ----- Option retour / heure par défaut -----

  it('sans retour le voyage se termine au déchargement', () => {
    settings.includeReturn = false;
    const result = engine.calculate({
      distanceOneWayKm: 332, routeDurationCarMin: 240, tourDate: date2026_10_09(), departure: on(6, 0), settings,
    });
    expect(result.etaReturnPlant.getTime()).toBe(result.endUnloading.getTime());
    expect(result.distanceRoundTripKm).toBe(332);
    expect(result.totalDurationMin).toBe(420);
  });

  it('applique l\'heure de départ par défaut', () => {
    settings.defaultDepartureTime = '08:30';
    const result = engine.calculate({
      distanceOneWayKm: 100, routeDurationCarMin: 60, tourDate: date2026_10_09(), departure: null, settings,
    });
    expect(result.plannedDeparture.getTime()).toBe(on(8, 30).getTime());
  });
});
