// Tạo file docx mẫu IELTS để kiểm thử parser
// Chạy: node scripts/make-sample.mjs
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from 'docx';
import { writeFileSync } from 'fs';

const p = (text, opts = {}) => new Paragraph({ text, ...opts });

const children = [
  p('IELTS Reading Practice — Urban Transport', {
    heading: HeadingLevel.TITLE,
  }),
  p('Audio (Listening track): https://cdn.example.com/ielts/listening-track-1.mp3'),

  p('Passage', { heading: HeadingLevel.HEADING_1 }),
  p(
    'Many cities around the world are struggling with traffic congestion. In the 1990s, Copenhagen invested heavily in cycling infrastructure, and today more than 60% of residents cycle to work. Meanwhile, Singapore introduced congestion charges as early as 1975, which reduced traffic in the city centre by 44%.',
  ),
  p(
    'More recently, remote working has changed commuting patterns. A 2023 study found that the average office worker now commutes only 2.5 days per week, prompting planners to rethink the need for massive road expansion.',
  ),

  p('Questions 1–4', { heading: HeadingLevel.HEADING_2 }),
  p('Choose the correct letter, A, B, C or D.'),
  p('1. What did Copenhagen invest in during the 1990s?'),
  p('A. Congestion charges'),
  p('B. Cycling infrastructure'),
  p('C. Office buildings'),
  p('D. Remote working'),
  p('2. When did Singapore introduce congestion charges?'),
  p('A. 1945'),
  p('B. 1965'),
  p('C. 1975'),
  p('D. 1995'),
  p('3. How many residents of Copenhagen cycle to work?'),
  p('A. About 16%'),
  p('B. About 30%'),
  p('C. About 44%'),
  p('D. About 60%'),
  p('4. The 2023 study showed that office workers now commute'),
  p('A. every day'),
  p('B. 2.5 days a week'),
  p('C. only on Mondays'),
  p('D. less than once a week'),

  p('Questions 5–7', { heading: HeadingLevel.HEADING_2 }),
  p('Do the following statements agree with the information given in the passage?'),
  p('TRUE — if the statement agrees with the information'),
  p('FALSE — if the statement contradicts the information'),
  p('NOT GIVEN — if there is no information on this'),
  p(
    '5. Copenhagen has the highest cycling rate of any city in Europe. [Blank: no data in passage]',
  ),
  p('6. Singapore reduced city-centre traffic by 44% after introducing charges.'),
  p('7. Planners are considering building more roads because of remote working.'),

  p('Questions 8–10', { heading: HeadingLevel.HEADING_2 }),
  p(
    'Complete the sentences below. Choose words from the box. Write ONE WORD ONLY from the box.',
  ),
  p(
    'congestion, infrastructure, residents, charges, remote, patterns, expansion, centre, cycling, study',
  ),
  p('8. Singapore introduced ________ charges in 1975.'),
  p('9. More than 60% of ________ in Copenhagen cycle to work.'),
  p('10. A 2023 ________ changed how planners view commuting.'),

  p('Questions 11–13', { heading: HeadingLevel.HEADING_2 }),
  p('Complete the table below. Write NO MORE THAN TWO WORDS for each answer.'),
];

const cell = (text, opts = {}) =>
  new TableCell({
    children: [new Paragraph({ text, ...opts })],
    ...{},
  });

children.push(
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          cell('City', { bold: true }),
          cell('Measure', { bold: true }),
          cell('Year', { bold: true }),
          cell('Result', { bold: true }),
        ],
      }),
      new TableRow({
        children: [
          cell('Copenhagen'),
          cell('Investment in transport'),
          cell('1990s'),
          cell('11. ..........'),
        ],
      }),
      new TableRow({
        children: [
          cell('Singapore'),
          cell('12. ..........'),
          cell('1975'),
          cell('44% less traffic'),
        ],
      }),
      new TableRow({
        children: [
          cell('Worldwide'),
          cell('Remote working study'),
          cell('13. ..........'),
          cell('2.5 days per week'),
        ],
      }),
    ],
  }),
);

children.push(
  p(''),
  p('Questions 14–16', { heading: HeadingLevel.HEADING_2 }),
  p('Match each statement with the correct city, A, B or C.'),
  p('A. Copenhagen'),
  p('B. Singapore'),
  p('C. Both cities'),
  p('14. Cut city-centre traffic'),
  p('15. Built dedicated bike lanes'),
  p('16. Affected by remote working trends'),

  p(''),
  p('Questions 17–19', { heading: HeadingLevel.HEADING_2 }),
  p('Complete the form below. Write ONE WORD ONLY.'),
  p('17. Full name: ..........'),
  p('18. Address: ..........'),
  p('19. Date of birth: (........)'),
);

const doc = new Document({ sections: [{ properties: {}, children }] });
const buf = await Packer.toBuffer(doc);
writeFileSync('sample-ielts.docx', buf);
console.log('Đã tạo sample-ielts.docx');
