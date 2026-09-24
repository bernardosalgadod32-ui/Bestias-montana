import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import WelcomeGuide, { useWelcomeGuide } from '../components/welcome-guide';

test('welcome appears once, navigates all steps, can be reopened and does not obstruct auth callbacks', async () => {
 const dom = new JSDOM('<div id="root"></div>', { url:'https://bestias.test' });
 Object.assign(globalThis, { window:dom.window, document:dom.window.document, localStorage:dom.window.localStorage, React, IS_REACT_ACT_ENVIRONMENT:true });
 dom.window.HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open',''); };
 dom.window.HTMLDialogElement.prototype.close = function() { this.removeAttribute('open'); };
 function Help() { const open=useWelcomeGuide(); return React.createElement('button',{onClick:open},'Ver guía'); }
 const mount = (autoShow=true) => React.createElement(WelcomeGuide,{autoShow,children:React.createElement(Help)});
 const container=document.getElementById('root')!; let root=createRoot(container);
 const click = async(text:string) => { const button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent===text); assert.ok(button); await act(async()=>button.click()); };
 try {
  await act(async()=>root.render(mount())); assert.ok(document.querySelector('dialog[open]'));
  for(let i=0;i<4;i++) await click('Siguiente');
  assert.match(document.querySelector('h2')!.textContent!,/Tu equipo/);
  await click('¡Vamos, Bestia!'); assert.equal(document.querySelector('dialog[open]'),null);
  await act(async()=>root.unmount()); root=createRoot(container);
  await act(async()=>root.render(mount())); assert.equal(document.querySelector('dialog[open]'),null);
  await click('Ver guía'); assert.ok(document.querySelector('dialog[open]'));
  assert.match(document.querySelector('h2')!.textContent!,/Bienvenido/);
  await click('Omitir guía'); assert.equal(document.querySelector('dialog[open]'),null);
  await act(async()=>root.unmount()); localStorage.clear(); root=createRoot(container);
  await act(async()=>root.render(mount(false))); assert.equal(document.querySelector('dialog[open]'),null);
 } finally { await act(async()=>root.unmount()); dom.window.close(); }
});
