export type Point = { lat: number; lon: number; ele: number | null; segment: number };
export const MAX_GPX_BYTES = 5 * 1024 * 1024;
export const GPX_MIME_TYPE = 'application/gpx+xml';
// Storage reads the MIME of the multipart Blob, not the upload contentType option.
// Call after GPX validation; browsers often give .gpx files an empty/generic MIME.
export function gpxUploadBody(file: Blob): Blob {
  return file.slice(0, file.size, GPX_MIME_TYPE);
}
export function parseGPX(xml: string): Point[] {
  if (new TextEncoder().encode(xml).length > MAX_GPX_BYTES) throw new Error('El GPX supera 5 MB.');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('GPX no válido: no se admiten entidades XML.');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'gpx') throw new Error('El archivo no es un GPX válido.');
  const tracks = Array.from(doc.getElementsByTagNameNS('*', 'trkseg'));
  const segments = tracks.length ? tracks : Array.from(doc.getElementsByTagNameNS('*', 'rte'));
  const points: Point[] = [];
  segments.forEach((seg, segment) => {
    const nodes = Array.from(seg.getElementsByTagNameNS('*', tracks.length ? 'trkpt' : 'rtept'));
    for (const node of nodes) {
      const latText = node.getAttribute('lat'), lonText = node.getAttribute('lon');
      const lat = Number(latText), lon = Number(lonText);
      if (!latText?.trim() || !lonText?.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('El GPX contiene coordenadas no válidas.');
      const e = node.getElementsByTagNameNS('*', 'ele')[0]?.textContent;
      const ele = e?.trim() ? Number(e) : null;
      if (ele !== null && !Number.isFinite(ele)) throw new Error('El GPX contiene elevaciones no válidas.');
      points.push({ lat, lon, ele, segment });
      if (points.length > 50000) throw new Error('El GPX supera 50 000 puntos.');
    }
  });
  if (points.length < 2) throw new Error('El GPX necesita al menos dos puntos de ruta.');
  return points;
}
export function routeStats(points: Point[]) {
  let km = 0, gain = 0;
  const rad = Math.PI / 180;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (a.segment !== b.segment) continue;
    const h = Math.sin((b.lat-a.lat)*rad/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((b.lon-a.lon)*rad/2)**2;
    km += 12742 * Math.asin(Math.sqrt(Math.min(1, h)));
    if (a.ele !== null && b.ele !== null) gain += Math.max(0, b.ele-a.ele);
  }
  return { km: Math.round(km*10)/10, gain: Math.round(gain) };
}
