import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../lib/client';
import { SafetyCounts, SafetyImportReport } from '../lib/api';

export default function SafetyPage() {
  const [counts, setCounts] = useState<SafetyCounts | null>(null);
  const [report, setReport] = useState<SafetyImportReport | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const loadCounts = useCallback(async () => {
    setError('');
    try {
      setCounts(await api.get<SafetyCounts>('/api/safety/counts'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Impossible de charger les données de sûreté');
    }
  }, []);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  const importData = async () => {
    setLoading(true);
    setError('');
    setInfo('');
    setReport(null);
    try {
      const r = await api.post<SafetyImportReport>('/api/safety/import');
      setReport(r);
      setInfo(
        `Import terminé : ${r.restStops} stations de repos, ${r.blackPoints} points noirs (${r.source}).`,
      );
      void loadCounts();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "L'import de sûreté a échoué");
    } finally {
      setLoading(false);
    }
  };

  if (!counts) {
    return error ? <div className="error">{error}</div> : <div className="spinner" />;
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}
      {info && <div className="success">{info}</div>}

      <div className="card">
        <h3>Données de sûreté</h3>
        <div className="grid mt-12" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <div className="kpi">
            <div className="kpi-value">{counts.restStops}</div>
            <div className="kpi-label">Stations de repos</div>
          </div>
          <div className="kpi">
            <div className="kpi-value">{counts.blackPoints}</div>
            <div className="kpi-label">Points noirs</div>
          </div>
        </div>
      </div>

      <div className="mt-12">
        <button
          className="btn btn-primary"
          onClick={() => void importData()}
          disabled={loading}
        >
          {loading ? 'Import en cours…' : 'Recharger les données de sûreté (samples/)'}
        </button>
      </div>

      {report && (
        <div className="card mt-12">
          <h3>Dernier rapport d'import</h3>
          <div className="form-grid">
            <div className="field">
              <label>Source</label>
              <div>{report.source}</div>
            </div>
            <div className="field">
              <label>Stations de repos</label>
              <div>{report.restStops}</div>
            </div>
            <div className="field">
              <label>Points noirs</label>
              <div>{report.blackPoints}</div>
            </div>
            <div className="field">
              <label>Répartition par type de point noir</label>
              <div className="alert-list">
                {Object.entries(report.byKind).map(([kind, n]) => (
                  <div key={kind} style={{ margin: '4px 0' }}>
                    {kind} : {n}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
