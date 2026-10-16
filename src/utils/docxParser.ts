import mammoth from 'mammoth';
import type {
  Exercise,
  OptionItem,
  PassageSection,
  Question,
  QuestionGroup,
  QuestionType,
  TableCell,
} from '../types';
import { BLANK_RE, normalizeLine } from './symbols';

/* ------------------------------------------------------------------ */
/*  Block model: docx → danh sách đoạn văn / bảng                      */
/* ------------------------------------------------------------------ */

type Block =
  // p: đoạn văn — giữ thêm heading (H1..H6) và list (ol/ul của Word numbering)
  // để parser dùng làm tín hiệu cấu trúc
  | { kind: 'p'; text: string; heading?: number; list?: 'ol' | 'ul' }
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

  const pushText = (
    text: string,
    extra?: { heading?: number; list?: 'ol' | 'ul' },
  ) => {
    const t = text.trim();
    if (t) blocks.push({ kind: 'p', text: t, ...extra });
  };

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

    // Word đánh số/bullet tự động → mammoth render <ol>/<ul>.
    // Tách từng <li> thành block riêng (textContent gộp sẽ dính chữ),
    // đồng thời giữ tag list để bước sau suy ra câu hỏi/word bank.
    // Lưu ý: số thứ tự gốc của Word bị mammoth bỏ → parser tự gán lại
    // theo range của group (xem bước "Gán số cho câu chưa có số").
    if (el.tagName === 'OL' || el.tagName === 'UL') {
      const items = el.querySelectorAll(':scope > li');
      const lis = items.length ? items : el.querySelectorAll('li');
      if (lis.length) {
        lis.forEach((li) =>
          pushText(elText(li), {
            list: el.tagName === 'OL' ? 'ol' : 'ul',
          }),
        );
        return;
      }
    }

    // Giữ cấp heading (H1..H6): header "Questions 1-5" để Heading 2
    // đáng tin hơn đoạn thường → ưu tiên khi tách group.
    const hm = el.tagName.match(/^H([1-6])$/);
    pushText(elText(el), hm ? { heading: Number(hm[1]) } : undefined);
  });

  return blocks;
}

/* ------------------------------------------------------------------ */
/*  Regex nhận diện                                                    */
/* ------------------------------------------------------------------ */

/** Từ khóa mở đầu group: Questions, Câu hỏi, Part, Section, Exercise, Task, Bài...
 *  (xem thêm ký hiệu trong ./symbols) */
const GROUP_KEY =
  'questions?|câu\\s*(?:hỏi|h)\\s*|part|section|exercise|task|bài(?:\\s*tập)?';

/** "Questions 1-5", "Questions 1 – 5", "Câu 1-5", "Bài 1~3", "Questions 7" */
const GROUP_HEADER = new RegExp(
  `^(?:${GROUP_KEY})\\s*[-–—:~]?\\s*(\\d{1,3})(?:\\s*(?:[-–—~]|to)\\s*(\\d{1,3}))?`,
  'i',
);

/** Bản không neo ^ để tìm header nằm giữa dòng ("Part 1: Questions 1-5") */
const GROUP_HEADER_ANY = new RegExp(
  `(?:${GROUP_KEY})\\s*[-–—:~]?\\s*(\\d{1,3})(?:\\s*(?:[-–—~]|to)\\s*(\\d{1,3}))?`,
  'gi',
);

/** Kết quả phân tích một dòng header: range + phần instruction dính sau */
interface ParsedHeader {
  /** Chuỗi header gọn ("Questions 1–4"), không gồm instruction dính sau */
  header: string;
  range?: string;
  rest: string;
  index: number;
}

/**
 * "Questions 1–4 Choose the correct letter..." → { range: "1-4", rest: "Choose..." }
 * "Part 1: Questions 1-5" → lấy range 1-5 (match có đủ 2 số), bỏ số của "Part 1".
 * Trả null nếu match nằm giữa câu (vd "For questions 1-3, refer to...").
 */
