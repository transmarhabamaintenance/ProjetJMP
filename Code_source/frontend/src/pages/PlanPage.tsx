import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError, api, downloadExport } from '../lib/client';
import { TripSummary } from '../lib/api';
import { fmtLiters, fmtTime, fmtKm, fmtDuration, todayIso } from '../lib/format';

function statusBadge(status: string) {
  switch (status) {
    case 'PLANNED':
      return <span className="badge badge-blue">Planifié</span>;
    default:
      return <span className="badge">{status}</span>;
  }
}

export default function PlanPage() {
  const { isAdmin } = useAuth();
  const [date, setDate] = useState(todayIso());
  const [driver, setDriver] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [city, setCity] = useState('');
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [recalc, setRecalc] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (date) params.set('date', date);
      if (driver) params.set('driver', driver);
      if (vehicle) params.set('vehicle', vehicle);
      if (city) params.set('city', city);
      const qs = params.toString();
      setTrips(await api.get<TripSummary[]>(`/api/trips${qs ? `?${qs}` : ''}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Impossible de charger le plan');
    } finally {
      setLoading(false);
    }
  }, [date, driver, vehicle, city]);

  useEffect(() => {
    void load();
  }, [load]);

  const recalcAll = async () => {
    setRecalc(true);
    setInfo('');
    setError('');
    try {
      const updated = await api.post<TripSummary[]>('/api/trips/recalculate', { ids: [] });
      setTrips(updated);
      setInfo(`${updated.length} voyage(s) recalculé(s).`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur pendant le recalcul');
    } finally {
      setRecalc(false);
    }
  };

  const removeTrip = async (trip: TripSummary) => {
    if (!window.confirm(`Supprimer le voyage ${trip.tripNum ?? trip.id} ?`)) return;
    setError('');
    setInfo('');
    try {
      await api.del(`/api/trips/${trip.id}`);
      setInfo(`Voyage ${trip.tripNum ?? trip.id} supprimé.`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Suppression impossible');
    }
  };

  const download = async (format: 'excel') => {
    setError('');
    try {
      await downloadExport(format, date);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Export impossible');
    }
  };

  const downloadTripExcel = async (trip: TripSummary) => {
    setError('');
    try {
      await downloadExport('excel', date, trip.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Export impossible');
    }
  };

  return (
    <div>
      <div className="toolbar">
        <div className="field">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Chauffeur</label>
          <input type="text" value={driver} onChange={(e) => setDriver(e.target.value)} />
        </div>
        <div className="field">
          <label>Véhicule</label>
          <input type="text" value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
        </div>
        <div className="field">
          <label>Ville</label>
          <input type="text" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div style={{ flex: 1 }} />
        <div className="field" style={{ minWidth: 0 }}>
          <label>&nbsp;</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => void load()} disabled={loading}>
              Filtrer
            </button>
            <button className="btn" onClick={() => void recalcAll()} disabled={recalc || loading}>
              {recalc ? 'Recalcul…' : 'Recalculer tout'}
            </button>
            <button className="btn" type="button" onClick={() => void download('excel')}>
              Excel
            </button>
          </div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {info && <div className="success">{info}</div>}

      <div className="card">
        {loading ? (
          <div className="empty">
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : trips.length === 0 ? (
          <div className="empty">Aucun voyage pour ces critères. Importez un programme Excel.</div>
        ) : (
          <div style={{ overflow: 'auto', maxHeight: '70vh' }}>
            <table>
              <thead>
                <tr>
                  <th>Voyage</th>
                  <th>Date</th>
                  <th>Départ</th>
                  <th>Station</th>
                  <th>Ville</th>
                  <th>Chauffeur</th>
                  <th>Véhicule</th>
                  <th>Litres</th>
                  <th>Distance</th>
                  <th>Arrivée prévue</th>
                  <th>Fin décharg.</th>
                  <th>Durée</th>
                  <th>Statut</th>
                  <th>Excel</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {trips.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link className="link" to={`/plan/${t.id}`}>
                        {t.tripNum}
                      </Link>
                    </td>
                    <td>{t.tourDate?.slice(0, 10) ?? '—'}</td>
                    <td>{fmtTime(t.plannedDeparture)}</td>
                    <td>{t.stationName}</td>
                    <td>{t.city}</td>
                    <td>{t.driverName}</td>
                    <td>{t.vehicleId}</td>
                    <td>{fmtLiters(t.totalLiters)}</td>
                    <td>
                      {fmtKm(t.distanceOneWayKm)}
                      {t.fallbackUsed && <span className="badge badge-yellow" title="Distance estimée (repli)">≈</span>}
                    </td>
                    <td>{fmtTime(t.etaStation)}</td>
                    <td>{fmtTime(t.endUnloading)}</td>
                    <td>{fmtDuration(t.totalDurationMin)}</td>
                    <td>{statusBadge(t.status)}</td>
                    <td>
                      <button
                        className="btn btn-small btn-primary"
                        type="button"
                        onClick={() => void downloadTripExcel(t)}
                        title={`Exporter le voyage ${t.tripNum ?? t.id} en Excel`}
                      >
                        Excel
                      </button>
                    </td>
                    {isAdmin && (
                      <td>
                        <button className="btn btn-small btn-danger" type="button" onClick={() => void removeTrip(t)}>
                          Supprimer
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}