// Kiểm thử bảng ký hiệu (src/utils/symbols.ts):
// chuẩn hoá unicode + tiền tố số câu + ký hiệu chỗ trống mới.
// Chạy: npx tsx scripts/test-symbols.ts
import { JSDOM } from 'jsdom';

const dom = new JSDOM('');
(globalThis as any).DOMParser = dom.window.DOMParser;
(globalThis as any).Node = dom.window.Node;

import { Document, HeadingLevel, Packer, Paragraph } from 'docx';
import { parseDocx } from '../src/utils/docxParser';
import { BLANK_RE, normalizeLine } from '../src/utils/symbols';

let failures = 0;
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
};

/* ---------- 1. Chuẩn hoá unicode ---------- */
const normCases: Array<[string, string]> = [
  ['９. Who?', '9. Who?'],
  ['Ａ． text', 'A. text'],
  ['① What?', '1 What?'],
  ['Ⓐ Congestion', 'A. Congestion'],
  ['（A） text', '(A) text'],
  ['a，b；c：d', 'a,b;c:d'],
  ['﹏﹏ end', '__ end'],
  ['a···b', 'a...b'],
  ['Questions 1～3', 'Questions 1~3'],
];
for (const [input, expected] of normCases) {
  const got = normalizeLine(input);
  check(`normalize "${input}"`, got === expected, `"${got}"`);
}

/* ---------- 2. Ký hiệu chỗ trống ---------- */
const blankYes = [
  '______',
  '..........',
  '……',
  '...',
  '(....)',
  '(      )',
  '[]',
  '[____]',
  '□□□',
  '□',
  '???',
  '###',
  '***',
  '×××',
  '﹏﹏',
];
for (const s of blankYes) {
  const t = normalizeLine(s);
  check(`blank "${s}"`, BLANK_RE.test(t));
}
const blankSingle = ['…', '_', '?', '*', '•'];
for (const s of blankSingle) {
  check(`1 ký tự "${s}" không tính là blank`, !BLANK_RE.test(s));
}
const blankNo = ['A. text', '(A)', '[12]', 'e.g. well-known', 'C++', 'Q&A', '(see Fig. 2)'];
for (const s of blankNo) {
  check(`không phải blank "${s}"`, !BLANK_RE.test(s));
}

/* ---------- 3. Parse file dùng ký hiệu mới ---------- */
const p = (text: string, opts: any = {}) => new Paragraph({ text, ...opts });
const doc = new Document({
  sections: [
    {
      children: [
        p('Symbol Test', { heading: HeadingLevel.TITLE }),
        p('A short passage.'),
        p('Bài 1–2', { heading: HeadingLevel.HEADING_2 }),
        p('Choose the correct letter, A, B or C.'),
        p('Q1. What did they build?'),
        p('Ⓐ Roads'),
        p('Ⓑ Bridges'),
        p('Ⓒ Parks'),
        p('Câu 2: When did it open?'),
        p('Ａ. 1990'),
        p('Ｂ. 2000'),
        p('Questions 3–5'),
        p('Complete the sentences.'),
        p('3. Fill □□□ here.'),
        p('4. Fill ??? here.'),
        p('5. Fill (      ) here.'),
        p('Questions 6–7'),
        p('Complete the form below.'),
        p('6. Địa chỉ: □□□□'),
        p('7. Name: ＿＿＿'),
      ],
    },
  ],
});
const buf = await Packer.toBuffer(doc);
const ex = await parseDocx(new File([buf as any], 'symbols.docx'));

check('2 groups (Bài + Questions)', ex.groups.length === 3, `got ${ex.groups.length}`);
const [s1, s2, s3] = ex.groups;
check('G1 range 1-2 từ "Bài 1–2"', s1.range === '1-2', s1.range);
check('G1 type mcq', s1.type === 'mcq', s1.type);
check(
  'G1 số câu 1,2 (Q1. / Câu 2:)',
  s1.questions.map((q) => q.number).join(',') === '1,2',
  s1.questions.map((q) => q.number).join(','),
);
check(
  'G1 options từ ⒶⒷⒸ + ＡＢ',
  (s1.questions[0].options?.length ?? 0) === 3 &&
    (s1.questions[1].options?.length ?? 0) === 2,
  s1.questions.map((q) => q.options?.map((o) => o.letter).join('')).join(' / '),
);
check('G2 type gap', s2.type === 'gap', s2.type);
check(
  'G2 số câu 3,4,5 (blank □□□ ??? ())',
  s2.questions.map((q) => q.number).join(',') === '3,4,5',
  s2.questions.map((q) => q.number).join(','),
);
check('G3 type form', s3.type === 'form', s3.type);
check(
  'G3 form nhận □□□□ + ＿＿＿ (label sạch)',
  s3.questions.map((q) => q.number).join(',') === '6,7' &&
    s3.questions[0].text === 'Địa chỉ' &&
    s3.questions[1].text === 'Name',
  s3.questions.map((q) => `${q.number}:${q.text}`).join(' / '),
);

console.log(failures ? `\n${failures} FAILURES` : '\nALL SYMBOL TESTS PASSED');
process.exit(failures ? 1 : 0);