function parseGroupHeader(line: string): ParsedHeader | null {
  GROUP_HEADER_ANY.lastIndex = 0;
  const matches = [...line.matchAll(GROUP_HEADER_ANY)];
  if (!matches.length) return null;
  const withRange = matches.find((m) => m[2]);
  const m = withRange ?? matches[matches.length - 1];
  const index = m.index ?? 0;
  // match phải ở đầu dòng hoặc sau dấu ":—–-(" (tiêu đề phụ kiểu "Part 1: Questions 1-5")
  const prefix = line.slice(0, index);
  const prefixOk =
    !prefix.trim() ||
    /[:：–—() -]\s*$/.test(prefix) ||
    /^(?:part|section|exercise|task|bài)\s*\d+\s*[:：–—-]?\s*$/i.test(prefix);
  if (!prefixOk || index > 24) return null;
  const header = m[0].trim();
  const range = m[2] ? `${m[1]}-${m[2]}` : `${m[1]}`;
  const rest = line
    .slice(index + m[0].length)
    .trim()
    .replace(/^[-–—:.,;\s]+/, '');
  return { header, range, rest, index };
}

/** Header phần bài đọc: "READING PASSAGE 1", "Passage 2: Title", "Bài đọc 1", "Đoạn văn 2".
 *  Cố tình KHÔNG nhận "Section/Part" (đó là section nghe/làm bài, giữ hành vi cũ)
 *  và "Bài 1" trần (đó là header group câu hỏi). Không số → phải đúng nguyên
 *  chữ "Passage"/"Bài đọc" (tránh nuốt câu văn mở đầu bằng "Passage..."). */
function parsePassageHeader(line: string): { title: string; label: string } | null {
  const t = line.trim();
  if (!t || t.length > 90) return null;
  const en = t.match(
    /^(?:reading\s+)?passages?\s*(\d{1,2})?\s*[:–—-]?\s*(.{0,60})$/i,
  );
  const viM = en
    ? null
    : t.match(
        /^(bài\s*đọc|đoạn\s*văn)\s*(?:số\s*)?(\d{1,2})?\s*[:–—-]?\s*(.{0,60})$/i,
      );
  const m = en ?? viM;
  if (!m) return null;
  const numStr = en ? m[1] : m[2];
  const rest = ((en ? m[2] : m[3]) ?? '').trim().replace(/^[-–—:.,;\s]+/, '');
  const num = numStr ? Number(numStr) : null;
  if (num === null && rest) return null;
  const base =
    num !== null ? (viM ? `Bài đọc ${num}` : `Passage ${num}`) : viM ? 'Bài đọc' : 'Passage';
  return {
    title: rest ? `${base}: ${rest}` : t.length <= 60 ? t : base,
    label: base,
  };
}

/** "1. text", "1) text", "(1) text", "1 text" */
const Q_NUM = /^[([]?(\d{1,3})[)\].、:]\s*(.+)$/;
const Q_NUM_LOOSE = /^(\d{1,3})\s{1,2}([A-Za-z(\[].+)$/;

/** Số câu có tiền tố: "Q1.", "Q. 5", "No. 12:", "Question 3", "Câu 1:", "Item 7" */
const Q_NUM_PREFIX =
  /^(?:Q(?:uestion)?|No|Nº|Câu(?:\s*hỏi)?|Item)\s*\.?\s*(\d{1,3})\s*[)\].、:~\-–—]?\s*(.+)$/i;

/** Form line: "1. Họ tên: ..........", "Địa chỉ: _____", "Ngày sinh: (....)"
 *  — số tùy chọn, label + dấu hai chấm + BẮT BUỘC chỗ trống phía sau
 *  (tập ký hiệu chỗ trống xem BLANK_RE trong ./symbols) */
