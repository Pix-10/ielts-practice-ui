// Render App trong jsdom để bắt lỗi runtime
// Chạy: npx tsx scripts/test-render.ts
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const g = globalThis as any;
g.window = dom.window;
g.document = dom.window.document;
g.DOMParser = dom.window.DOMParser;
g.Node = dom.window.Node;
g.localStorage = dom.window.localStorage;
g.requestAnimationFrame = (cb: any) => setTimeout(cb, 0);
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
});
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.CustomEvent = dom.window.CustomEvent;
g.Event = dom.window.Event;
g.CSS = { escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '\\$&') };

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';

const root = createRoot(document.getElementById('root')!);
root.render(createElement(App));

// chờ render xong
await new Promise((r) => setTimeout(r, 300));

const html = document.getElementById('root')!.innerHTML;
console.log('RENDER LENGTH:', html.length);
console.log('HAS DROPZONE:', html.includes('dropzone'));
console.log('HAS HERO TITLE:', html.includes('Điền đáp án IELTS'));
console.log('THEME:', document.documentElement.dataset.theme);

// Kiểm tra các element chính
for (const sel of ['.topbar', '.hero', '.dropzone', '.feature-grid', '.brand-badge']) {
  const el = document.querySelector(sel);
  console.log(`${sel}: ${el ? 'OK' : 'MISSING'}`);
}
console.log('\n--- topbar text ---');
console.log(document.querySelector('.topbar')?.textContent?.trim().slice(0, 120));
