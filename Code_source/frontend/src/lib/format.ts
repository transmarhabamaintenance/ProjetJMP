export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR');
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} le ${fmtDate(iso)}`;
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function fmtDuration(min?: number | null): string {
  if (min === null || min === undefined) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} h ${m.toString().padStart(2, '0')}` : `${m} min`;
}

export function fmtKm(km?: number | null): string {
  if (km === null || km === undefined) return '—';
  return `${km.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} km`;
}

export function fmtLiters(l?: number | null): string {
  if (l === null || l === undefined) return '—';
  return `${l.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} L`;
}

export function fmtMoney(m?: number | null): string {
  if (m === null || m === undefined) return '—';
  return `${m.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DH`;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlon = result & 1 ? ~(result >> 1) : result >> 1;
    lon += dlon;
    points.push([lat / 1e5, lon / 1e5]);
  }
  return points;
}