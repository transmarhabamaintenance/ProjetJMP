import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../lib/client';
import { ImportReport } from '../lib/api';
import { fmtLiters, fmtTime } from '../lib/format';

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<'auto' | 'jmp' | 'jit'>('auto');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [drag, setDrag] = useState(false);

  const send = async (f: File | null) => {
    if (!f) return;
    setLoading(true);
    setError('');
    setReport(null);
    try {
      const r = await api.upload<ImportReport>('/api/import', f, { format });
      setReport(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "L'import a échoué");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div
        className="card"
        style={{
          borderStyle: 'dashed',
          borderWidth: 2,
          textAlign: 'center',
          padding: 40,
          background: drag ? 'rgba(245,166,35,0.06)' : undefined,
          borderColor: drag ? 'var(--accent)' : 'var(--border)',
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) {
            setFile(f);
            void send(f);
          }
        }}
      >
        <div style={{ fontSize: 40, color: 'var(--accent)' }}>⇪</div>
        <h3 style={{ margin: '8px 0 4px' }}>Déposez le classeur Excel du programme</h3>
        <p className="malloc" style={{ marginBottom: 16 }}>
          Format JMP (programme BP) : colonnes Trip Num, Sales Order, Pat.Doc, Tour Start Date, Material Name, Total…
          <br />
          Format JIT (plan Jet) : une ligne par voyage, sans Material Name ni Total — quantités à saisir ensuite.
        </p>
        <div className="field" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <label>Format du fichier</label>
          <select value={format} onChange={(e) => setFormat(e.target.value as 'auto' | 'jmp' | 'jit')}>
            <option value="auto">Auto-détection</option>
            <option value="jmp">JMP (programme BP / VIVO)</option>
            <option value="jit">JIT (plan Jet)</option>
          </select>
        </div>
        <br />
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            void send(f);
          }}
        />
        <div className="mt-12">
          <button className="btn btn-primary" onClick={() => void send(file)} disabled={!file || loading}>
            {loading ? 'Import…' : 'Importer'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '10px auto' }} />
          <div className="malloc">Géocodage et calcul des itinéraires…</div>
        </div>
      )}

      {error && <div className="error" style={{ marginTop: 16 }}>{error}</div>}

      {report && (
        <div className="grid mt-12" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="kpi">
            <div className="kpi-value">{report.trips}</div>
            <div className="kpi-label">Voyages créés</div>
          </div>
          <div className="kpi">
            <div className="kpi-value">{report.lines}</div>
            <div className="kpi-label">Lignes produit</div>
          </div>
          <div className="kpi">
            <div className="kpi-value">{report.issues?.length ?? 0}</div>
            <div className="kpi-label">Avertissements</div>
          </div>

          {(report.issues?.length ?? 0) > 0 && (
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <h3>Problèmes détectés</h3>
              <div className="alert-list">
                {report.issues.map((i, idx) => (
                  <div className={i.level === 'ERROR' ? 'error' : 'warning'} key={idx} style={{ margin: '6px 0' }}>
                    {i.lineNumber != null ? `Ligne ${i.lineNumber} : ` : ''}
                    {i.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <h3>Voyages importés</h3>
            <div style={{ overflow: 'auto', maxHeight: 400 }}>
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
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {report.journeyList.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <Link className="link" to={`/plan/${t.id}`}>{t.tripNum}</Link>
                      </td>
                      <td>{t.tourDate?.slice(0, 10) ?? '—'}</td>
                      <td>{fmtTime(t.plannedDeparture)}</td>
                      <td>{t.stationName}</td>
                      <td>{t.city}</td>
                      <td>{t.driverName}</td>
                      <td>{t.vehicleId}</td>
                      <td>{fmtLiters(t.totalLiters)}</td>
                      <td><span className="badge badge-blue">{t.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-12" style={{ display: 'flex', gap: 8 }}>
              <Link className="btn btn-primary" to="/plan">Voir le plan complet</Link>
              <Link className="btn" to="/carte">Voir sur la carte</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}