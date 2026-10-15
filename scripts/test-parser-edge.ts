// Kiểm thử các tính năng parser dùng tín hiệu trong tài liệu
// (heading, Word auto-numbering, bảng tách ô, legend, bank xếp chồng...)
// Chạy: npx tsx scripts/test-parser-edge.ts
import { JSDOM } from 'jsdom';

const dom = new JSDOM('');
(globalThis as any).DOMParser = dom.window.DOMParser;
(globalThis as any).Node = dom.window.Node;

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  WidthType,
} from 'docx';
import { parseDocx } from '../src/utils/docxParser';

const p = (text: string, opts: any = {}) => new Paragraph({ text, ...opts });
const cell = (text: string) =>
  new TableCell({ children: [new Paragraph({ text })] });

const children: any[] = [
  p('Parser Edge Cases', { heading: HeadingLevel.TITLE }),
  p('This is a short test passage for parser edge cases.'),

  // 1) Header + instruction dính trên cùng 1 dòng + Word auto-numbering (<ol>)
  p('Questions 1–2 Choose the correct letter, A, B, C or D.', {
    heading: HeadingLevel.HEADING_2,
  }),
  p('What did Copenhagen invest in during the 1990s?', {
    numbering: { reference: 'q', level: 0 },
  }),
  p('A. Congestion charges'),
  p('B. Cycling infrastructure'),
  p('C. Office buildings'),
  p('D. Remote working'),
  p('When did Singapore introduce charges?', {
    numbering: { reference: 'q', level: 0 },
  }),
  p('A. 1945'),
  p('B. 1965'),
  p('C. 1975'),

  // 2) Legend TRUE/FALSE/NOT GIVEN đứng riêng từng dòng
  p('Questions 3–5', { heading: HeadingLevel.HEADING_2 }),
  p(
    'Do the following statements agree with the information? Write TRUE, FALSE or NOT GIVEN.',
  ),
  p('TRUE'),
  p('FALSE'),
  p('NOT GIVEN'),
  p('3. Copenhagen is a city in Denmark.'),
  p('4. Singapore is located on Mars.'),

  // 3) Bảng kiểu notes: số câu và ô trống ở 2 ô khác nhau
  p('Questions 6–7', { heading: HeadingLevel.HEADING_2 }),
  p('Complete the notes below. Write NO MORE THAN TWO WORDS.'),
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [cell('Topic'), cell('No'), cell('Detail')] }),
      new TableRow({
        children: [cell('Main transport'), cell('6'), cell('..........')],
      }),
      new TableRow({ children: [cell('Study year'), cell('7'), cell('')]}),
    ],
  }),

  // 4) Tự luận + số full-width
  p('Questions 8–9', { heading: HeadingLevel.HEADING_2 }),
  p('Answer the following questions. Write your answers in your own words.'),
  p('8. Why did planners rethink road expansion?'),
  p('９. Who benefits from cycling infrastructure?'),

  // 5) Word bank xếp chồng (bullet list, mỗi dòng 1 từ)
  p('Questions 10–11', { heading: HeadingLevel.HEADING_2 }),
  p('Complete the sentences. Choose words from the box.'),
  ...['congestion', 'infrastructure', 'residents', 'charges', 'remote', 'patterns'].map(
    (w) => p(w, { bullet: { level: 0 } }),
  ),
  p('10. Singapore introduced ________ charges.'),
  p('11. More than half of ________ cycle to work.'),
];

const doc = new Document({
  numbering: {
    config: [
      {
        reference: 'q',
        levels: [
          {
            level: 0,
            format: 'decimal',
            text: '%1.',
            alignment: AlignmentType.LEFT,
          },
        ],
      },
    ],
  },
  sections: [{ children }],
});
const buf = await Packer.toBuffer(doc);
const exercise = await parseDocx(
  new File([buf as any], 'edge-ielts.docx'),
);

let failures = 0;
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
};

check('số groups = 5', exercise.groups.length === 5, `got ${exercise.groups.length}`);
const [g1, g2, g3, g4, g5] = exercise.groups;

// 1) header + instruction cùng dòng, auto-numbering
check('G1 title gọn', g1.title === 'Questions 1–2', `"${g1.title}"`);
check('G1 instruction tách từ header', /choose the correct letter/i.test(g1.instruction), `"${g1.instruction.slice(0, 50)}"`);
check('G1 type mcq', g1.type === 'mcq', g1.type);
check(
  'G1 số tự gán 1,2',
  g1.questions.map((q) => q.number).join(',') === '1,2',
  g1.questions.map((q) => q.number).join(','),
);
check('G1 Q1 đủ 4 options', (g1.questions[0].options?.length ?? 0) === 4);
check('G1 Q2 có options', (g1.questions[1].options?.length ?? 0) >= 2);

// 2) legend
check('G2 type boolean', g2.type === 'boolean', g2.type);
check(
  'G2 Q3 text sạch (không dính legend)',
  g2.questions[0].text === 'Copenhagen is a city in Denmark.',
  `"${g2.questions[0].text}"`,
);
check('G2 instruction có NOT GIVEN', /not given/i.test(g2.instruction));

// 3) bảng tách ô
check('G3 type gap + có table', g3.type === 'gap' && !!g3.table, g3.type);
check(
  'G3 số câu 6,7',
  g3.questions.map((q) => q.number).join(',') === '6,7',
  g3.questions.map((q) => q.number).join(','),
);
check(
  'G3 context từ ô còn lại',
  /main transport/i.test(g3.questions[0].context ?? ''),
  `"${g3.questions[0].context}"`,
);
check(
  'G3 ô trống gắn qid',
  (g3.table ?? []).flat().some((c) => c.qid),
);

// 4) tự luận + full-width
check('G4 type write', g4.type === 'write', g4.type);
check(
  'G4 số câu 8,9 (full-width ９)',
  g4.questions.map((q) => q.number).join(',') === '8,9',
  g4.questions.map((q) => q.number).join(','),
);

// 5) bank xếp chồng
check('G5 type word-bank', g5.type === 'word-bank', g5.type);
check(
  'G5 bank đủ 6 từ',
  (g5.wordBank?.length ?? 0) >= 6 && !!g5.wordBank?.includes('congestion'),
  (g5.wordBank ?? []).join(','),
);

console.log(failures ? `\n${failures} FAILURES` : '\nALL EDGE TESTS PASSED');
process.exit(failures ? 1 : 0);
