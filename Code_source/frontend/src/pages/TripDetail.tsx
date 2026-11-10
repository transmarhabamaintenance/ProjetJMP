import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError, api, downloadExport } from '../lib/client';
import { TripDetail as TripDetailDto, TripPatchRequest } from '../lib/api';
import { fmtDuration, fmtKm, fmtLiters, fmtMoney, fmtTime } from '../lib/format';
import TripMap from '../components/TripMap';

export default function TripDetail() {
  const { isAdmin } = useAuth();
  const { id } = useParams();
  const [detail, setDetail] = useState<TripDetailDto | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TripPatchRequest>({});
  const [lines, setLines] = useState<{ materialName: string; liters: string }[]>([]);

  const load = useCallback(async () => {
    setError('');
    try {
      const d = await api.get<TripDetailDto>(`/api/trips/${id}`);
      setDetail(d);
      setForm({
        plannedDeparture: d.summary.plannedDeparture,
        driverName: d.summary.driverName,
        vehicleId: d.summary.vehicleId,
        customerName: d.summary.customerName,
        tranche: d.summary.tranche,
      });
      setLines(d.lines.map((l) => ({ materialName: l.materialName, liters: String(l.liters) })));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Voyage introuvable');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setInfo('');
    setError('');
    try {
      const body: TripPatchRequest = {
        ...form,
        lines: lines
          .filter((l) => l.materialName.trim() !== '' || l.liters.trim() !== '')
          .map((l) => ({ materialName: l.materialName.trim(), liters: Number(l.liters) })),
      };
      if (body.plannedDeparture) {
        body.plannedDeparture = body.plannedDeparture.includes(':') && body.plannedDeparture.length <= 16
          ? `${body.plannedDeparture}:00`
          : body.plannedDeparture;
      }
      await api.patch<TripDetailDto>(`/api/trips/${id}`, body);
      await load();
      setInfo('Voyage mis à jour et recalculé.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  };

  const recalc = async () => {
    setSaving(true);
    setInfo('');
    setError('');
    try {
      await api.post(`/api/trips/recalculate`, { ids: [Number(id)] });
      await load();
      setInfo('Voyage recalculé.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur lors du recalcul');
    } finally {
      setSaving(false);
    }
  };

  if (!detail) {
    return (
      <div>
        {error ? (
          <div className="error">
            {error} <Link className="link" to="/plan">Retour au plan</Link>
          </div>
        ) : (
          <div className="spinner" />
        )}
      </div>
    );
  }

  const s = detail.summary;
  const departureIso = s.plannedDeparture ? s.plannedDeparture.replace(' ', 'T') : null;
  const departureInput = s.plannedDeparture ? s.plannedDeparture.slice(0, 16) : '';

  return (
    <div>
      <div className="toolbar">
        <Link className="btn" to="/plan">← Retour au plan</Link>
        <button className="btn" onClick={() => void recalc()} disabled={saving}>
          Recalculer ce voyage
        </button>
        <button
          className="btn"
          onClick={async () => {
            try {
              await downloadExport('excel', undefined, s.id);
            } catch (e) {
              setError(e instanceof ApiError ? e.message : 'Export JMP impossible');
            }
          }}
        >
          Exporter JMP (Excel)
        </button>
        <button className="btn btn-primary" onClick={() => void save()} disabled={saving || !isAdmin}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {!isAdmin && <span className="hint">Modifier un voyage est réservé à un administrateur.</span>}
        {info && <span className="success" style={{ padding: '6px 10px' }}>{info}</span>}
        {error && <span className="error" style={{ padding: '6px 10px' }}>{error}</span>}
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div>
          <div className="card">
            <h3>{s.tripNum} — {s.city}</h3>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              <div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{fmtKm(s.distanceOneWayKm)}</div>
                <div className="kpi-label">Aller</div>
              </div>
              <div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{fmtKm(s.distanceRoundTripKm)}</div>
                <div className="kpi-label">A/R</div>
              </div>
              <div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{fmtDuration(s.drivingMinOneWay)}</div>
                <div className="kpi-label">Conduite aller</div>
              </div>
              <div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{fmtDuration(s.breakMinutes)}</div>
                <div className="kpi-label">Pauses</div>
              </div>
              <div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{fmtLiters(s.totalLiters)}</div>
                <div className="kpi-label">Volume</div>
              </div>
              <div>
                <div className="kpi-value" style={{ fontSize: 18 }}>
                  {s.estimatedFuelLiters != null ? `${s.estimatedFuelLiters.toFixed(0)} L` : '—'}
                  <span className="malloc">{s.estimatedFuelCost != null ? ` (${fmtMoney(s.estimatedFuelCost)})` : ''}</span>
                </div>
                <div className="kpi-label">Carburant consommé</div>
              </div>
            </div>

            {s.warnings?.length > 0 && (
              <div className="mt-12">
                {s.warnings.map((w, i) => (
                  <div className="warning" key={i}>⚠ {w}</div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3>Chronologie</h3>
            <div className="timeline">
              <div className="timeline-item">
                <div className="timeline-time">{fmtTime(departureIso)}</div>
                <div className="timeline-label">Départ du dépôt {detail.plantName}</div>
              </div>
              <div className="timeline-item muted">
                <div className="timeline-time">+{s.adminMinutes ?? 0} min</div>
                <div className="timeline-label">Formalités / chargement</div>
              </div>
              <div className="timeline-item">
                <div className="timeline-time">{fmtTime(s.etaStation)}</div>
                <div className="timeline-label">Arrivée station {s.stationName}</div>
              </div>
              <div className="timeline-item muted">
                <div className="timeline-time">{s.unloadingMinutes ?? 0} min</div>
                <div className="timeline-label">Déchargement</div>
              </div>
              <div className="timeline-item">
                <div className="timeline-time">{fmtTime(s.endUnloading)}</div>
                <div className="timeline-label">Fin de déchargement</div>
              </div>
              {s.includeReturn && (
                <div className="timeline-item">
                  <div className="timeline-time">{fmtTime(s.etaReturnPlant)}</div>
                  <div className="timeline-label">Retour dépôt</div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <h3>Lignes produit</h3>
            <table>
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Volume</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.materialName}</td>
                    <td>{fmtLiters(l.liters)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="card">
            <h3>Itinéraire</h3>
            <TripMap
              depLat={detail.plantLat}
              depLon={detail.plantLon}
              depLabel={detail.plantName ?? ''}
              stnLat={detail.stationLat}
              stnLon={detail.stationLon}
              stnLabel={s.stationName ?? ''}
              geometry={detail.routeGeometry}
              height={320}
            />
            <div className="stat-row">
              <span className="stat-k">Source géocodage</span>
              <span className="stat-v">{detail.geocodeSource ?? '—'} {detail.geocodeConfirmed ? '(confirmé)' : ''}</span>
            </div>
            <div className="stat-row">
              <span className="stat-k">Coordonnées station</span>
              <span className="stat-v">{detail.stationLat != null ? `${detail.stationLat}, ${detail.stationLon}` : '—'}</span>
            </div>
          </div>

          <div className="card">
            <h3>Modifier le voyage</h3>
            <div className="form-grid">
              <div className="field">
                <label>Départ planifié</label>
                <input
                  type="datetime-local"
                  value={departureInput}
                  onChange={(e) => setForm({ ...form, plannedDeparture: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Chauffeur</label>
                <input
                  type="text"
                  value={form.driverName ?? ''}
                  onChange={(e) => setForm({ ...form, driverName: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Véhicule</label>
                <input
                  type="text"
                  value={form.vehicleId ?? ''}
                  onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Client</label>
                <input
                  type="text"
                  value={form.customerName ?? ''}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Tranche</label>
                <input
                  type="number"
                  value={form.tranche ?? ''}
                  onChange={(e) => setForm({ ...form, tranche: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="mt-12">
              <h3>Lignes produit (à saisir après un import JIT)</h3>
              {lines.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input
                    type="text"
                    placeholder="Produit (Material Name)"
                    value={l.materialName}
                    onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, materialName: e.target.value } : x)))}
                    style={{ flex: 2 }}
                  />
                  <input
                    type="number"
                    placeholder="Litres"
                    value={l.liters}
                    onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, liters: e.target.value } : x)))}
                    style={{ flex: 1 }}
                  />
                  <button className="btn" type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </div>
              ))}
              <button className="btn" type="button" onClick={() => setLines([...lines, { materialName: '', liters: '' }])}>
                + Ajouter une ligne
              </button>
            </div>

            <div className="mt-12" style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={() => void save()} disabled={saving || !isAdmin}>
                Enregistrer
              </button>
              <button className="btn" onClick={() => void load()}>Réinitialiser</button>
              {!isAdmin && <span className="hint">réservé à un administrateur</span>}
            </div>
          </div>

          <div className="card">
            <h3>Informations</h3>
            <div className="stat-row"><span className="stat-k">Sales order</span><span className="stat-v">{s.salesOrder}</span></div>
            <div className="stat-row"><span className="stat-k">Pat.Doc</span><span className="stat-v">{s.patDoc}</span></div>
            <div className="stat-row"><span className="stat-k">Véhicule</span><span className="stat-v">{s.vehicleId}</span></div>
            <div className="stat-row"><span className="stat-k">Statut</span><span className="stat-v">{s.status}</span></div>
            <div className="stat-row"><span className="stat-k">Calculé le</span><span className="stat-v">{s.computedAt ? s.computedAt.slice(0, 16).replace('T', ' ') : '—'}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}