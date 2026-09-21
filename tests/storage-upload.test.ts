import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { gpxUploadBody, GPX_MIME_TYPE } from '../lib/gpx';

test('Supabase multipart upload carries GPX MIME and original bytes for generic browser files', async () => {
  const xml = '<gpx><rte><rtept lat="1" lon="1"/><rtept lat="2" lon="2"/></rte></gpx>';
  let calls = 0;
  const client = createClient('https://storage.example.invalid', 'test-publishable-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (_input, init) => {
      calls++;
      assert.ok(init?.body instanceof FormData);
      const uploaded = init.body.get('');
      assert.ok(uploaded instanceof Blob);
      assert.equal(uploaded.type, GPX_MIME_TYPE);
      assert.equal(await uploaded.text(), xml);
      return new Response(JSON.stringify({ Key: 'gpx/team/training/route.gpx', Id: 'test-object' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    } },
  });
  for (const type of ['', 'application/octet-stream', 'text/xml']) {
    const file = new File([xml], 'route.gpx', { type });
    const result = await client.storage.from('gpx').upload('team/training/route.gpx', gpxUploadBody(file), { contentType: GPX_MIME_TYPE });
    assert.equal(result.error, null);
  }
  assert.equal(calls, 3);
});