const FORM_LINE =
  /^(?:[([]?(\d{1,3})[)\].、]\s+)?([^:：\n]{2,60}?)\s*[:：]\s*(?:_{2,}|\.{3,}|…{2,}|\(\s*\)|\(\s*[.…_·\-–—\s]{2,}\s*\)|\[[.…_·\-–—\s]*\]|[□◻○◯]+|[×✕✖?#*]{2,})\s*$/;

/** "A. text", "B) text" — tới J để phủ matching A–G/H */
const OPT_LETTER = /^[([]?([A-Ja-j])[)\].、:]\s+(.+)$/;

/** "i. text", "iv) text" */
const OPT_ROMAN =
  /^[([]?((?:xi{0,3}|ix|iv|vi{0,3}|i{1,3}|x))\s*[).、:]\s+(.+)$/i;

/** Dòng legend đứng riêng: "TRUE", "FALSE", "NOT GIVEN", "YES", "NO",
 *  "T/F", "ĐÚNG", "SAI" (gộp vào instruction, tránh dính vào text câu hỏi) */
const LEGEND_LINE =
  /^(TRUE|FALSE|NOT GIVEN|YES|NO|T\/F|ĐÚNG|SAI)(\s*[-–—:.].*)?$/i;

/** Dòng ứng viên word bank xếp chồng (mỗi dòng 1–3 từ, vd bullet list) */
const BANK_LINE = /^[A-Za-zÀ-ỹ'’\-()./ ]{2,28}$/;

const INSTR_RE =
  /(choose the correct letter|correct letter,?\s*[A-D]|match the|matching|list of headings|true\s*\/?\s*false|yes\s*\/?\s*no|not given|complete the|fill in|write the correct|no more than|you may use|you can use|more than once|one word|two words|three words|does the writer|which paragraph|find (?:the )?information|which section|answer (?:the )?(?:following )?questions|label the|choose (?:one|two|three)|circle the|hoàn thành|hợp lý nhất|điền từ|chọn đáp án|ghi nhãn|khoanh tròn)/i;

/** Ô trong bảng là ô điền đáp án: "1. .....", "(2) ......", "3" (khi instruction bảo complete table) */
const CELL_BLANK =
  /^[([]?(\d{1,3})[)\].、]?\s*(?:[._…□◻○◯×?#*\-–—]{2,})?\s*$/;

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
  const re = /(?:^|\s)[([]?([A-Ja-j])[)\].、:]\s+/g;
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

/** "achieve, across, attention ..." → danh sách từ.
 *  Chấp nhận nhiều kiểu phân cách trong file Word: phẩy, chấm phẩy,
 *  gạch đứng, bullet (•·●▪), tab, nhiều khoảng trắng. */
function splitWordList(text: string): string[] | null {
  const parts = text
    .split(/[,;/|•·●▪◆]+|\s{2,}|\t+/)
    .map((s) =>
      s
        // bỏ bullet / đánh số đầu dòng ("• word", "1) word")
        .replace(/^([([]?\d{1,2}[)\].]|[•·●▪◆\-–—])\s*/, '')
        .trim(),
    )
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
/*  Tag ép kiểu trong file: [TFNG] [FILL] [MCQ] [MATCH] [BANK] [FORM] [WRITE] */
/* ------------------------------------------------------------------ */

/** Ngoặc có khả năng là tag (chỉ chữ, ≤15 ký tự — "[Box A]" cũng lọt vào
 *  đây nhưng tagToType trả null nên được giữ nguyên) */
const TYPE_TAG_RE = /\[\s*([A-Za-zÀ-ỹ][A-Za-zÀ-ỹ/\- ]{0,14})\s*\]/g;

function tagToType(token: string): QuestionType | null {
  const t = token.toUpperCase().replace(/[/\-\s]/g, '');
  if (['TFNG', 'TFN', 'TRUEFALSE', 'TRUEFALSENOTGIVEN'].includes(t))
    return 'boolean';
  if (['YNNG', 'YNN', 'YESNO', 'YESNONOTGIVEN'].includes(t)) return 'boolean';
  if (
    ['MCQ', 'ABCD', 'ABC', 'CHOICE', 'MULTIPLECHOICE', 'TRACNGHIEM', 'TRẮCNGHIỆM'].includes(t)
  )
    return 'mcq';
  if (['MATCH', 'MATCHING', 'NOI', 'NỐI'].includes(t)) return 'matching';
  if (['FILL', 'GAP', 'BLANK', 'DIEN', 'ĐIỀN', 'DIENTU', 'ĐIỀNTỪ'].includes(t))
    return 'gap';
  if (
    ['BANK', 'WORDBANK', 'BOX', 'HOP', 'HỘP', 'HOPTU', 'HỘPTỪ', 'TUVUNG', 'TỪVỰNG'].includes(t)
  )
    return 'word-bank';
  if (
    ['FORM', 'INFO', 'THONGTIN', 'THÔNGTIN', 'CUSTOMER', 'KHACHHANG', 'KHÁCHHÀNG'].includes(t)
  )
    return 'form';
  if (['WRITE', 'WRITING', 'ESSAY', 'TULUAN', 'TỰLUẬN'].includes(t))
    return 'write';
  return null;
}

function isYesNoTag(token: string): boolean {
  const t = token.toUpperCase().replace(/[/\-\s]/g, '');
  return ['YNNG', 'YNN', 'YESNO', 'YESNONOTGIVEN'].includes(t);
}

interface FoundTag {
  type: QuestionType;
  yesNo: boolean;
}

/** Tách tag ép kiểu khỏi dòng. Ngoặc lạ ([Box A], [see Fig. 2]...) giữ nguyên. */
function extractTypeTag(line: string): { tag: FoundTag; clean: string } | null {
  let found: FoundTag | null = null;
  const clean = line.replace(TYPE_TAG_RE, (full, token: string) => {
    const type = tagToType(token);
    if (!type) return full;
    if (!found) found = { type, yesNo: isYesNoTag(token) };
    return '';
  });
  if (!found) return null;
  return { tag: found, clean: normalizeLine(clean) };
}

/** Ghim type cho group. Tag [YNNG] cần bộ options YES → bổ sung vào
 *  instruction nếu chưa có (booleanOptions quyết định theo instruction). */
function applyTag(g: QuestionGroup, t: FoundTag): void {
  g.type = t.type;
  g.typeLocked = true;
  if (t.yesNo) {
    if (!/\byes\b/i.test(g.instruction)) {
      g.instruction = g.instruction
        ? `${g.instruction} (YES / NO / NOT GIVEN)`
        : 'YES / NO / NOT GIVEN';
    }
  } else if (t.type === 'boolean' && !/\btrue\b/i.test(g.instruction)) {
    g.instruction = g.instruction
      ? `${g.instruction} (TRUE / FALSE / NOT GIVEN)`
      : 'TRUE / FALSE / NOT GIVEN';
  }
}

/* ------------------------------------------------------------------ */
/*  Suy ra type cho group                                              */
/* ------------------------------------------------------------------ */

function inferGroupType(g: QuestionGroup): QuestionType {
  // Tag [TFNG]/[FILL]/... trong file ép kiểu → ưu tiên tuyệt đối, khỏi đoán
  if (g.typeLocked) return g.type;
  const instr = g.instruction.toLowerCase();

  if (g.questions.some((q) => q.type === 'form')) return 'form';
  if (g.table) return 'gap';
  if (/list of headings|match the headings|tiêu đề phù hợp/.test(instr))
    return 'matching';
  // TF/NG: instruction chứa cả TRUE và FALSE (hoặc YES và NO) + NOT GIVEN
  if (
    /not given/.test(instr) &&
    (/\btrue\b/.test(instr) || /\byes\b/.test(instr) || /\bt\/f\b/.test(instr))
  )
    return 'boolean';
  if (
    /true\s*\/?\s*false|yes\s*\/?\s*no|t\s*\/\s*f|đúng[\s/]*sai/i.test(instr)
  )
    return 'boolean';
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
  // Tự luận: không options / chỗ trống / bank / bảng, instruction yêu cầu
  // trả lời tự do ("short answer", "in your own words", "tự luận"...)
  if (
    !g.questions.some((q) => BLANK_RE.test(q.text)) &&
    /(short[\s-]?answer|in your own words|tự luận|answer the following questions|trả lời các câu hỏi sau)/i.test(
      instr,
    )
  )
    return 'write';
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
  const sections: PassageSection[] = [];
  let pendingInstr = '';

  const newSection = (title: string, label: string): PassageSection => {
    const s: PassageSection = {
      id: `p${sections.length}`,
      title,
      label,
      paragraphs: [],
    };
    sections.push(s);
    return s;
  };

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
      // Tách phần mở đầu thành các passage: nội dung trước header Passage
      // đầu tiên gộp chung vào section đó (giữ hành vi cũ với file 1 passage).
      let cur = newSection('Bài đọc', 'Bài đọc');
      let seenHeader = false;
      for (const p of pre) {
        const text = p.text.trim();
        if (!text) continue;
        const ph = parsePassageHeader(text);
        if (ph) {
          if (!seenHeader) {
            cur.title = ph.title;
            cur.label = ph.label;
          } else {
            cur = newSection(ph.title, ph.label);
          }
          seenHeader = true;
        } else {
          cur.paragraphs.push(text);
        }
      }
    }
  } else {
    warnings.push(
      'Không tìm thấy khu vực câu hỏi — chỉ đọc được phần nội dung (passage).',
    );
    let cur = newSection('Bài đọc', 'Bài đọc');
    let seenHeader = false;
    blocks.forEach((b) => {
      if (b.kind !== 'p') return;
      const text = b.text.trim();
      if (!text) return;
      const ph = parsePassageHeader(text);
      if (ph) {
        if (!seenHeader && cur.paragraphs.length === 0) {
          cur.title = ph.title;
          cur.label = ph.label;
        } else {
          cur = newSection(ph.title, ph.label);
        }
        seenHeader = true;
      } else {
        cur.paragraphs.push(text);
      }
    });
  }
  if (!sections.length) newSection('Bài đọc', 'Bài đọc');

  /* ---------- 2. Walk các block khu vực câu hỏi ---------- */
  const groups: QuestionGroup[] = [];
  // Dùng object holder để TypeScript không narrow thành never
  // (các biến này được gán bên trong closure)
  const state = {
    group: null as QuestionGroup | null,
    curQ: null as Question | null,
    collectingInstr: false,
    // Dòng word bank xếp chồng đang gom dở (mỗi dòng 1 từ, bullet list...)
    bankLines: [] as string[],
    // Tag ép kiểu đứng riêng trước header ("[MCQ]" rồi mới "Questions 1-5")
    pendingTag: null as FoundTag | null,
    // Section passage hiện tại + có đang gom đoạn văn của nó không
    currentPassageId: sections[sections.length - 1].id,
    collectingPassage: false,
  };
  let qi = 0;

  const currentSection = (): PassageSection =>
    sections.find((s) => s.id === state.currentPassageId) ??
    sections[sections.length - 1];

  /** Header passage giữa khu vực câu hỏi: section rỗng thì đặt tên lại,
   *  section đã có nội dung/câu hỏi thì mở section mới. */
  const enterPassageSection = (title: string, label: string): void => {
    const cur = currentSection();
    const used = groups.some((g) => g.passageId === cur.id);
    if (cur.paragraphs.length === 0 && !used) {
      cur.title = title;
      cur.label = label;
    } else {
      const sec = newSection(title, label);
      state.currentPassageId = sec.id;
    }
    state.collectingPassage = true;
    state.curQ = null;
    state.bankLines = [];
  };

  /** Dòng có phải nội dung câu hỏi (để thoát passage mode) */
  const isQuestionLike = (line: string): boolean => {
    if (
      Q_NUM.test(line) ||
      Q_NUM_PREFIX.test(line) ||
      line.match(Q_NUM_LOOSE) ||
      parseGroupHeader(line) !== null ||
      isLetterOption(line) ||
      isRomanOption(line) ||
      splitInlineLetterOptions(line) ||
      splitInlineRomanOptions(line) ||
      BLANK_RE.test(line)
    )
      return true;
    const fm = line.match(FORM_LINE);
    if (
      fm &&
      !/^(questions?|exercise|task|bài|choose|complete|write|you (?:may|can)|note|part|section)/i.test(
        fm[2],
      )
    )
      return true;
    return false;
  };

  const newGroup = (headerText: string, range?: string): QuestionGroup => {
    const g: QuestionGroup = {
      id: `g${groups.length}`,
      title: headerText.trim(),
      range,
      instruction: pendingInstr,
      type: 'gap',
      passageId: state.currentPassageId,
      questions: [],
    };
    pendingInstr = '';
    groups.push(g);
    state.group = g;
    state.curQ = null;
    state.bankLines = [];
    state.collectingInstr = true;
    // tag đứng riêng trước header → group mới này hưởng
    if (state.pendingTag) {
      applyTag(g, state.pendingTag);
      state.pendingTag = null;
    }
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

  /** Chốt các dòng bank đang gom dở: đủ từ → wordBank, không thì trả về instruction. */
  const flushBank = (): void => {
    const lines = state.bankLines;
    if (!lines.length) return;
    state.bankLines = [];
    const g = state.group;
    if (!g || g.table) return;
    const joined = lines.join(', ');
    const words = splitWordList(joined);
    const hint = /box|bank|list of words|word list|you may use|you can use|choose.*from|từ vựng|hộp từ/i.test(
      g.instruction,
    );
    // group bị tag [BANK] ghim: bank parse được (≥5 từ) là nhận, khỏi cần hint/đủ dòng
    if (
      words &&
      (hint || lines.length >= 4 || (g.typeLocked && g.type === 'word-bank'))
    ) {
      g.wordBank = [...(g.wordBank ?? []), ...words];
    } else {
      g.instruction = g.instruction ? `${g.instruction} ${joined}`.trim() : joined;
    }
  };

  /** Dòng có phải 1 mục word bank xếp chồng (mỗi dòng 1–3 từ)? */
  const isStackedBankCandidate = (line: string): boolean => {
    if (state.curQ || !state.group || state.group.table) return false;
    if (!BANK_LINE.test(line)) return false;
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 3) return false;
    if (
      INSTR_RE.test(line) ||
      LEGEND_LINE.test(line) ||
      Q_NUM.test(line) ||
      FORM_LINE.test(line)
    )
      return false;
    return true;
  };

  for (let i = start < 0 ? blocks.length : start; i < blocks.length; i++) {
    const b = blocks[i];

    /* ----- Bảng ----- */
    if (b.kind === 'table') {
      // bảng luôn thuộc khu vực câu hỏi → thoát passage mode
      state.collectingPassage = false;
      flushBank();
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
          const trimmed = normalizeLine(cellText);
          const m = trimmed.match(CELL_BLANK);
          if (!m || c === 0) return { text: cellText };

          const hasBlankMark = BLANK_RE.test(trimmed);
          // "1. ..........", "2 ..........", "3. □□□", "4. ???"
          const hasDotBlank =
            /^[([]?\d{1,3}[)\].、]?\s*[._…□◻○◯×?#*\-–—]{2,}\s*$/.test(trimmed);
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

      // Bảng kiểu "số câu" và "ô trống" nằm ở 2 ô khác nhau trong cùng hàng:
      // | Copenhagen | 6 | .......... |   hoặc   | 11 |  | (ô để trống)
      if (
        /complete|fill|no more than|one word|two words|table|notes|form|summary|flow|plan|diagram|điền|hoàn thành/i.test(
          g.instruction,
        )
      ) {
        const assigns = new Map<string, Question>();
        b.rows.forEach((row, r) => {
          const norm = row.map((c) => normalizeLine(c));
          const numIdx = norm.findIndex((c) =>
            /^[([]?\d{1,3}[)\].、]?\s*$/.test(c),
          );
          if (numIdx < 0) return;
          const num = Number(norm[numIdx].match(/(\d{1,3})/)![1]);
          // số ngoài range đã biết → bỏ qua hàng (tránh bắt nhầm số liệu);
          // chưa có range thì chấp nhận số ≤ 60
          if (g.range ? !numberInRange(num, g.range) : num > 60) return;
          const blankIdx = norm.findIndex(
            (c, ci) =>
              ci !== numIdx &&
              (c === '' ||
                BLANK_RE.test(c) ||
                /^[._…□◻○◯×?#*\-–—\s]{2,}$/.test(c)),
          );
          if (blankIdx < 0) return;
          const context = row
            .filter((_, ci) => ci !== numIdx && ci !== blankIdx)
            .join(' · ')
            .trim()
            .slice(0, 90);
          const q: Question = {
            id: `g${groups.length - 1}q${qi++}`,
            number: num,
            text: norm[blankIdx] || `Ô ${num}`,
            type: 'gap',
            context: context ? `hàng "${context}"` : undefined,
          };
          g.questions.push(q);
          assigns.set(`${r}:${blankIdx}`, q);
        });
        if (assigns.size) {
          g.table = b.rows.map((row, r) =>
            row.map((cellText, c) => {
              const q = assigns.get(`${r}:${c}`);
              return q ? { text: cellText, qid: q.id } : { text: cellText };
            }),
          );
          g.type = 'gap';
          state.curQ = null;
          continue;
        }
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
    const lines = b.text
      .split('\n')
      .map((l) => normalizeLine(l))
      .filter(Boolean);

    for (let li = 0; li < lines.length; li++) {
      let line = lines[li];

      // p) Header passage giữa khu vực câu hỏi: "READING PASSAGE 2", "Bài đọc 1"
      const ph = parsePassageHeader(line);
      if (ph) {
        flushBank();
        enterPassageSection(ph.title, ph.label);
        continue;
      }

      // p2) Đang gom đoạn văn của passage: dòng thường → thêm vào section;
      //     dòng giống câu hỏi → thoát mode, xử lý tiếp như bình thường.
      //     Instruction dính trước header group kế → giữ làm pendingInstr.
      if (state.collectingPassage) {
        if (INSTR_RE.test(line)) {
          pendingInstr = pendingInstr ? `${pendingInstr} ${line}` : line;
          continue;
        }
        if (!isQuestionLike(line)) {
          currentSection().paragraphs.push(line);
          continue;
        }
        state.collectingPassage = false;
      }

      // a-1) Tag ép kiểu: [TFNG] [FILL] [MCQ] [MATCH] [BANK] [FORM] [WRITE]
      //      → ghim type group, tag bị xoá khỏi text hiển thị
      let inlineTag: FoundTag | null = null;
      const found = extractTypeTag(line);
      if (found) {
        if (!found.clean) {
          // dòng chỉ có tag: ghim vào group hiện tại nếu còn trống,
          // nếu không để dành cho group kế tiếp
          if (state.group && state.group.questions.length === 0) {
            applyTag(state.group, found.tag);
          } else {
            state.pendingTag = found.tag;
          }
          continue;
        }
        line = found.clean;
        inlineTag = found.tag;
      }

      // a) Header group: "Questions 1-5" (kể cả dính instruction sau:
      //    "Questions 1–4 Choose the correct letter..." → tách rest ra xử lý tiếp)
      if (!Q_NUM.test(line) && !Q_NUM_PREFIX.test(line)) {
        const gh = parseGroupHeader(line);
        if (gh) {
          flushBank();
          const g = newGroup(gh.header, gh.range);
          // tag cùng dòng header cụ thể hơn tag để dành → thắng
          if (inlineTag) applyTag(g, inlineTag);
          if (gh.rest.length >= 8) lines.splice(li + 1, 0, gh.rest);
          continue;
        }
      }
      // tag đi kèm dòng thường (không phải header) → ghim group hiện tại
      if (inlineTag) applyTag(ensureGroup(), inlineTag);

      // a-3) Group bị tag [FORM] ghim: dòng "Label: ..." (kể cả không có
      //      chỗ trống hay kèm giá trị ví dụ) cũng là một ô điền thông tin
      if (state.group?.typeLocked && state.group.type === 'form') {
        const fl = line.match(
          /^(?:[([]?(\d{1,3})[)\].、]\s+)?([^:：\n]{2,40}?)\s*[:：]\s*(.{0,60})$/,
        );
        if (
          fl &&
          !/^(questions?|exercise|task|bài|choose|complete|write|you (?:may|can)|note|part|section)/i.test(
            fl[2],
          ) &&
          !INSTR_RE.test(line)
        ) {
          const g = ensureGroup();
          const q = newQuestion(fl[1] ?? null, fl[2].trim());
          q.type = 'form';
          const val = (fl[3] ?? '').trim();
          q.placeholder =
            val && !BLANK_RE.test(val)
              ? `vd: ${val}`
              : gapPlaceholder(g.instruction);
          continue;
        }
      }

      // a0) Số câu có tiền tố: "Q1.", "No. 5:", "Question 12", "Câu 1:", "Item 7"
      //     (xử lý TRƯỚC header để "Câu 1: ..." không bị lập group mới)
      const qp = line.match(Q_NUM_PREFIX);
      if (qp && Number(qp[1]) <= 100) {
        const g = ensureGroup();
        if (!numberInRange(Number(qp[1]), g.range) && g.questions.length > 0) {
          g.range = undefined;
        }
        newQuestion(qp[1], qp[2]);
        continue;
      }

      // a2) Form line: "17. Họ tên: .........." / "Địa chỉ: _____"
      //     (bắt buộc có chỗ trống sau dấu hai chấm → ít false positive)
      const fm = line.match(FORM_LINE);
      if (fm && !/^(questions?|exercise|task|bài|choose|complete|write|you (?:may|can)|note|part|section)/i.test(fm[2])) {
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

      // d2) Legend đứng riêng: "TRUE" / "FALSE" / "NOT GIVEN" / "YES" / "NO"
      //      → gộp vào instruction (suy type boolean), không dính vào text câu hỏi
      if (LEGEND_LINE.test(line) && line.length < 100) {
        const g = ensureGroup();
        flushBank();
        g.instruction = g.instruction
          ? `${g.instruction} ${line}`.trim()
          : line;
        state.collectingInstr = false;
        continue;
      }

      // d3) Mục trong list đánh số tự động của Word (<ol>).
      //     mammoth đã bỏ số gốc → dòng không có số câu.
      if (b.kind === 'p' && b.list === 'ol') {
        // từ đơn trong list số → khả năng là word bank xếp chồng ("1. achieve 2. across")
        if (isStackedBankCandidate(line)) {
          state.bankLines.push(line);
          continue;
        }
        flushBank();
        const looksNewQuestion =
          !state.curQ ||
          /[?？]\s*$/.test(line) ||
          BLANK_RE.test(line) ||
          line.length >= 60;
        if (
          state.curQ &&
          !looksNewQuestion &&
          line.length < 100 &&
          (state.curQ.options?.length ?? 0) < 10
        ) {
          // mục ngắn sau câu hỏi chưa có options → coi là option A/B/C...
          // (Word numbering chữ (a)(b)(c) cũng bị mammoth bỏ chữ)
          const letter = String.fromCharCode(
            65 + (state.curQ.options?.length ?? 0),
          );
          state.curQ.options = [
            ...(state.curQ.options ?? []),
            { letter, text: line },
          ];
        } else {
          // câu hỏi không số → tạo câu number=null, gán số lại theo range ở bước sau
          newQuestion(null, line);
        }
        continue;
      }

      // e) Word bank: một dòng gộp ("a, b, c...") HOẶC xếp chồng
      //    (mỗi dòng 1–3 từ, hay gặp ở bullet list — gom dở rồi chốt ở flushBank)
      if (state.group && !state.group.table) {
        const words = splitWordList(line);
        if (words) {
          const hint = /box|bank|list of words|word list|you may use|you can use|choose.*from|từ vựng/i.test(
            (state.group.instruction + ' ' + line).slice(0, 400),
          );
          if (hint || words.length >= 6) {
            flushBank();
            state.group.wordBank = [...(state.group.wordBank ?? []), ...words];
            continue;
          }
        }
        if (isStackedBankCandidate(line)) {
          state.bankLines.push(line);
          continue;
        }
        flushBank();
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

  // Chốt word bank xếp chồng còn dở ở cuối file
  flushBank();

  /* ---------- 2b. Gán số cho câu chưa có số ----------
   * Word đánh số tự động bị mammoth bỏ số gốc → câu number=null.
   * Gán theo range của group ("1-4" → 1, 2, 3, 4), bỏ qua số đã dùng. */
  for (const g of groups) {
    if (!g.range) continue;
    const [a, b] = g.range.split('-').map(Number);
    if (Number.isNaN(a)) continue;
    const end = Number.isNaN(b) ? a : b;
    const used = new Set(
      g.questions.map((q) => q.number).filter((n): n is number => n !== null),
    );
    let next = a;
    for (const q of g.questions) {
      if (q.number !== null) continue;
      while (next <= end && used.has(next)) next++;
      if (next > end) break;
      q.number = next;
      used.add(next);
      next++;
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
        // (placeholder "vd: ..." từ giá trị ví dụ được giữ lại)
        q.placeholder = q.placeholder ?? gapPlaceholder(g.instruction);
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

  return { title, fileName: file.name, passages: sections, groups, warnings, audioUrl };
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
