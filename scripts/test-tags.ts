// Kiểm thử tag ép kiểu: [TFNG] [FILL] [FORM] [BANK] [YNNG] [WRITE] [MCQ]
// Chạy: npx tsx scripts/test-tags.ts
import { JSDOM } from 'jsdom';

const dom = new JSDOM('');
(globalThis as any).DOMParser = dom.window.DOMParser;
(globalThis as any).Node = dom.window.Node;

import { Document, HeadingLevel, Packer, Paragraph } from 'docx';
import { parseDocx } from '../src/utils/docxParser';

const p = (text: string, opts: any = {}) => new Paragraph({ text, ...opts });
const doc = new Document({
  sections: [
    {
      children: [
        p('Tag Test', { heading: HeadingLevel.TITLE }),
        p('A short passage.'),

        // tag dính sau header
        p('Questions 1–3 [TFNG]', { heading: HeadingLevel.HEADING_2 }),
        p('Do these statements agree with the passage?'),
        p('1. Copenhagen is cold.'),
        p('2. Singapore is hot.'),
        p('3. Refer to [Box A] for details.'),

        // tag đứng riêng 1 dòng
        p('Questions 4–5', { heading: HeadingLevel.HEADING_2 }),
        p('[FILL]'),
        p('Complete the sentences.'),
        p('4. Fill ___ here.'),
        p('5. Fill ... here.'),

        // tag form + dòng không có chỗ trống / kèm giá trị ví dụ
        p('Questions 6–7 [FORM]', { heading: HeadingLevel.HEADING_2 }),
        p('6. Full name: Nguyen Van A'),
        p('Address: 12 Main St'),

        // tag dính trong instruction
        p('Questions 8–9', { heading: HeadingLevel.HEADING_2 }),
        p('[BANK] Choose words from this box.'),
        p('apple, banana, cherry, date, elderberry, fig'),
        p('8. I like ___.'),
        p('9. She eats ___.'),

        // tag YNNG + tag WRITE
        p('Questions 10–11 [YNNG]', { heading: HeadingLevel.HEADING_2 }),
        p('10. He agrees.'),
        p('11. She disagrees.'),
        p('Questions 12–13 [WRITE]', { heading: HeadingLevel.HEADING_2 }),
        p('12. Why is the sky blue?'),
        p('13. Explain your answer.'),

        // tag đứng trước header
        p('[MCQ]'),
        p('Questions 14–15', { heading: HeadingLevel.HEADING_2 }),
        p('14. Pick one.'),
        p('A. Alpha'),
        p('B. Beta'),
      ],
    },
  ],
});
const buf = await Packer.toBuffer(doc);
const ex = await parseDocx(new File([buf as any], 'tags.docx'));

let failures = 0;
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
};

check('7 groups', ex.groups.length === 7, `got ${ex.groups.length}`);
const [g1, g2, g3, g4, g5, g6, g7] = ex.groups;

// G1: [TFNG] sau header
check('G1 boolean + locked', g1.type === 'boolean' && g1.typeLocked === true, `${g1.type} locked=${g1.typeLocked}`);
check('G1 title sạch tag', g1.title === 'Questions 1–3', `"${g1.title}"`);
check(
  'G1 options TRUE/FALSE/NOT GIVEN',
  (g1.questions[0].options ?? []).map((o) => o.text).join('/') === 'TRUE/FALSE/NOT GIVEN',
  (g1.questions[0].options ?? []).map((o) => o.text).join('/'),
);
check(
  'G1 ngoặc lạ [Box A] giữ nguyên',
  g1.questions[2].text === 'Refer to [Box A] for details.',
  `"${g1.questions[2].text}"`,
);

// G2: [FILL] riêng 1 dòng
check('G2 gap + locked', g2.type === 'gap' && g2.typeLocked === true, `${g2.type} locked=${g2.typeLocked}`);
check('G2 instruction sạch tag', g2.instruction === 'Complete the sentences.', `"${g2.instruction}"`);

// G3: [FORM] + dòng không chỗ trống
check('G3 form + locked', g3.type === 'form' && g3.typeLocked === true, `${g3.type} locked=${g3.typeLocked}`);
check(
  'G3 2 câu form',
  g3.questions.length === 2 && g3.questions.every((q) => q.type === 'form'),
  g3.questions.map((q) => `${q.number}:${q.text}`).join(' / '),
);
check(
  'G3 giá trị ví dụ thành placeholder',
  (g3.questions[0].placeholder ?? '').includes('Nguyen Van A'),
  `"${g3.questions[0].placeholder}"`,
);

// G4: [BANK] trong instruction
check('G4 word-bank + locked', g4.type === 'word-bank' && g4.typeLocked === true, `${g4.type} locked=${g4.typeLocked}`);
check('G4 bank 6 từ', (g4.wordBank?.length ?? 0) === 6, (g4.wordBank ?? []).join(','));

// G5: [YNNG]
check('G5 boolean + locked', g5.type === 'boolean' && g5.typeLocked === true, `${g5.type} locked=${g5.typeLocked}`);
check(
  'G5 options YES/NO/NOT GIVEN',
  (g5.questions[0].options ?? []).map((o) => o.text).join('/') === 'YES/NO/NOT GIVEN',
  (g5.questions[0].options ?? []).map((o) => o.text).join('/'),
);

// G6: [WRITE]
check('G6 write + locked', g6.type === 'write' && g6.typeLocked === true, `${g6.type} locked=${g6.typeLocked}`);

// G7: [MCQ] đứng trước header
check('G7 mcq + locked', g7.type === 'mcq' && g7.typeLocked === true, `${g7.type} locked=${g7.typeLocked}`);
check('G7 options gắn đúng', (g7.questions[0].options?.length ?? 0) === 2);

// không còn sót tag trong toàn bộ text hiển thị
const allText = ex.groups
  .flatMap((g) => [g.title, g.instruction, ...g.questions.map((q) => q.text)])
  .join(' ');
check(
  'không sót tag đã biết',
  !/\[(TFNG|FILL|FORM|BANK|YNNG|WRITE|MCQ)\]/i.test(allText),
);

console.log(failures ? `\n${failures} FAILURES` : '\nALL TAG TESTS PASSED');
process.exit(failures ? 1 : 0);
