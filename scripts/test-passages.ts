// Kiểm thử file nhiều passage: tách section + gán group đúng passage.
// Chạy: npx tsx scripts/test-passages.ts
import { JSDOM } from 'jsdom';

const dom = new JSDOM('');
(globalThis as any).DOMParser = dom.window.DOMParser;
(globalThis as any).Node = dom.window.Node;

import { Document, HeadingLevel, Packer, Paragraph } from 'docx';
import { parseDocx } from '../src/utils/docxParser';
import { readFileSync } from 'fs';

const p = (text: string, opts: any = {}) => new Paragraph({ text, ...opts });
const doc = new Document({
  sections: [
    {
      children: [
        p('Two Passages Test', { heading: HeadingLevel.TITLE }),
        p('READING PASSAGE 1', { heading: HeadingLevel.HEADING_1 }),
        p('Cities face traffic congestion every single morning rush hour.'),
        p('Cycling infrastructure helps reduce emissions significantly.'),
        p('Questions 1–2', { heading: HeadingLevel.HEADING_2 }),
        p('Choose the correct letter, A, B or C.'),
        p('1. What happens every morning?'),
        p('A. Rush hour'),
        p('B. Rain'),
        p('C. Snow'),
        p('2. What reduces emissions?'),
        p('A. Cars'),
        p('B. Cycling'),
        p('C. Buses'),
        p('Questions 3–4', { heading: HeadingLevel.HEADING_2 }),
        p('Do the following agree? Write TRUE, FALSE or NOT GIVEN.'),
        p('3. Rush hour happens in the morning.'),
        p('4. Snow reduces emissions.'),
        p('Bài đọc 2', { heading: HeadingLevel.HEADING_1 }),
        p('Lịch sử giao thông đô thị bắt đầu từ những con đường đất.'),
        p('Xe đạp từng là phương tiện chính của người dân thành phố.'),
        p('Xe buýt hiện đại thay đổi hoàn toàn cách di chuyển.'),
        p('Questions 5–6', { heading: HeadingLevel.HEADING_2 }),
        p('Do the following statements agree? Write TRUE, FALSE or NOT GIVEN.'),
        p('5. Đường đất là khởi đầu của giao thông đô thị.'),
        p('6. Máy bay là phương tiện chính trong thành phố.'),
        p('Questions 7–8', { heading: HeadingLevel.HEADING_2 }),
        p('Complete the sentences.'),
        p('7. Xe đạp từng là ________ chính.'),
        p('8. Xe buýt thay đổi ________ di chuyển.'),
      ],
    },
  ],
});
const buf = await Packer.toBuffer(doc);
const ex = await parseDocx(new File([buf as any], 'two-passages.docx'));

let failures = 0;
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
};

check('2 sections', ex.passages.length === 2, `got ${ex.passages.length}`);
const [s1, s2] = ex.passages;
check('S1 label Passage 1', s1.label === 'Passage 1', `"${s1.label}"`);
check('S1 title giữ nguyên', s1.title === 'READING PASSAGE 1', `"${s1.title}"`);
check('S1 có 2 đoạn', s1.paragraphs.length === 2, `got ${s1.paragraphs.length}`);
check('S2 label Bài đọc 2', s2.label === 'Bài đọc 2', `"${s2.label}"`);
check('S2 có 3 đoạn', s2.paragraphs.length === 3, `got ${s2.paragraphs.length}`);

check('4 groups', ex.groups.length === 4, `got ${ex.groups.length}`);
const [g1, g2, g3, g4] = ex.groups;
check(
  'G1+G2 thuộc passage 1',
  g1.passageId === s1.id && g2.passageId === s1.id,
  `${g1.passageId} / ${g2.passageId}`,
);
check(
  'G3+G4 thuộc passage 2',
  g3.passageId === s2.id && g4.passageId === s2.id,
  `${g3.passageId} / ${g4.passageId}`,
);
check(
  'G1 số câu 1 (không dính text passage 2)',
  g1.questions[0].number === 1 && g1.questions[0].text.includes('morning'),
  `"${g1.questions[0].text.slice(0, 40)}"`,
);
check(
  'G3 type boolean',
  g3.type === 'boolean',
  g3.type,
);
check(
  'G4 type gap (thuộc passage 2)',
  g4.type === 'gap' && g4.passageId === s2.id,
  `${g4.type} / ${g4.passageId}`,
);
check(
  'passage 2 không lẫn câu hỏi',
  !s2.paragraphs.some((t) => /^\d+\./.test(t.trim())),
);

/* Hồi quy: sample 1 passage vẫn 1 section */
const sample = readFileSync('sample-ielts.docx');
const ex1 = await parseDocx(new File([sample], 'sample-ielts.docx'));
check(
  'sample 1 passage → 1 section',
  ex1.passages.length === 1,
  `got ${ex1.passages.length}`,
);
check(
  'sample groups đều thuộc section đó',
  ex1.groups.every((g) => g.passageId === ex1.passages[0].id),
);

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASSAGE TESTS PASSED');
process.exit(failures ? 1 : 0);
