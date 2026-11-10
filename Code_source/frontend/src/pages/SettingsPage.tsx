import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { ApiError, api } from '../lib/client';
import { Settings } from '../lib/api';

type NumericKey =
  | 'heavyTruckFactor'
  | 'averageSpeedKmh'
  | 'breakAfterMinutes'
  | 'breakDurationMinutes'
  | 'loadingMinutes'
  | 'unloadingMinutes'
  | 'adminMinutes'
  | 'maxDrivingMinutesPerDay'
  | 'standardTankLiters'
  | 'fuelConsumptionLPer100'
  | 'fuelPricePerLiter';
type BoolKey = 'noNightDriving' | 'includeReturn';
type StringKey = 'defaultDepartureTime' | 'nightStart' | 'nightEnd';

const NUMERIC: { key: NumericKey; label: string; step?: number }[] = [
  { key: 'heavyTruckFactor', label: 'Facteur poids lourd (× voiture)', step: 0.05 },
  { key: 'averageSpeedKmh', label: 'Vitesse moyenne (km/h)', step: 1 },
  { key: 'breakAfterMinutes', label: 'Pause après (min de conduite)', step: 5 },
  { key: 'breakDurationMinutes', label: 'Durée de pause (min)', step: 5 },
  { key: 'loadingMinutes', label: 'Chargement (min)', step: 5 },
  { key: 'unloadingMinutes', label: 'Déchargement (min)', step: 5 },
  { key: 'adminMinutes', label: 'Formalités / admin (min)', step: 5 },
  { key: 'maxDrivingMinutesPerDay', label: 'Conduite max / jour (min)', step: 15 },
  { key: 'standardTankLiters', label: 'Capacité citerne (L)', step: 500 },
  { key: 'fuelConsumptionLPer100', label: 'Consommation (L/100 km)', step: 0.5 },
  { key: 'fuelPricePerLiter', label: 'Prix carburant (DH/L)', step: 0.1 },
];

const BOOLEAN: { key: BoolKey; label: string }[] = [
  { key: 'noNightDriving', label: 'Interdire la conduite de nuit' },
  { key: 'includeReturn', label: 'Inclure le trajet retour par défaut' },
];

const STRING: { key: StringKey; label: string; type?: string }[] = [
  { key: 'defaultDepartureTime', label: 'Heure de départ par défaut', type: 'time' },
  { key: 'nightStart', label: 'Début plage nuit', type: 'time' },
  { key: 'nightEnd', label: 'Fin plage nuit', type: 'time' },
];

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setSettings(await api.get<Settings>('/api/settings'));
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Impossible de charger les paramètres');
      }
    })();
  }, []);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError('');
    setInfo('');
    try {
      setSettings(await api.put<Settings>('/api/settings', settings));
      setInfo('Paramètres enregistrés.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return error ? <div className="error">{error}</div> : <div className="spinner" />;
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}
      {info && <div className="success">{info}</div>}

      <div className="card">
        <h3>Règles de conduite</h3>
        <div className="form-grid">
          <div className="field">
            <label>Méthode de calcul des distances</label>
            <select
              value={settings.drivingMethod}
              onChange={(e) => set('drivingMethod', e.target.value as Settings['drivingMethod'])}
            >
              <option value="OSRM">OSRM (routes réelles)</option>
              <option value="AVERAGE_SPEED">Vol d'oiseau (repli vitesse moyenne)</option>
            </select>
          </div>
          {STRING.map((f) => (
            <div className="field" key={f.key}>
              <label>{f.label}</label>
              <input type={f.type ?? 'text'} value={settings[f.key]} onChange={(e) => set(f.key, e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Temps de manutention & pauses</h3>
        <div className="form-grid">
          {NUMERIC.map((f) => (
            <div className="field" key={f.key}>
              <label>{f.label}</label>
              <input
                type="number"
                step={f.step}
                value={settings[f.key]}
                onChange={(e) => set(f.key, Number(e.target.value))}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Options</h3>
        <div className="form-grid">
          {BOOLEAN.map((f) => (
            <div className="field" key={f.key}>
              <label>{f.label}</label>
              <input type="checkbox" checked={settings[f.key]} onChange={(e) => set(f.key, e.target.checked)} />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-12">
        <button className="btn btn-primary" onClick={() => void save()} disabled={saving || !isAdmin}>
          {saving ? 'Enregistrement…' : 'Enregistrer les paramètres'}
        </button>
        {!isAdmin && <span className="hint" style={{ marginLeft: 10 }}>Seul un administrateur peut modifier les paramètres.</span>}
      </div>
    </div>
  );
}