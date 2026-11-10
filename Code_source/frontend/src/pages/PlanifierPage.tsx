import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { TripDetail } from '../lib/api';
import { ApiError, api } from '../lib/client';
import { fmtDuration, fmtKm, fmtLiters, fmtMoney, fmtTime, todayIso } from '../lib/format';

const DEFAULT_PLANT = 'C.E.C MOHAMMEDIA FUELS';

interface LineForm {
  materialName: string;
  liters: string;
}

export default function PlanifierPage() {
  const [tourDate, setTourDate] = useState(todayIso());
  const [tripNum, setTripNum] = useState('');
  const [salesOrder, setSalesOrder] = useState('');
  const [patDoc, setPatDoc] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [driverName, setDriverName] = useState('');
  const [plantName, setPlantName] = useState(DEFAULT_PLANT);
  const [shipToName, setShipToName] = useState('');
  const [city, setCity] = useState('');
  const [tranche, setTranche] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [lines, setLines] = useState<LineForm[]>([{ materialName: 'Gasoil', liters: '' }]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TripDetail | null>(null);

  const setLine = (index: number, patch: Partial<LineForm>) => {
    setLines(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setResult(null);

    const cleanLines = lines
      .map((l) => ({ materialName: l.materialName.trim(), liters: Number(l.liters.replace(',', '.')) }))
      .filter((l) => l.materialName || !Number.isNaN(l.liters));
    if (!tourDate) return setError('Date du voyage obligatoire');
    if (!shipToName.trim()) return setError('Station (Ship To Name) obligatoire');
    if (!plantName.trim()) return setError('Dépôt (Plant Name) obligatoire');
    if (cleanLines.length === 0) return setError('Ajoutez au moins une ligne de produit');

    setBusy(true);
    try {
      const created = await api.post<TripDetail>('/api/trips', {
        tourDate,
        tripNum: tripNum.trim() || undefined,
        salesOrder: salesOrder.trim() || undefined,
        patDoc: patDoc.trim() || undefined,
        vehicleId: vehicleId.trim() || undefined,
        customerName: customerName.trim() || undefined,
        driverName: driverName.trim() || undefined,
        plantName: plantName.trim(),
        shipToName: shipToName.trim(),
        city: city.trim() || undefined,
        tranche: tranche.trim() ? Number(tranche) : null,
        plannedDeparture: departureTime ? `${tourDate}T${departureTime}` : undefined,
        lines: cleanLines,
      });
      setResult(created);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Planification impossible');
    } finally {
      setBusy(false);
    }
  };

  const summary = result?.summary;

  return (
    <div>
      {error && <div className="error">{error}</div>}

      {result && summary && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--green)' }}>
          <h3>Voyage {summary.tripNum ?? `n° ${summary.id}`} planifié</h3>
          <div className="grid kpis">
            <div className="kpi">
              <div className="stat-k">Aller simple</div>
              <div className="kpi-value">{fmtKm(summary.distanceOneWayKm)}</div>
            </div>
            <div className="kpi">
              <div className="stat-k">Aller-retour</div>
              <div className="kpi-value">{fmtKm(summary.distanceRoundTripKm)}</div>
            </div>
            <div className="kpi">
              <div className="stat-k">Durée totale</div>
              <div className="kpi-value">{fmtDuration(summary.totalDurationMin)}</div>
            </div>
            <div className="kpi">
              <div className="stat-k">Chargement</div>
              <div className="kpi-value">{fmtLiters(summary.totalLiters)}</div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="stat-row"><span className="stat-k">Dépôt</span><span className="stat-v">{result.plantName}</span></div>
            <div className="stat-row"><span className="stat-k">Station</span><span className="stat-v">{summary.stationName}</span></div>
            <div className="stat-row"><span className="stat-k">Départ</span><span className="stat-v">{fmtTime(summary.plannedDeparture)}</span></div>
            <div className="stat-row"><span className="stat-k">Arrivée station</span><span className="stat-v">{fmtTime(summary.etaStation)}</span></div>
            <div className="stat-row"><span className="stat-k">Fin déchargement</span><span className="stat-v">{fmtTime(summary.endUnloading)}</span></div>
            <div className="stat-row"><span className="stat-k">Retour dépôt</span><span className="stat-v">{fmtTime(summary.etaReturnPlant)}</span></div>
            <div className="stat-row"><span className="stat-k">Pauses</span><span className="stat-v">{fmtDuration(summary.breakMinutes)}</span></div>
            <div className="stat-row"><span className="stat-k">Carburant estimé</span><span className="stat-v">{fmtLiters(summary.estimatedFuelLiters)} — {fmtMoney(summary.estimatedFuelCost)}</span></div>
          </div>
          {summary.warnings.length > 0 && (
            <ul className="hint" style={{ marginTop: 12 }}>
              {summary.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Link className="btn btn-primary" to={`/plan/${summary.id}`}>Voir la fiche du voyage</Link>
            <button className="btn" type="button" onClick={() => setResult(null)}>Planifier un autre voyage</button>
          </div>
        </div>
      )}

      <form className="card" onSubmit={(e) => void submit(e)}>
        <h3>Fiche du voyage</h3>
        <p className="hint" style={{ marginTop: 0 }}>
          Les mêmes informations qu'une ligne du classeur Excel : dépôt, station, chauffeur, véhicule, date et lignes de produit.
        </p>
        <div className="form-grid">
          <div className="field">
            <label>Date du voyage</label>
            <input type="date" value={tourDate} onChange={(e) => setTourDate(e.target.value)} />
          </div>
          <div className="field">
            <label>N° de voyage (Trip Num)</label>
            <input type="text" value={tripNum} onChange={(e) => setTripNum(e.target.value)} placeholder="facultatif" />
          </div>
          <div className="field">
            <label>Départ prévu</label>
            <input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} placeholder="heure par défaut" />
          </div>
          <div className="field">
            <label>Dépôt (Plant Name)</label>
            <input type="text" value={plantName} onChange={(e) => setPlantName(e.target.value)} />
          </div>
          <div className="field">
            <label>Station (Ship To Name)</label>
            <input type="text" value={shipToName} onChange={(e) => setShipToName(e.target.value)} placeholder="SHELL HAOUZ" />
          </div>
          <div className="field">
            <label>Ville</label>
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="field">
            <label>Chauffeur</label>
            <input type="text" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
          </div>
          <div className="field">
            <label>Véhicule</label>
            <input type="text" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} />
          </div>
          <div className="field">
            <label>Client</label>
            <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div className="field">
            <label>Tranche</label>
            <input type="number" value={tranche} onChange={(e) => setTranche(e.target.value)} placeholder="1" />
          </div>
          <div className="field">
            <label>Commande (Sales Order)</label>
            <input type="text" value={salesOrder} onChange={(e) => setSalesOrder(e.target.value)} />
          </div>
          <div className="field">
            <label>Pat.Doc</label>
            <input type="text" value={patDoc} onChange={(e) => setPatDoc(e.target.value)} />
          </div>
        </div>

        <h3 style={{ marginTop: 20 }}>Lignes de produit</h3>
        <div className="lines-editor">
          {lines.map((line, index) => (
            <div className="line-row" key={index}>
              <div className="field">
                <label>Produit (Material Name)</label>
                <input type="text" value={line.materialName} onChange={(e) => setLine(index, { materialName: e.target.value })} />
              </div>
              <div className="field">
                <label>Total (litres)</label>
                <input type="number" value={line.liters} onChange={(e) => setLine(index, { liters: e.target.value })} />
              </div>
              <button
                className="btn btn-danger btn-small"
                type="button"
                onClick={() => setLines(lines.filter((_, i) => i !== index))}
                disabled={lines.length === 1}
              >
                Retirer
              </button>
            </div>
          ))}
        </div>
        <button className="btn btn-small" type="button" style={{ marginTop: 10 }} onClick={() => setLines([...lines, { materialName: '', liters: '' }])}>
          Ajouter une ligne
        </button>

        <div style={{ marginTop: 18 }}>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Calcul des itinéraires…' : 'Planifier ce voyage'}
          </button>
        </div>
      </form>
    </div>
  );
}
