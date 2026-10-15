// Bảng ký hiệu dùng chung cho parser (.docx → câu hỏi) và UI hiển thị.
// Thêm ký hiệu mới ở đây (1 chỗ) thay vì sửa rải rác nhiều regex.

/** Chỗ trống inline: ___ ... [...] (...) □□ ??? *** ### ××× (không cờ g) */
export const BLANK_RE =
  /_{2,}|…{2,}|\.{3,}|\(\s*\)|\(\s*[.…_·\-–—\s]{2,}\s*\)|\[\s*[.…_·\-–—\s]*\]|[□◻○◯]+|[×✕✖?#*]{2,}|\*{2,}/;

/** Cùng tập trên, dạng string để UI dựng RegExp split (có/không cờ g) */
export const BLANK_SRC =
  '_{2,}|…{2,}|\\.{3,}|\\(\\s*\\)|\\(\\s*[.…_·\\-–—\\s]{2,}\\s*\\)|\\[\\s*[.…_·\\-–—\\s]*\\]|[□◻○◯]+|[×✕✖?#*]{2,}|\\*{2,}';

/** Regex split chỗ trống để render nét đứt (RegExp mới mỗi lần gọi) */
export function blankSplitRe(): RegExp {
  return new RegExp(`(${BLANK_SRC})`, 'g');
}

/** Chuẩn hoá dòng text: full-width, ký hiệu khoanh tròn, dấu câu CJK...
 *  File Word copy từ web/PDF hay dính các ký tự này → regex không khớp. */
export function normalizeLine(s: string): string {
  return (
    s
      // số full-width ０-９ → 0-9
      .replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10))
      // chữ full-width Ａ-Ｚａ-ｚ → ASCII
      .replace(/[Ａ-Ｚ]/g, (d) =>
        String.fromCharCode(d.charCodeAt(0) - 0xff21 + 65),
      )
      .replace(/[ａ-ｚ]/g, (d) =>
        String.fromCharCode(d.charCodeAt(0) - 0xff41 + 97),
      )
      // số khoanh tròn ①-⑳ → 1-20 (dạng trần, Q_NUM_LOOSE bắt "1 Text")
      .replace(/[①-⑳]/g, (d) => String(d.charCodeAt(0) - 0x245f))
      // chữ khoanh tròn Ⓐ-Ⓙ → "A." (kèm dấu chấm để OPT_LETTER khớp)
      .replace(/[Ⓐ-Ⓙ]/g, (d) =>
        String.fromCharCode(d.charCodeAt(0) - 0x24b6 + 65) + '.',
      )
      .replace(/[ⓐ-ⓙ]/g, (d) =>
        String.fromCharCode(d.charCodeAt(0) - 0x249c + 97) + '.',
      )
      // gộp ".." sau chữ/số + space ("A.. text", "1.. text") → 1 chấm
      // (không chạm "..." vì sau chữ cái/số + space mới gộp)
      .replace(/([A-Za-z0-9])\.\.(?=\s)/g, '$1.')
      // dấu câu full-width/CJK → ASCII
      .replace(/．/g, '.')
      .replace(/[，、]/g, ',')
      .replace(/；/g, ';')
      .replace(/：/g, ':')
      .replace(/[（）]/g, (c) => (c === '（' ? '(' : ')'))
      .replace(/[［］【】]/g, (c) => ('［【'.includes(c) ? '[' : ']'))
      // gạch dưới sóng ﹏﹍ và full-width ＿ → _, ba chấm ⋯/··· → ...
      .replace(/[﹏﹍＿]/g, '_')
      .replace(/[⋯]/g, '...')
      .replace(/·{3,}/g, '...')
      .replace(/～/g, '~')
      // quotes cong, NBSP / space ideographic
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[ 　]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}
