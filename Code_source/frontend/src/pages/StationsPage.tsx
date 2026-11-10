import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { ApiError, api } from '../lib/client';
import { Station } from '../lib/api';

interface EditState {
  lat: string;
  lon: string;
}

export default function StationsPage() {
  const { isAdmin } = useAuth();
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [edit, setEdit] = useState<EditState>({ lat: '', lon: '' });
  const [onlyUnconfirmed, setOnlyUnconfirmed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setStations(await api.get<Station[]>('/api/stations'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Impossible de charger les stations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (s: Station) => {
    setEditing(s.id);
    setEdit({ lat: s.lat != null ? String(s.lat) : '', lon: s.lon != null ? String(s.lon) : '' });
  };

  const save = async (id: number) => {
    setError('');
    setInfo('');
    try {
      await api.put<Station>(`/api/stations/${id}`, {
        lat: edit.lat === '' ? null : Number(edit.lat),
        lon: edit.lon === '' ? null : Number(edit.lon),
        confirmed: true,
      });
      setEditing(null);
      setInfo('Coordonnées enregistrées.');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur lors de l’enregistrement');
    }
  };

  const visible = onlyUnconfirmed ? stations.filter((s) => !s.geocodeConfirmed) : stations;

  return (
    <div>
      <div className="toolbar">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={onlyUnconfirmed} onChange={(e) => setOnlyUnconfirmed(e.target.checked)} />
          Afficher uniquement les stations non confirmées
        </label>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={() => void load()} disabled={loading}>
          Rafraîchir
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {info && <div className="success">{info}</div>}

      <div className="card">
        {loading ? (
          <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : visible.length === 0 ? (
          <div className="empty">Aucune station. Importez un programme pour les créer.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Station</th>
                <th>Ville</th>
                <th>Latitude</th>
                <th>Longitude</th>
                <th>Source</th>
                <th>Confirmée</th>
                <th>Voyages</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.city}</td>
                  <td>
                    {editing === s.id ? (
                      <input type="number" step="0.0001" value={edit.lat} onChange={(e) => setEdit({ ...edit, lat: e.target.value })} />
                    ) : (
                      s.lat ?? '—'
                    )}
                  </td>
                  <td>
                    {editing === s.id ? (
                      <input type="number" step="0.0001" value={edit.lon} onChange={(e) => setEdit({ ...edit, lon: e.target.value })} />
                    ) : (
                      s.lon ?? '—'
                    )}
                  </td>
                  <td>{s.geocodeSource ?? '—'}</td>
                  <td>
                    {s.geocodeConfirmed ? (
                      <span className="badge badge-green">Oui</span>
                    ) : (
                      <span className="badge badge-yellow">Non</span>
                    )}
                  </td>
                  <td>{s.tripsCount}</td>
                  <td>
                    {editing === s.id ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-primary" onClick={() => void save(s.id)}>Enregistrer</button>
                        <button className="btn btn-sm" onClick={() => setEditing(null)}>Annuler</button>
                      </div>
                    ) : isAdmin ? (
                      <button className="btn btn-sm" onClick={() => startEdit(s)}>Corriger</button>
                    ) : (
                      <span className="hint">lecture seule</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}