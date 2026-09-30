import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import fileSaver from 'file-saver';
import type { Answers, Exercise, Question, QuestionGroup } from '../types';

// file-saver là CJS: module.exports = saveAs (và saveAs.saveAs = saveAs)
const saveAs: typeof fileSaver.saveAs =
  (fileSaver as unknown as { saveAs?: typeof fileSaver.saveAs }).saveAs ??
  (fileSaver as unknown as typeof fileSaver.saveAs);

const TYPE_LABEL: Record<Question['type'], string> = {
  mcq: 'Trắc nghiệm',
  boolean: 'Đúng / Sai / Không nói',
  matching: 'Nối thông tin',
  gap: 'Điền từ',
  'word-bank': 'Điền từ (word bank)',
  form: 'Điền thông tin',
  write: 'Tự luận',
};

function answerText(q: Question, answers: Answers): string {
  const raw = (answers[q.id] ?? '').trim();
  if (raw) {
    // nếu chọn option dạng letter → hiển thị cả chữ
    const opt = q.options?.find(
      (o) => o.letter.toLowerCase() === raw.toLowerCase(),
    );
    if (opt) return `${opt.letter}. ${opt.text}`;
    return raw;
  }
  return '________________';
}

function questionParagraph(q: Question, answers: Answers): Paragraph[] {
  const out: Paragraph[] = [];
  const num = q.number !== null ? `${q.number}. ` : '• ';
  const runs = [
    new TextRun({ text: num, bold: true }),
    new TextRun({ text: q.text }),
  ];
  if (q.context) {
    runs.push(new TextRun({ text: `  (${q.context})`, italics: true, size: 18 }));
  }
  out.push(new Paragraph({ children: runs, spacing: { before: 160, after: 60 } }));

  if (q.options?.length) {
    for (const o of q.options) {
      const chosen =
        (answers[q.id] ?? '').toLowerCase() === o.letter.toLowerCase();
      out.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${o.letter}. ${o.text}`, bold: chosen }),
          ],
          indent: { left: 480 },
          spacing: { after: 40 },
        }),
      );
    }
  }

  out.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'Đáp án: ', bold: true }),
        new TextRun({
          text: answerText(q, answers),
          bold: true,
          color: answers[q.id]?.trim() ? '1B7F3B' : '999999',
        }),
      ],
      indent: { left: 480 },
      spacing: { after: 160 },
    }),
  );
  return out;
}

function tableToDocx(group: QuestionGroup, answers: Answers): Table {
  const rows = (group.table ?? []).map(
    (row, r) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' },
                left: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' },
                right: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' },
              },
              children: [
                new Paragraph({
                  children: cell.qid
                    ? [
                        new TextRun({ text: `${cell.text} `, size: 20 }),
                        new TextRun({
                          text:
                            answers[
                              group.questions.find((q) => q.id === cell.qid)!
                                .id
                            ]?.trim() || '__________',
                          bold: true,
                          color: '1B7F3B',
                          size: 20,
                        }),
                      ]
                    : [
                        new TextRun({
                          text: cell.text || '',
                          size: 20,
                          bold: r === 0,
                        }),
                      ],
                  spacing: { after: 40 },
                }),
              ],
            }),
        ),
      }),
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

function groupToChildren(
  group: QuestionGroup,
  answers: Answers,
): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  out.push(
    new Paragraph({
      text: group.title,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 320, after: 80 },
    }),
  );

  if (group.instruction) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: group.instruction, italics: true })],
        spacing: { after: 120 },
      }),
    );
  }

  out.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Loại câu hỏi: ${TYPE_LABEL[group.type]}`,
          size: 18,
          color: '666666',
        }),
      ],
      spacing: { after: 120 },
    }),
  );

  if (group.wordBank?.length) {
    out.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Word bank: ', bold: true }),
          new TextRun({ text: group.wordBank.join('  |  ') }),
        ],
        spacing: { after: 160 },
      }),
    );
  }

  if (group.table) {
    out.push(tableToDocx(group, answers));
    out.push(
      new Paragraph({ text: '', spacing: { after: 120 } }),
    );
    // bảng hỏi chung cũng liệt kê lại ở danh sách câu hỏi
    for (const q of group.questions) {
      out.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${q.number}. `, bold: true }),
            new TextRun({ text: q.context ? `(${q.context})` : 'Điền vào ô' }),
            new TextRun({ text: '  →  ', color: '999999' }),
            new TextRun({
              text: answers[q.id]?.trim() || '____________',
              bold: true,
              color: answers[q.id]?.trim() ? '1B7F3B' : '999999',
            }),
          ],
          spacing: { after: 80 },
        }),
      );
    }
    return out;
  }

  if (group.sharedOptions?.length && group.type === 'matching') {
    out.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Các lựa chọn: ', bold: true }),
          new TextRun({
            text: group.sharedOptions
              .map((o) => `${o.letter}. ${o.text}`)
              .join('   '),
          }),
        ],
        spacing: { after: 160 },
      }),
    );
  }

  for (const q of group.questions) {
    out.push(...questionParagraph(q, answers));
  }
  return out;
}

export async function exportToDocx(
  exercise: Exercise,
  answers: Answers,
  studentName?: string,
  audioUrl?: string | null,
): Promise<void> {
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      text: exercise.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
  );

  if (studentName) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Họ tên: ', bold: true }),
          new TextRun({ text: studentName }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
      }),
    );
  }

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Ngày làm: ${new Date().toLocaleDateString('vi-VN')}  ·  Nguồn: ${exercise.fileName}`,
          color: '888888',
          size: 18,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
    }),
  );

  // Link audio bài Listening (nếu có)
  const audioLink = audioUrl ?? exercise.audioUrl;
  if (audioLink) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: '🎧 Audio: ', bold: true, size: 20 }),
          new TextRun({ text: audioLink, size: 20, color: '4F46E5' }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
    );
  }

  // Thống kê nhanh
  const allQ = exercise.groups.flatMap((g) => g.questions);
  const done = allQ.filter((q) => answers[q.id]?.trim()).length;
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Tiến độ: ${done}/${allQ.length} câu đã điền đáp án`,
          bold: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
    }),
  );

  if (exercise.passage.length) {
    children.push(
      new Paragraph({
        text: 'PASSAGE',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 120, after: 120 },
      }),
    );
    for (const para of exercise.passage) {
      children.push(
        new Paragraph({ text: para, spacing: { after: 120 } }),
      );
    }
  }

  for (const group of exercise.groups) {
    children.push(...groupToChildren(group, answers));
  }

  // Answer key cuối file
  children.push(
    new Paragraph({
      text: 'BẢNG ĐÁP ÁN',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 120 },
    }),
  );

  const keyRows: TableRow[] = [
    new TableRow({
      children: ['Câu', 'Đáp án'].map(
        (h) =>
          new TableCell({
            shading: { fill: 'EEF2FF' },
            children: [
              new Paragraph({
                children: [new TextRun({ text: h, bold: true })],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
      ),
    }),
    ...allQ.map(
      (q) =>
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: q.number !== null ? String(q.number) : q.id,
                      bold: true,
                    }),
                  ],
                  alignment: AlignmentType.CENTER,
                }),
              ],
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: answers[q.id]?.trim() || '—',
                      color: answers[q.id]?.trim() ? '1B7F3B' : '999999',
                      bold: !!answers[q.id]?.trim(),
                    }),
                  ],
                  alignment: AlignmentType.CENTER,
                }),
              ],
            }),
          ],
        }),
    ),
  ];

  children.push(
    new Table({
      width: { size: 40, type: WidthType.PERCENTAGE },
      rows: keyRows,
    }),
  );

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(doc);
  const safe = exercise.title.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);
  saveAs(blob, `${safe}_dap_an.docx`);
}

/** Export nhanh: chỉ danh sách đáp án (dán vào chat / email) */
export function answersToText(exercise: Exercise, answers: Answers): string {
  const lines: string[] = [exercise.title, ''];
  for (const g of exercise.groups) {
    lines.push(`— ${g.title}`);
    for (const q of g.questions) {
      const a = answers[q.id]?.trim() || '(chưa điền)';
      const opt = q.options?.find(
        (o) => o.letter.toLowerCase() === a.toLowerCase(),
      );
      lines.push(
        `${q.number ?? '•'}. ${opt ? `${opt.letter}. ${opt.text}` : a}`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}
