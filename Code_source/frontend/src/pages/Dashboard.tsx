
import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ApiError, api } from '../lib/client';
import { Stats } from '../lib/api';
import { fmtKm, todayIso } from '../lib/format';

const COLORS = ['#f5a623', '#34c98f', '#4aa8f5', '#ef5350', '#ab8ef5', '#f5d66b', '#6bc9f5', '#f08fb0'];

function toChart(map: Record<string, number>): { name: string; value: number }[] {
  return Object.entries(map ?? {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export default function Dashboard() {
  const [date, setDate] = useState(todayIso());
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError('');
    try {
      setStats(await api.get<Stats>(`/api/stats?date=${d}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Impossible de charger les statistiques');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(date);
  }, [date, load]);

  const liters = toChart(stats?.litersByProduct ?? {});
  const km = toChart(stats?.kmByDriver ?? {});
  const hours = toChart(stats?.hoursByVehicle ?? {});

  return (
    <div>
      <div className="toolbar">
        <div className="field">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {loading && <div className="spinner" />}

      {!loading && stats && (
        <>
          <div className="grid kpis">
            <div className="kpi">
              <div className="kpi-value">{stats.tripsCount}</div>
              <div className="kpi-label">Voyages planifiés</div>
            </div>
            <div className="kpi">
              <div className="kpi-value">{fmtKm(Math.round(stats.totalDistanceKm))}</div>
              <div className="kpi-label">Distance totale (A/R)</div>
            </div>
            <div className="kpi">
              <div className="kpi-value">{stats.totalDurationHours} h</div>
              <div className="kpi-label">Durée totale de conduite</div>
            </div>
            <div className="kpi">
              <div className="kpi-value">{stats.litersByProduct ? Object.values(stats.litersByProduct).reduce((a, b) => a + b, 0).toLocaleString('fr-FR') : 0}</div>
              <div className="kpi-label">Litres planifiés</div>
            </div>
          </div>

          <div className="grid mt-12" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card">
              <h3>Litres par produit</h3>
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={liters} dataKey="value" nameKey="name" label={(e: { name?: string }) => e.name} labelLine={false} outerRadius={120}>
                      {liters.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1c2530', border: '1px solid #2c3a4a', borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <h3>Kilomètres par chauffeur</h3>
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={km} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2c3a4a" />
                    <XAxis type="number" stroke="#8ba0b4" />
                    <YAxis type="category" dataKey="name" width={140} stroke="#8ba0b4" />
                    <Tooltip contentStyle={{ background: '#1c2530', border: '1px solid #2c3a4a', borderRadius: 8 }} />
                    <Bar dataKey="value" fill="#f5a623" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <h3>Heures de conduite par véhicule</h3>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hours} margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2c3a4a" />
                    <XAxis dataKey="name" stroke="#8ba0b4" />
                    <YAxis stroke="#8ba0b4" />
                    <Tooltip contentStyle={{ background: '#1c2530', border: '1px solid #2c3a4a', borderRadius: 8 }} />
                    <Bar dataKey="value" fill="#4aa8f5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <h3>Aperçu par produit</h3>
              {liters.map((l, i) => (
                <div className="stat-row" key={l.name}>
                  <span className="stat-k" style={{ color: COLORS[i % COLORS.length] }}>{l.name}</span>
                  <span className="stat-v">{l.value.toLocaleString('fr-FR')} L</span>
                </div>
              ))}
              {liters.length === 0 && <div className="empty">Aucun produit planifié</div>}
            </div>
          </div>
        </>
      )}

      {!loading && !stats && !error && <div className="empty">Importez un programme Excel pour voir les statistiques.</div>}
    </div>
  );
}