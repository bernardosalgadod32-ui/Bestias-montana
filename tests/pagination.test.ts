import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allRows } from '../lib/pagination';
test('fetches confirmations beyond the PostgREST response limit', async () => {
 const source = Array.from({length:1201}, (_,id) => ({id}));
 const rows = await allRows(async (from,to) => ({data:source.slice(from,to+1),error:null}));
 assert.deepEqual(rows, source);
});
test('a failed later page is reported instead of returning incomplete attendance', async () => {
 await assert.rejects(allRows(async (from) => from === 0 ? {data:Array(500).fill({id:1}),error:null} : {data:null,error:{message:'Sin conexión'}}), /Sin conexión/);
});
