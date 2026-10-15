import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => m.type() === 'error' && console.log('PAGE ERR:', m.text()));
page.on('pageerror', (e) => console.log('PAGE EXC:', e.message));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', 'sample-ielts.docx');
await page.waitForSelector('.work', { timeout: 15000 });
await page.waitForTimeout(600);

const info = await page.evaluate(() => {
  const g = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      rect: { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) },
      scrollH: el.scrollHeight,
      clientH: el.clientHeight,
      overflowY: cs.overflowY,
      gridRows: cs.gridTemplateRows,
      canScroll: el.scrollHeight > el.clientHeight,
    };
  };
  const root = document.documentElement;
  return {
    vars: {
      top: getComputedStyle(root).getPropertyValue('--h-top').trim(),
      audio: getComputedStyle(root).getPropertyValue('--h-audio').trim(),
      bottom: getComputedStyle(root).getPropertyValue('--h-bottom').trim(),
    },
    viewport: { w: innerWidth, h: innerHeight },
    page: { scrollH: document.documentElement.scrollHeight, clientH: document.documentElement.clientHeight },
    topbar: g('.topbar'),
    audio: g('.audio-bar'),
    work: g('.work'),
    left: g('.work-left'),
    right: g('.work-right'),
    bottom: g('.bottom-bar'),
  };
});
console.log(JSON.stringify(info, null, 1));

// Thử cuộn cột phải
const before = await page.evaluate(() => document.querySelector('.work-right').scrollTop);
await page.mouse.move(1100, 450);
await page.mouse.wheel(0, 600);
await page.waitForTimeout(400);
const after = await page.evaluate(() => document.querySelector('.work-right').scrollTop);
console.log('WHEEL on right column → scrollTop:', before, '→', after, after > before ? 'SCROLL OK' : 'NO SCROLL!');

await page.screenshot({ path: '/tmp/layout-debug.png' });
await browser.close();
