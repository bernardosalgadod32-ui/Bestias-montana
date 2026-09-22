'use client';
import { useEffect, useRef, useState } from 'react';
import type { Point } from '../lib/gpx';
import 'leaflet/dist/leaflet.css';
export default function RouteMap({ points }: { points: Point[] }) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let disposed = false;
    let map: import('leaflet').Map | undefined;
    setFailed(false);
    import('leaflet').then(L => {
      if (disposed || !host.current) return;
      map = L.map(host.current, { scrollWheelZoom: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19,
      }).addTo(map);
      const segments = new globalThis.Map<number, [number, number][]>();
      const stride = Math.max(1, Math.ceil(points.length / 10000));
      points.forEach((p, i) => {
        if (i % stride && points[i-1]?.segment === p.segment && points[i+1]?.segment === p.segment) return;
        const group = segments.get(p.segment) || [];
        group.push([p.lat, p.lon]); segments.set(p.segment, group);
      });
      const line = L.polyline([...segments.values()], { color: '#111', weight: 4 }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [20, 20], maxZoom: 16 });
      const start = points[0];
      L.circleMarker([start.lat, start.lon], { radius: 6, color: '#111', fillColor: '#fff', fillOpacity: 1 }).addTo(map).bindTooltip('Inicio');
    }).catch(() => setFailed(true));
    return () => { disposed = true; map?.remove(); };
  }, [points]);
  return <><div ref={host} className="route-map" aria-label="Mapa de la ruta GPX" />{failed && <p role="alert">No se pudo cargar el mapa. Puedes descargar el GPX.</p>}</>;
}
