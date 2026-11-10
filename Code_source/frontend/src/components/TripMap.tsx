import L from 'leaflet';
import { CircleMarker, MapContainer, Popup, Polyline, TileLayer } from 'react-leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { decodePolyline } from '../lib/format';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export interface MapStop {
  key: string;
  lat: number;
  lon: number;
  title: string;
  detail: string;
  href?: string;
}

interface Props {
  depLat?: number | null;
  depLon?: number | null;
  stnLat?: number | null;
  stnLon?: number | null;
  depLabel?: string;
  stnLabel?: string;
  geometry?: string | null;
  center?: [number, number];
  stops?: MapStop[];
  height?: number;
}

export default function TripMap({
  depLat,
  depLon,
  stnLat,
  stnLon,
  depLabel = 'Dépôt',
  stnLabel = 'Station',
  geometry,
  center = [32.5, -7.0],
  stops,
  height = 460,
}: Props) {
  const hasDep = depLat != null && depLon != null;
  const hasStn = stnLat != null && stnLon != null;
  const polyline = geometry ? decodePolyline(geometry) : [];

  return (
    <MapContainer center={center} zoom={6} style={{ height, width: '100%', zIndex: 0 }} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      {hasDep && (
        <CircleMarker
          center={[depLat as number, depLon as number]}
          radius={8}
          pathOptions={{ color: '#f5a623', fillColor: '#f5a623', fillOpacity: 1 }}
        >
          <Popup>
            <div className="map-popup">
              <strong>Départ</strong>
              <br />
              {depLabel}
            </div>
          </Popup>
        </CircleMarker>
      )}
      {polyline.length > 0 && <Polyline positions={polyline} pathOptions={{ color: '#4aa8f5', weight: 4 }} />}
      {hasStn && (
        <CircleMarker
          center={[stnLat as number, stnLon as number]}
          radius={8}
          pathOptions={{ color: '#34c98f', fillColor: '#34c98f', fillOpacity: 1 }}
        >
          <Popup>
            <div className="map-popup">
              <strong>Arrivée</strong>
              <br />
              {stnLabel}
            </div>
          </Popup>
        </CircleMarker>
      )}
      {stops?.map((s) => (
        <CircleMarker key={s.key} center={[s.lat, s.lon]} radius={7} pathOptions={{ color: '#34c98f', fillColor: '#34c98f', fillOpacity: 0.9 }}>
          <Popup>
            <div className="map-popup">
              <strong>{s.title}</strong>
              <br />
              {s.detail}
              {s.href && (
                <>
                  <br />
                  <a href={s.href}>Ouvrir le voyage</a>
                </>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}