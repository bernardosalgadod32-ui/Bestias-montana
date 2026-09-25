import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parseGPX, routeStats, MAX_GPX_BYTES } from '../lib/gpx';
globalThis.DOMParser = new JSDOM('').window.DOMParser;
test('namespaced GPX, zero coordinates, and elevation statistics', () => {
 const points = parseGPX('<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="0" lon="0"><ele>5</ele></trkpt><trkpt lat="0" lon="0.01"><ele>25</ele></trkpt></trkseg></trk></gpx>');
 assert.equal(points.length, 2); assert.deepEqual(routeStats(points), { km: 1.1, gain: 20 });
});
test('segments do not connect across gaps and missing altitude is not zero', () => {
 const points = parseGPX('<gpx><trk><trkseg><trkpt lat="0" lon="0"/><trkpt lat="0" lon="0.01"><ele>2000</ele></trkpt></trkseg><trkseg><trkpt lat="50" lon="50"/><trkpt lat="50" lon="50"/></trkseg></trk></gpx>');
 assert.deepEqual(routeStats(points), { km: 1.1, gain: 0 });
});
test('rejects malformed XML, entities, invalid coordinates, empty and oversized files', () => {
 for(const xml of ['<gpx>', '<html/>', '<!DOCTYPE gpx><gpx/>', '<gpx/>', '<gpx><rte><rtept lat="91" lon="0"/><rtept lat="0" lon="0"/></rte></gpx>', '<gpx><rte><rtept lon="0"/><rtept lat="0" lon="0"/></rte></gpx>', 'x'.repeat(MAX_GPX_BYTES+1)]) assert.throws(() => parseGPX(xml));
});
test('accepts route points as well as tracks', () => {
 assert.equal(parseGPX('<gpx><rte><rtept lat="1" lon="1"/><rtept lat="2" lon="2"/></rte></gpx>').length,2);
});
