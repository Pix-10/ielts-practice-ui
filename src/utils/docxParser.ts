import mammoth from 'mammoth';
import type {
  Exercise,
  OptionItem,
  Question,
  QuestionGroup,
  QuestionType,
  TableCell,
} from '../types';

/* ------------------------------------------------------------------ */
/*  Block model: docx → danh sách đoạn văn / bảng                      */
/* ------------------------------------------------------------------ */

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'table'; rows: string[][] };

/** Lấy text của element, giữ nguyên xuống dòng (<br>) */
function elText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  return (clone.textContent || '').replace(/\u00a0/g, ' ');
}

function htmlToBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks: Block[] = [];

  doc.body.childNodes.forEach((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    if (el.tagName === 'TABLE') {
      const rows: string[][] = [];
      el.querySelectorAll('tr').forEach((tr) => {
        const cells = Array.from(tr.children).map((td) => elText(td).trim());
        if (cells.length) rows.push(cells);
      });
      if (rows.length) blocks.push({ kind: 'table', rows });
      return;
    }

    const text = elText(el).trim();
    if (text) blocks.push({ kind: 'p', text });
  });

  return blocks;
}

/* ------------------------------------------------------------------ */
/*  Regex nhận diện                                                    */
/* ------------------------------------------------------------------ */

/** "Questions 1-5", "Questions 1 – 5", "Câu 1-5", "Questions 7" */
const GROUP_HEADER =
  /^(?:questions?|câu\s*(?:hỏi|h)\s*|part|section)\s*[-–—:]?\s*(\d{1,3})(?:\s*(?:[-–—]|to)\s*(\d{1,3}))?/i;

