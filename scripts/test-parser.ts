// Kiểm thử parser với file sample-ielts.docx
// Chạy: npx tsx scripts/test-parser.ts
import { JSDOM } from 'jsdom';

const dom = new JSDOM('');
(globalThis as any).DOMParser = dom.window.DOMParser;
(globalThis as any).Node = dom.window.Node;

import { readFileSync } from 'fs';
import { parseDocx } from '../src/utils/docxParser';

const buf = readFileSync('sample-ielts.docx');
const file = new File([buf], 'sample-ielts.docx');

const exercise = await parseDocx(file);

console.log('TITLE:', exercise.title);
console.log('PASSAGE paragraphs:', exercise.passage.length);
console.log('AUDIO URL:', exercise.audioUrl ?? '(không có)');
console.log('WARNINGS:', exercise.warnings);
console.log('GROUPS:', exercise.groups.length);
for (const g of exercise.groups) {
  console.log(`\n--- ${g.title} [type=${g.type}] ---`);
  console.log('  instruction:', g.instruction.slice(0, 100));
  if (g.wordBank)
    console.log('  wordBank:', g.wordBank.join(', ').slice(0, 140));
  if (g.sharedOptions)
    console.log('  sharedOptions:', g.sharedOptions.map((o) => `${o.letter}`).join(','));
  if (g.table) console.log('  table:', g.table.length, 'rows');
  for (const q of g.questions) {
    const opts = q.options
      ? ` opts=[${q.options.map((o) => o.letter).join(',')}]`
      : '';
    console.log(`  Q${q.number} [${q.type}] "${q.text.slice(0, 80)}"${opts}`);
  }
}
