import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../lib/client';
import { Station, TripSummary } from '../lib/api';
import { fmtLiters, fmtTime, todayIso } from '../lib/format';
import TripMap, { MapStop } from '../components/TripMap';

export default function MapPage() {
  const [date, setDate] = useState(todayIso());
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [t, s] = await Promise.all([
        api.get<TripSummary[]>(`/api/trips${date ? `?date=${date}` : ''}`),
        api.get<Station[]>('/api/stations'),
      ]);
      setTrips(t);
      setStations(s);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Impossible de charger la carte');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const stops: MapStop[] = trips
    .filter((t) => t.stationId != null)
    .map((t): MapStop | null => {
      const st = stations.find((x) => x.id === t.stationId);
      if (!st || st.lat == null || st.lon == null) return null;
      return {
        key: String(t.id),
        lat: st.lat,
        lon: st.lon,
        title: t.tripNum,
        detail: `${st.name} — ${fmtLiters(t.totalLiters)} — départ ${fmtTime(t.plannedDeparture)}`,
        href: `/plan/${t.id}`,
      };
    })
    .filter((x): x is MapStop => x !== null);

  const selTrip = selected != null ? trips.find((t) => t.id === selected) : null;
  const selStation = selTrip ? stations.find((s) => s.id === selTrip.stationId) : null;

  return (
    <div>
      <div className="toolbar">
        <div className="field">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Trips visibles</label>
          <div style={{ color: 'var(--accent-2)', fontWeight: 700 }}>{trips.length}</div>
        </div>
        {error && <div className="error">{error}</div>}
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 340px', gap: 16 }}>
        <div className="card" style={{ padding: 10 }}>
          {loading ? (
            <div className="empty">
              <div className="spinner" style={{ margin: '0 auto' }} />
            </div>
          ) : stops.length === 0 ? (
            <div className="empty">Aucune station géocodée pour cette date.</div>
          ) : (
            <TripMap stops={stops} center={stops.length > 0 ? [stops[0].lat, stops[0].lon] : [32.5, -7.0]} height={560} />
          )}
        </div>

        <div>
          <div className="card">
            <h3>Voyages du jour</h3>
            <div className="alert-list">
              {trips.length === 0 && <div className="empty">Aucun voyage</div>}
              {trips.map((t) => (
                <div
                  key={t.id}
                  className="stat-row"
                  style={{ cursor: 'pointer', background: selected === t.id ? 'rgba(245,166,35,0.08)' : undefined }}
                  onClick={() => setSelected(t.id)}
                >
                  <span className="stat-k">
                    <strong>{t.tripNum}</strong>
                    <br />
                    <span className="malloc">{t.stationName}</span>
                  </span>
                  <span className="stat-v" style={{ textAlign: 'right' }}>
                    {fmtLiters(t.totalLiters)}
                    <br />
                    <Link className="link" to={`/plan/${t.id}`}>
                      Détail
                    </Link>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>Sélection</h3>
            {selTrip ? (
              <div>
                <div className="stat-row"><span className="stat-k">Voyage</span><span className="stat-v">{selTrip.tripNum}</span></div>
                <div className="stat-row"><span className="stat-k">Station</span><span className="stat-v">{selStation?.name ?? selTrip.stationName}</span></div>
                <div className="stat-row"><span className="stat-k">Départ</span><span className="stat-v">{fmtTime(selTrip.plannedDeparture)}</span></div>
                <div className="stat-row"><span className="stat-k">Arrivée</span><span className="stat-v">{fmtTime(selTrip.etaStation)}</span></div>
              </div>
            ) : (
              <div className="empty">Cliquez sur un voyage pour le sélectionner.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}