/** "1. text", "1) text", "(1) text", "1 text" */
const Q_NUM = /^[([]?(\d{1,3})[)\].、:]\s*(.+)$/;
const Q_NUM_LOOSE = /^(\d{1,3})\s{1,2}([A-Za-z(\[].+)$/;

/** Form line: "1. Họ tên: ..........", "Địa chỉ: _____", "Ngày sinh: (....)"
 *  — số tùy chọn, label + dấu hai chấm + BẮT BUỘC chỗ trống phía sau */
const FORM_LINE =
  /^(?:[([]?(\d{1,3})[)\].、]\s+)?([^:：\n]{2,60}?)\s*[:：]\s*(?:_{2,}|\.{3,}|\…{2,}|\(\s*[.…_ -]{3,}\s*\)|\[[.…_ -]{2,}\])\s*$/;

/** "A. text", "B) text" */
const OPT_LETTER = /^[([]?([A-Ha-h])[)\].、:]\s+(.+)$/;

/** "i. text", "iv) text" */
const OPT_ROMAN =
  /^[([]?((?:xi{0,3}|ix|iv|vi{0,3}|i{1,3}|x))\s*[).、:]\s+(.+)$/i;

const INSTR_RE =
  /(choose the correct letter|correct letter,?\s*[A-D]|match the|matching|list of headings|true\s*\/?\s*false|yes\s*\/?\s*no|not given|complete the|fill in|write the correct|no more than|you may use|you can use|more than once|one word|two words|three words|does the writer|which paragraph|find (?:the )?information|which section|answer (?:the )?(?:following )?questions|hoàn thành|hợp lý nhất|điền từ|chọn đáp án)/i;

const BLANK_RE = /_{2,}|\(\s*[.。…_-]{3,}\s*\)|\[ *\]|…{2,}|_{1}/;

/** Ô trong bảng là ô điền đáp án: "1. .....", "(2) ......", "3" (khi instruction bảo complete table) */
const CELL_BLANK = /^[([]?(\d{1,3})[)\].、]?\s*(?:[._….\-–—]{2,})?\s*$/;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function isLetterOption(line: string): RegExpMatchArray | null {
  return line.match(OPT_LETTER);
}

function isRomanOption(line: string): RegExpMatchArray | null {
  const m = line.match(OPT_ROMAN);
  if (!m) return null;
  // tránh bắt nhầm "I." viết hoa đứng một mình hoặc từ lạ
  if (m[2].trim().length < 2) return null;
  return m;
}

/** "A. Paris  B. London  C. Rome" → tách thành options */
function splitInlineLetterOptions(line: string): OptionItem[] | null {
  const re = /(?:^|\s)[([]?([A-Ha-h])[)\].、:]\s+/g;
  const matches = [...line.matchAll(re)];
  if (matches.length < 2) return null;
  const items: OptionItem[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index! + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : line.length;
    const text = line.slice(start, end).trim();
    if (text) items.push({ letter: matches[i][1].toUpperCase(), text });
  }
  return items.length >= 2 ? items : null;
}

function splitInlineRomanOptions(line: string): OptionItem[] | null {
  const re =
    /(?:^|\s)[([]?((?:xi{0,3}|ix|iv|vi{0,3}|i{1,3}|x))[)\].、:]\s+/gi;
  const matches = [...line.matchAll(re)];
  if (matches.length < 3) return null;
  const items: OptionItem[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index! + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : line.length;
    const text = line.slice(start, end).trim();
    if (text) items.push({ letter: matches[i][1], text });
  }
  return items.length >= 3 ? items : null;
}

/** "achieve, across, attention ..." → danh sách từ */
function splitWordList(text: string): string[] | null {
  const parts = text
    .split(/[,;/|]+|\s{2,}|\t+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 5 && parts.every((p) => p.split(/\s+/).length <= 4)) {
    return parts;
  }
  // nhiều từ cách nhau bằng 1 khoảng trắng: "achieve attention across ..."
  if (/^[A-Za-zÀ-ỹ][A-Za-zÀ-ỹ'’\-\s]{10,}$/.test(text)) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length >= 6 && words.every((w) => w.length <= 14)) return words;
  }
  return null;
}

function numberInRange(
  n: number,
  range?: string,
): boolean {
  if (!range) return true;
  const [a, b] = range.split('-').map(Number);
  if (Number.isNaN(a)) return true;
  return n >= a && (Number.isNaN(b) ? true : n <= b);
}

/* ------------------------------------------------------------------ */
/*  Suy ra type cho group                                              */
/* ------------------------------------------------------------------ */

function inferGroupType(g: QuestionGroup): QuestionType {
  const instr = g.instruction.toLowerCase();

  if (g.questions.some((q) => q.type === 'form')) return 'form';
  if (g.table) return 'gap';
  if (/list of headings|match the headings|tiêu đề phù hợp/.test(instr))
    return 'matching';
  // TF/NG: instruction chứa cả TRUE và FALSE (hoặc YES và NO) + NOT GIVEN
  if (/not given/.test(instr) && (/\btrue\b/.test(instr) || /\byes\b/.test(instr)))
    return 'boolean';
  if (/true\s*\/?\s*false|yes\s*\/?\s*no/.test(instr)) return 'boolean';
  if (/match the|matching|nối|phù hợp với/.test(instr) && g.sharedOptions?.length)
    return 'matching';
  if (/choose the correct letter|correct letter,?\s*[a-d]|trắc nghiệm/.test(instr))
    return 'mcq';
  if (g.wordBank?.length && /complete|fill|choose|box|words?|từ vựng|điền/.test(instr))
    return 'word-bank';
  if (/complete|fill in|no more than|one word|two words|three words|điền/.test(instr))
    return 'gap';
  if (g.sharedOptions?.length) return 'matching';
  if (g.questions.some((q) => q.options?.length)) return 'mcq';
  if (g.wordBank?.length) return 'word-bank';
  return 'gap';
}

function booleanOptions(instr: string): OptionItem[] {
  if (/\byes\b/i.test(instr) && !/\btrue\b/i.test(instr)) {
    return [
      { letter: 'A', text: 'YES' },
      { letter: 'B', text: 'NO' },
      { letter: 'C', text: 'NOT GIVEN' },
    ];
  }
  return [
    { letter: 'A', text: 'TRUE' },
    { letter: 'B', text: 'FALSE' },
    { letter: 'C', text: 'NOT GIVEN' },
  ];
}

function gapPlaceholder(instr: string): string {
  const lower = instr.toLowerCase();
  const m = lower.match(/no more than (\w+) words?/);
  if (m) return `TỐI ĐA ${m[1].toUpperCase()} TỪ`;
  if (/one word only|1 word/.test(lower)) return 'MỘT TỪ';
  if (/two words/.test(lower)) return 'HAI TỪ';
  if (/three words/.test(lower)) return 'BA TỪ';
  return 'Điền đáp án';
}

/* ------------------------------------------------------------------ */
/*  Parser chính                                                       */
/* ------------------------------------------------------------------ */

export async function parseDocx(file: File): Promise<Exercise> {
  const arrayBuffer = await file.arrayBuffer();
  // Browser build của mammoth nhận { arrayBuffer }, Node build nhận { buffer }
  const input =
    typeof Buffer !== 'undefined'
      ? { arrayBuffer, buffer: Buffer.from(arrayBuffer) }
      : { arrayBuffer };
  const { value: html } = await mammoth.convertToHtml(input);
  const blocks = htmlToBlocks(html);
  const warnings: string[] = [];

  /* ---------- 1. Tìm điểm bắt đầu khu vực câu hỏi ---------- */
  let start = blocks.findIndex(
    (b) => b.kind === 'p' && GROUP_HEADER.test(b.text.trim()),
  );

  if (start < 0) {
    // không có header "Questions x-y" → tìm câu hỏi đầu tiên có option/bỏ trống phía sau
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.kind !== 'p') continue;
      const m = b.text.match(Q_NUM);
      if (!m || Number(m[1]) > 100) continue;
      const next = blocks[i + 1];
      const looksLikeQ =
        BLANK_RE.test(b.text) ||
        (next?.kind === 'p' &&
          (isLetterOption(next.text.trim()) || INSTR_RE.test(next.text)));
      if (looksLikeQ) {
        start = i;
        break;
      }
    }
  }

  let title = file.name.replace(/\.docx$/i, '');
  const passage: string[] = [];
  let pendingInstr = '';

  if (start >= 0) {
    const pre = blocks.slice(0, start).filter((b) => b.kind === 'p') as Extract<
      Block,
      { kind: 'p' }
    >[];

    if (pre.length) {
      const first = pre[0].text.trim();
      if (first.length <= 110 && !INSTR_RE.test(first)) {
        title = first;
        pre.shift();
      } else {
        const heading = pre.find((p) => p.text.trim().length <= 60);
        if (heading) title = heading.text.trim();
      }
      // dòng cuối trước khu vực câu hỏi có thể là instruction dính sang
      const last = pre[pre.length - 1];
      if (last && INSTR_RE.test(last.text) && last.text.length < 300) {
        pendingInstr = last.text.trim();
        pre.pop();
      }
      passage.push(...pre.map((p) => p.text.trim()).filter(Boolean));
    }
  } else {
    warnings.push(
      'Không tìm thấy khu vực câu hỏi — chỉ đọc được phần nội dung (passage).',
    );
    blocks.forEach((b) => {
      if (b.kind === 'p') passage.push(b.text.trim());
    });
  }

  /* ---------- 2. Walk các block khu vực câu hỏi ---------- */
  const groups: QuestionGroup[] = [];
  // Dùng object holder để TypeScript không narrow thành never
  // (các biến này được gán bên trong closure)
  const state = {
    group: null as QuestionGroup | null,
    curQ: null as Question | null,
    collectingInstr: false,
  };
  let qi = 0;

  const newGroup = (headerText: string): QuestionGroup => {
    const m = headerText.match(GROUP_HEADER);
    const range =
      m && m[2] ? `${m[1]}-${m[2]}` : m ? `${m[1]}` : undefined;
    const g: QuestionGroup = {
      id: `g${groups.length}`,
      title: headerText.trim(),
      range,
      instruction: pendingInstr,
      type: 'gap',
      questions: [],
    };
    pendingInstr = '';
    groups.push(g);
    state.group = g;
    state.curQ = null;
    state.collectingInstr = true;
    return g;
  };

  const ensureGroup = (): QuestionGroup => {
    if (!state.group) return newGroup('Questions');
    return state.group;
  };

  const newQuestion = (numStr: string | null, text: string): Question => {
    const g = ensureGroup();
    const q: Question = {
      id: `g${groups.length - 1}q${qi++}`,
      number: numStr ? Number(numStr) : null,
      text: text.trim(),
      type: 'gap',
    };
    g.questions.push(q);
    state.curQ = q;
    state.collectingInstr = false;
    return q;
  };

  for (let i = start < 0 ? blocks.length : start; i < blocks.length; i++) {
    const b = blocks[i];

    /* ----- Bảng ----- */
    if (b.kind === 'table') {
      const g = ensureGroup();
      const flat = b.rows.flat().filter(Boolean);
      const allShort = flat.every((c) => c.split(/\s+/).length <= 4);
      const isTableInstr = /complete the (table|grid)|hoàn thành bảng/i.test(
        g.instruction,
      );

      /* Thử nhận diện ô điền đáp án TRƯỚC (ưu tiên hơn word bank) */
      const questionsBefore = g.questions.length;
      const table: TableCell[][] = b.rows.map((row) =>
        row.map((cellText, c) => {
          const trimmed = cellText.trim();
          const m = trimmed.match(CELL_BLANK);
          if (!m || c === 0) return { text: cellText };

          const hasBlankMark = BLANK_RE.test(trimmed);
          // "1. ..........", "2 .........." — số + chuỗi dấu chấm/gạch
          const hasDotBlank =
            /^[([]?\d{1,3}[)\].、]?\s*[._….\-–—]{2,}\s*$/.test(trimmed);
          const bareNumber = /^[([]?\d{1,3}[)\].、]?$/.test(trimmed);
          const isAnswerCell =
            hasBlankMark ||
            hasDotBlank ||
            (bareNumber && isTableInstr);

          if (isAnswerCell) {
            const num = Number(m[1]);
            // Ô có đánh dấu chỗ trống rõ ràng → chấp nhận dù số lệch range
            // (ô chỉ có số trần thì cần đúng range để tránh bắt nhầm dữ liệu)
            const inRange = numberInRange(num, g.range);
            if (inRange || hasBlankMark || hasDotBlank) {
              if (!inRange && g.range) g.range = undefined;
              const q: Question = {
                id: `g${groups.length - 1}q${qi++}`,
                number: num,
                text: trimmed || `Ô ${num}`,
                type: 'gap',
                context: `hàng "${row[0] ?? ''}"`,
              };
              g.questions.push(q);
              return { text: cellText, qid: q.id };
            }
          }
          return { text: cellText };
        }),
      );

      if (g.questions.length > questionsBefore) {
        // Bảng điền chỗ trống
        g.table = table;
        g.type = 'gap';
        state.curQ = null;
        continue;
      }

      // Không có ô điền → có thể là word bank dạng bảng
      if (!g.wordBank && allShort && flat.length >= 5) {
        const hint = /box|bank|words?|list|từ/i.test(g.instruction);
        if (hint || g.questions.length === 0) {
          g.wordBank = flat;
          state.curQ = null;
          continue;
        }
      }
      state.curQ = null;
      continue;
    }

    /* ----- Đoạn văn: xử lý từng dòng ----- */
    const lines = b.text.split('\n').map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      // a) Header group: "Questions 1-5"
      if (GROUP_HEADER.test(line) && !Q_NUM.test(line)) {
        newGroup(line);
        continue;
      }

      // a2) Form line: "17. Họ tên: .........." / "Địa chỉ: _____"
      //     (bắt buộc có chỗ trống sau dấu hai chấm → ít false positive)
      const fm = line.match(FORM_LINE);
      if (fm && !/^(questions?|choose|complete|write|you (?:may|can)|note|part|section)/i.test(fm[2])) {
        const g = ensureGroup();
        const q = newQuestion(fm[1] ?? null, fm[2].trim());
        q.type = 'form';
        q.placeholder = gapPlaceholder(g.instruction);
        continue;
      }

      // b) Số câu hỏi
      const qm = line.match(Q_NUM) || line.match(Q_NUM_LOOSE);
      const qNum = qm ? Number(qm[1]) : NaN;
      if (qm && !Number.isNaN(qNum) && qNum <= 100) {
        const g = ensureGroup();
        if (!numberInRange(qNum, g.range) && g.questions.length > 0) {
          // số vượt ngoài range của header → vẫn chấp nhận (đổi range)
          g.range = undefined;
        }
        newQuestion(qm[1], qm[2]);
        continue;
      }

      // c) Options
      const ol = isLetterOption(line);
      const or = ol ? null : isRomanOption(line);

      if (ol || or) {
        const item: OptionItem = ol
          ? { letter: ol[1].toUpperCase(), text: ol[2].trim() }
          : { letter: or![1], text: or![2].trim() };

        if (state.curQ) {
          // options gắn vào câu hỏi hiện tại (A. → B. → C. → D.)
          state.curQ.options = [...(state.curQ.options ?? []), item];
        } else {
          // options xuất hiện trước câu hỏi → bộ options dùng chung
          // (vd: List of Headings i. ii. iii., hay hộp đáp án A-E)
          const g = ensureGroup();
          g.sharedOptions = [...(g.sharedOptions ?? []), item];
        }
        state.collectingInstr = false;
        continue;
      }

      // d) Options gộp trong một dòng: "A. x  B. y  C. z"
      if (state.curQ && !state.curQ.options && !Q_NUM.test(line)) {
        const inlineL = splitInlineLetterOptions(line);
        if (inlineL) {
          state.curQ.options = inlineL;
          continue;
        }
      }
      if (!state.curQ && state.group && !state.group.sharedOptions) {
        const inlineR = splitInlineRomanOptions(line);
        if (inlineR) {
          state.group.sharedOptions = inlineR;
          continue;
        }
      }

      // e) Word bank gộp một dòng
      if (state.group && !state.group.table) {
        const words = splitWordList(line);
        const hint = /box|bank|list of words|word list|you may use|you can use|choose.*from|từ vựng/i.test(
          (state.group.instruction + ' ' + line).slice(0, 400),
        );
        if (words && (hint || words.length >= 6)) {
          state.group.wordBank = [...(state.group.wordBank ?? []), ...words];
          continue;
        }
      }

      // f) Instruction
      if (INSTR_RE.test(line) && (!state.curQ || state.collectingInstr)) {
        const g = ensureGroup();
        g.instruction = g.instruction
          ? `${g.instruction} ${line}`.trim()
          : line;
        state.collectingInstr = false;
        continue;
      }

      // g) Text tiếp nối
      if (state.curQ) {
        state.curQ.text = `${state.curQ.text} ${line}`.trim();
      } else if (state.group) {
        state.group.instruction = state.group.instruction
          ? `${state.group.instruction} ${line}`.trim()
          : line;
      }
    }
  }

  /* ---------- 3. Suy ra type ---------- */
  const seenNumbers = new Set<number>();
  for (const g of groups) {
    g.instruction = g.instruction.trim();
    g.type = inferGroupType(g);

    // Word bank trong instruction nhưng chưa tách được → bỏ qua ghi chú thừa
    if (g.type === 'matching' && !g.sharedOptions?.length) {
      const withOpts = g.questions.find((q) => q.options?.length);
      if (withOpts) g.type = 'mcq';
    }
    if (g.type === 'matching' && g.sharedOptions?.length) {
      g.sharedOptions = g.sharedOptions.map((o, i) => ({
        ...o,
        letter: g.sharedOptions!.length > 9 ? `${i + 1}` : o.letter,
      }));
    }

    for (const q of g.questions) {
      if (q.type === 'form') {
        // câu điền thông tin đã được nhận dạng từ trước — giữ nguyên
        q.placeholder = gapPlaceholder(g.instruction);
      } else {
        switch (g.type) {
          case 'boolean':
            q.type = 'boolean';
            q.options = booleanOptions(g.instruction);
            break;
          case 'matching':
            q.type = 'matching';
            q.options = q.options?.length ? q.options : g.sharedOptions;
            break;
          case 'mcq':
            q.type = 'mcq';
            q.options = q.options?.length ? q.options : g.sharedOptions;
            break;
          case 'word-bank':
            q.type = 'word-bank';
            q.placeholder = gapPlaceholder(g.instruction);
            break;
          case 'write':
            q.type = 'write';
            break;
          default:
            q.type = q.options?.length ? 'mcq' : 'gap';
            q.placeholder = gapPlaceholder(g.instruction);
        }
      }

      if (q.number !== null) {
        if (seenNumbers.has(q.number)) {
          warnings.push(`Số câu ${q.number} bị lặp lại trong file.`);
        }
        seenNumbers.add(q.number);
      }
      if (!q.text) q.text = q.context ? `Điền vào ô (${q.context})` : '(trống)';
    }
  }

  const totalQ = groups.reduce((s, g) => s + g.questions.length, 0);
  if (totalQ === 0) {
    warnings.push('Không phát hiện câu hỏi nào trong file.');
  }

  /* ---------- 4. Tìm link audio (bài Listening) ---------- */
  const audioUrl = findAudioUrl(html, blocks);

  return { title, fileName: file.name, passage, groups, warnings, audioUrl };
}

/** Nhận diện URL audio trong hyperlink hoặc text thuần:
 *  - <a href="...mp3">, ...m4a, .wav, .ogg, .aac, .flac
 *  - URL dạng https://.../audio.mp3?token=...
 */
function findAudioUrl(html: string, blocks: Block[]): string | undefined {
  const AUDIO_EXT = 'mp3|m4a|mp4|wav|ogg|aac|flac|wma';
  const URL_RE = new RegExp(
    String.raw`https?://[^\s<>"']+\.(?:${AUDIO_EXT})(?:\?[^\s<>"']*)?`,
    'i',
  );

  // 1) href của hyperlink (mammoth giữ <a href>)
  const hrefMatch = html.match(
    new RegExp(String.raw`href="([^"]+\.(?:${AUDIO_EXT})(?:\?[^"]*)?)"`, 'i'),
  );
  if (hrefMatch) return normalizeAudioUrl(hrefMatch[1]);

  // 2) URL text trong đoạn văn (ưu tiên khu vực instructions/passage)
  for (const b of blocks) {
    if (b.kind !== 'p') continue;
    const m = b.text.match(URL_RE);
    if (m) return normalizeAudioUrl(m[0]);
  }
  return undefined;
}

function normalizeAudioUrl(url: string): string {
  return url.replace(/^http:\/\//i, 'https://').replace(/[),.;]+$/, '');
}

/* ------------------------------------------------------------------ */
/*  Loại bỏ HTML không an toàn khi hiển thị nội dung                   */
/* ------------------------------------------------------------------ */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
