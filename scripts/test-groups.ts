// Render GroupView + Sidebar với dữ liệu thật từ sample docx
// Chạy: npx tsx --tsconfig tsconfig.app.json scripts/test-groups.ts
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
g.CSS = { escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '\\$&') };

// Import SAU khi setup jsdom (react-dom check DOM lúc evaluate)
const { readFileSync } = await import('fs');
const { createElement: h } = await import('react');
const { createRoot } = await import('react-dom/client');
const { parseDocx } = await import('../src/utils/docxParser');
const { GroupView } = await import('../src/components/GroupView');
const { BottomBar } = await import('../src/components/BottomBar');
const { AudioBar } = await import('../src/components/AudioBar');

const buf = readFileSync('sample-ielts.docx');
const exercise = await parseDocx(new File([buf], 'sample-ielts.docx'));

const answers: Record<string, string> = {};
const flags: Record<string, boolean> = {};
let changeCalls = 0;
let focusCalls = 0;
// giả lập điền sẵn 1 đáp án
const firstQ = exercise.groups[0].questions[0];
answers[firstQ.id] = 'B';

const Wrap = () =>
  h(
    'div',
    null,
    h(AudioBar, {
      url: exercise.audioUrl ?? null,
      name: null,
      onPickFile: () => {},
      onSetUrl: () => {},
    }),
    h('div', { style: { display: 'flex', gap: 20, padding: 20 } },
      h('main', { style: { flex: 1 } },
        exercise.groups.map((grp) =>
          h(GroupView, {
            key: grp.id,
            group: grp,
            answers,
            flags,
            activeId: firstQ.id,
            flashId: null,
            onChange: (id: string, v: string) => { changeCalls++; answers[id] = v; },
            onToggleFlag: (id: string) => { flags[id] = !flags[id]; },
            onFocus: () => { focusCalls++; },
          }),
        ),
      ),
      h(BottomBar, {
        exercise,
        answers,
        flags,
        activeId: firstQ.id,
        onJump: () => {},
        onExport: () => {},
        onCopy: () => {},
      }),
    ),
  );

const root = createRoot(document.getElementById('root')!);
root.render(h(Wrap));
await new Promise((r) => setTimeout(r, 300));

const doc = document;
const checks: [string, string][] = [
  ['Groups', '.group'],
  ['Instruction', '.instruction'],
  ['Options (mcq)', '.options .option'],
  ['Boolean options', '.options .option'],
  ['Word bank chips', '.chip'],
  ['Table', '.matrix'],
  ['Table cell input', '.cell-input'],
  ['Question cards', '.qcard'],
  ['Answered card', '.qcard.answered'],
  ['Nav cells', '.nav-cell'],
  ['Progress ring', '.bb-ring'],
  ['Type badges', '.badge'],
  ['Flag buttons', '.q-flag'],
  ['Audio bar', '.audio-bar'],
  ['Audio play btn', '.ap-play'],
  ['Audio progress', '.ap-progress'],
  ['Bottom bar', '.bottom-bar'],
  ['Bottom nav cells', '.bb-nav .nav-cell'],
  ['Form fields', '.form-field'],
  ['Form inputs', '.form-input'],
  ['Group labels (nav)', '.bb-group-label'],
];
console.log('=== RENDER CHECK ===');
for (const [label, sel] of checks) {
  console.log(`${label.padEnd(22)} ${sel.padEnd(20)} → ${doc.querySelectorAll(sel).length}`);
}

// Kiểm tra nội dung cụ thể
console.log('\n=== CONTENT ===');
console.log('Badges:', [...doc.querySelectorAll('.badge')].slice(0, 8).map((b) => b.textContent).join(' | '));
console.log('First option:', doc.querySelector('.option')?.textContent);
console.log('Chips count:', doc.querySelectorAll('.chip').length);
console.log('Table rows:', doc.querySelectorAll('.matrix tr').length);
console.log('Cell inputs:', doc.querySelectorAll('.cell-input').length);
console.log('Nav done:', doc.querySelectorAll('.nav-cell.done').length);
console.log('Nav total:', doc.querySelectorAll('.nav-cell').length);

// Audio bar
const audioEl = doc.querySelector('.audio-bar audio') as HTMLAudioElement | null;
console.log('Audio src:', audioEl?.getAttribute('src') ?? '(none)');
const playBtn = doc.querySelector('.ap-play') as HTMLElement | null;
if (playBtn) {
  playBtn.click();
  await new Promise((r) => setTimeout(r, 150));
  console.log('After play click (src 404 trong jsdom → không phát được, btn vẫn render):', !!doc.querySelector('.ap-play'));
}

// Chọn 1 option ảo (simulate click)
const opts = doc.querySelectorAll('.options .option');
if (opts.length > 2) {
  (opts[2] as HTMLElement).click();
  await new Promise((r) => setTimeout(r, 100));
  console.log('\nClick option → onChange calls:', changeCalls, '| focus calls:', focusCalls);
  console.log('answers[firstQ.id] =', answers[firstQ.id]);
}

// Click chip word bank
const chip = doc.querySelector('.chip') as HTMLElement | null;
if (chip) {
  const before = changeCalls;
  chip.click();
  await new Promise((r) => setTimeout(r, 100));
  console.log('Chip click → onChange fired:', changeCalls > before, '| value:', answers[firstQ.id]);
}

// Gõ vào ô input bảng
const cell = doc.querySelector('.cell-input') as HTMLInputElement | null;
if (cell) {
  const before = changeCalls;
  const setter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    'value',
  )!.set!;
  setter.call(cell, 'cycling lanes');
  cell.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  cell.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 150));
  console.log(
    'Table input typing → onChange fired:', changeCalls > before,
    '| keys:', Object.keys(answers).length,
    '| cell.value:', cell.value,
    '| listeners on cell:', typeof (cell as any).getEventListeners,
  );
}

// Flag toggle
const flagBtn = doc.querySelector('.q-flag') as HTMLElement | null;
if (flagBtn) {
  flagBtn.click();
  await new Promise((r) => setTimeout(r, 100));
  console.log('Flag toggle → flagged:', JSON.stringify(flags));
}

// Gõ vào form input (điền thông tin khách hàng)
const formInput = doc.querySelector('.form-input') as HTMLInputElement | null;
if (formInput) {
  const before = changeCalls;
  const setter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    'value',
  )!.set!;
  setter.call(formInput, 'Nguyen Van A');
  formInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 100));
  console.log(
    'Form typing → onChange fired:', changeCalls > before,
    '| answers:', Object.keys(answers).length,
  );
}

console.log('\nERRORS: none (render completed)');
