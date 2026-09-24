import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import type { SupabaseClient } from '@supabase/supabase-js';
import TrainingPhotos from '../components/training-photos';
import type { TrainingPhoto } from '../lib/photos';

test('album uploads a batch, preserves partial failures, cleans failed metadata uploads, downloads and shares', async () => {
 const dom = new JSDOM('<div id="root"></div>', {url:'https://bestias.test'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,React,IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 const rows: TrainingPhoto[]=[], uploaded:string[]=[], removed:string[]=[], revoked:string[]=[];
 let downloads=0, shared=0;
 const createURL=URL.createObjectURL, revokeURL=URL.revokeObjectURL;
 URL.createObjectURL=()=>`blob:test-${Math.random()}`; URL.revokeObjectURL=url=>revoked.push(url);
 dom.window.HTMLAnchorElement.prototype.click=function(){ downloads++; };
 dom.window.confirm=()=>true;
 const storage={
  upload:async(path:string)=>{uploaded.push(path);return {error:null};},
  download:async()=>({data:new Blob(['photo'],{type:'image/jpeg'}),error:null}),
  remove:async(paths:string[])=>{removed.push(...paths);return {error:null};}
 };
 const client={storage:{from:()=>storage},from:()=>({
  select:()=>{const q={eq:()=>q,order:()=>q,range:async()=>({data:[...rows],error:null})};return q;},
  insert:async(row:TrainingPhoto)=>{if(row.filename==='fail.jpg') return {error:{message:'No se pudo registrar'}};rows.push({...row,id:crypto.randomUUID(),created_at:new Date().toISOString()});return {error:null};},
  delete:()=>({eq:(_key:string,id:string)=>({select:()=>({single:async()=>{rows.splice(rows.findIndex(row=>row.id===id),1);return {data:{id},error:null};}})})})
 })} as unknown as SupabaseClient;
 const root=createRoot(document.getElementById('root')!);
 const click=async(text:string)=>{const button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent===text)!;assert.ok(button);assert.equal(button.disabled,false);await act(async()=>button.click());};
 try {
  await act(async()=>root.render(React.createElement(TrainingPhotos,{trainingId:'session',teamId:'team',userId:'member',canModerate:false,client})));
  const input=document.querySelector('input')!;
  Object.defineProperty(input,'files',{configurable:true,value:[new File(['a'],'ok.jpg',{type:'image/jpeg'}),new File(['b'],'fail.jpg',{type:'image/jpeg'})]});
  await act(async()=>input.dispatchEvent(new dom.window.Event('change',{bubbles:true})));
  assert.equal(uploaded.length,2);assert.equal(rows.length,1);assert.equal(removed.length,1);
  assert.match(document.body.textContent!,/1 de 2 fotos compartidas/);
  assert.match(document.querySelector('[role="alert"]')!.textContent!,/fail.jpg/);
  assert.equal(document.querySelectorAll('img').length,1);
  await click('Descargar');assert.equal(downloads,1);
  await click('Compartir');assert.equal(downloads,2);
  Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
  Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{shared++;}});
  await click('Compartir');assert.equal(shared,1);
  await click('Eliminar');assert.equal(rows.length,0);assert.equal(removed.length,2);
  assert.ok(revoked.length>0);
 } finally {await act(async()=>root.unmount());URL.createObjectURL=createURL;URL.revokeObjectURL=revokeURL;dom.window.close();}
});
