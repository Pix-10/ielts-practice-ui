# PARSER_GUIDE — Viết file .docx sao cho parser nhận dạng chuẩn

Parser (`src/utils/docxParser.ts`) đọc `.docx` qua **mammoth** (docx → HTML),
rồi nhận dạng cấu trúc theo pipeline 5 bước:

```
docx → (mammoth) → HTML → blocks (đoạn / bảng + heading / list)
     → tách passage / khu vực câu hỏi → gom group "Questions a–b"
     → nhận diện câu hỏi / options / word bank / bảng
     → suy type (mcq / boolean / matching / gap / word-bank / form / write)
```

Mammoth **bỏ** màu chữ, cỡ chữ, numbering gốc của Word — parser chỉ còn
dựa vào: **text, Heading (H1–H6), list (đánh số/bullet tự động), bảng, link**.
Viết file đúng các quy ước dưới đây thì nhận dạng gần như 100%.

> 🔒 **Cách chắc chắn nhất: tag ép kiểu.** Gắn 1 tag vào header,
> instruction hoặc đứng riêng 1 dòng — parser ghim đúng loại, khỏi đoán:
> `Questions 1–3 [TFNG]`. Tag bị xoá khỏi text hiển thị, group hiện huy
> hiệu `🔒 tag`. Chi tiết xem **mục 8**.

## 1. Khung file chuẩn

```
Tiêu đề bài (1 dòng ngắn, ≤ 110 ký tự — hoặc style Title/Heading 1)

Passage: các đoạn văn thường...

Questions 1–4                                    ← Heading 2 (khuyến nghị)
Choose the correct letter, A, B, C or D.         ← instruction
1. ...                                           ← "số. nội dung"
A. ...
B. ...

Questions 5–7
<instruction>
5. ...
```

- Dòng group **nên để Heading 2**, dạng `Questions a–b` (chấp nhận `– — - to`,
  `Câu 1-5`, `Questions 7`, `Part 1: Questions 1-5`).
- Instruction **được dính luôn sau header cũng OK**:
  `Questions 1–4 Choose the correct letter, A, B, C or D.` (parser tự tách).
- Mọi thứ trước group đầu tiên → passage (bảng/ảnh trong passage bị bỏ qua).
- **File nhiều passage**: mỗi phần mở đầu bằng header riêng
  (`READING PASSAGE 1`, `Passage 2: ...`, `Bài đọc 1`, `Đoạn văn 2` —
  nên để Heading 1/2). Parser tách thành từng section, group nào thuộc
  passage nào tự gán theo vị trí. KHÔNG dùng `Section/Part` hay `Bài 1`
  trần làm header passage (đó là header group câu hỏi).

## 2. Từng dạng câu hỏi — mẫu GOOD / BAD

### Trắc nghiệm (mcq)
```text
GOOD ✅
Questions 1–4
Choose the correct letter, A, B, C or D.
1. What did Copenhagen invest in during the 1990s?
A. Congestion charges
B. Cycling infrastructure
```
- Mỗi option **phải có chữ cái**: `A. ...` (chấp nhận `A)`, `(A)`, `A:`; tới `J`).
- Options gộp 1 dòng cũng được: `A. x  B. y  C. z`.
- ❌ BAD: options không có chữ cái (Word numbering chữ `(a)(b)(c)` tự động
  **bị mammoth xóa** → parser đành đoán option theo độ dài, dễ sai).
  → Luôn gõ `A.` `B.` `C.` thủ công.

### TRUE/FALSE/NOT GIVEN, YES/NO/NOT GIVEN (boolean)
```text
GOOD ✅
Questions 5–7
Do the following statements agree with the information? TRUE if it agrees,
FALSE if it contradicts, NOT GIVEN if there is no information.
5. Copenhagen has the highest cycling rate in Europe.
```
- Legend `TRUE` / `FALSE` / `NOT GIVEN` đứng **riêng từng dòng cũng OK**
  (parser gộp vào instruction, không dính vào text câu hỏi).
- Từ khóa quyết định: có `NOT GIVEN` + (`TRUE` hoặc `YES`).

### Matching / List of Headings (matching)
```text
GOOD ✅
Questions 14–16
Match each statement with the correct city, A, B or C.
A. Copenhagen
B. Singapore
C. Both cities
14. Cut city-centre traffic
```
- Bộ options **đứng trước các câu hỏi** → thành `sharedOptions` dùng chung.
- List of Headings dùng số La Mã: `i. ...  ii. ...` (mỗi heading ≥ 2 ký tự).

### Điền từ (gap)
```text
GOOD ✅
8. Singapore introduced ________ charges in 1975.
```
- Chỗ trống: `___`, `...`, `[...]`, `(....)`, `…`.
- Placeholder giới hạn từ suy từ instruction (`ONE WORD ONLY` → "MỘT TỪ").

### Word bank (word-bank)
```text
GOOD ✅ (1 dòng, phân cách phẩy / chấm phẩy / | / • / tab)
Complete the sentences. Choose words from the box.
congestion, infrastructure, residents, charges, remote, patterns

GOOD ✅ (xếp chồng — bullet list, mỗi dòng 1–3 từ)
• congestion
• infrastructure
• residents
(+ ≥ 4 dòng, đứng trước câu hỏi đầu tiên của group)
```
- ❌ BAD: bank < 5 từ mà không có từ gợi ý (`box/bank/choose...from`) trong
  instruction → parser không dám kết luận (sợ nuốt nhầm instruction).

### Table completion (gap + bảng)
```text
GOOD ✅ kiểu 1 — số + chỗ trống cùng ô (ô không phải cột đầu):
| Copenhagen | Investment | 1990s | 11. .......... |

GOOD ✅ kiểu 2 — số câu và ô trống ở 2 ô khác nhau trong cùng hàng:
| Main transport | 6 | .......... |
| Study year     | 7 |            |   ← ô để trống cũng được
```
- Kiểu 2 yêu cầu instruction có từ hoàn thành
  (`complete/fill/table/notes/form/summary/.../điền/hoàn thành`).
- Số ngoài range đã biết → hàng đó bị bỏ qua (tránh bắt nhầm số liệu).

### Điền thông tin / form (form)
```text
GOOD ✅
Complete the form below. Write ONE WORD ONLY.
17. Full name: ..........
Address: ..........
Ngày sinh: (........)
```
- Bắt buộc có **dấu `:` + chỗ trống phía sau** (tránh nhầm instruction
  kiểu `Choose the correct letter:`).

### Tự luận / short answer (write)
```text
GOOD ✅
Answer the following questions. Write your answers in your own words.
8. Why did planners rethink road expansion?
```
- Cần **cả 2 điều kiện**: instruction có `short answer / in your own words /
  tự luận / answer the following questions...` **và** câu không có
  options/chỗ trống/bank/bảng. Thiếu vế nào → rớt về `gap` (vẫn điền được).

## 3. Chuẩn hoá tự động (khỏi lo)

| File có | Parser tự xử lý |
|---|---|
| Số full-width `９.` | → `9.` |
| NBSP / space lạ | → space thường |
| Ngoặc/quotes cong `（）“”‘’` | → ASCII |
| Word đánh số tự động (`<ol>`) | tách từng mục; câu mất số → **gán lại theo range** (`1-4` → 1,2,3,4) |
| Header dính instruction | tách `rest` xử lý tiếp |
| `Part 1: Questions 1-5` | lấy range `1-5`, bỏ số của `Part 1` |

## 4. Giới hạn đã biết

1. **Options dùng Word numbering chữ tự động** → mammoth xóa chữ cái →
   chỉ đoán được khi mục ngắn + đứng ngay sau câu hỏi chưa có options.
   → Khuyên gõ `A.` `B.` thủ công.
2. **Bảng/ảnh trong passage** → bỏ qua (passage chỉ giữ text).
3. **Số câu trùng nhau** giữa các passage (đánh lại từ 1) → cảnh báo
   `Số câu X bị lặp lại trong file` (vẫn parse đủ, chỉ cảnh báo).
4. Câu hỏi không số mà **không nằm trong list `<ol>`** (gõ tay, quên số) →
   bị gộp vào câu trước/instruction. → Luôn đánh số `1.` `2.` thủ công.

## 5. Khắc phục sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách sửa file |
|---|---|---|
| Cả file thành 1 group / 0 câu hỏi | Thiếu header `Questions a–b` | Thêm dòng `Questions 1–4` (Heading 2) |
| Câu hỏi dính vào nhau | Dùng Word numbering, mammoth gộp `<li>` | Đã tự tách; nếu vẫn dính → đánh số tay |
| Options thành câu hỏi riêng | Options không có chữ `A.` | Thêm `A.` `B.` `C.` đầu dòng |
| Word bank không nhận | Bank < 5 từ, thiếu từ gợi ý | Thêm `Choose words from the box.` |
| Bảng không ra ô nhập | Ô trống không có số / số ở cột đầu | Để `11. .....` ở ô cần điền (không phải cột 0) |
| Type sai (vd gap thay vì mcq) | Instruction thiếu từ khóa | Xem bảng từ khóa ở mục 2, bổ sung instruction |
| Passage lẫn câu hỏi | Câu hỏi không số/không header | Đánh số + header đầy đủ |

## 6. Thêm dạng câu hỏi mới (checklist cho dev)

1. `src/types.ts` — thêm literal vào `QuestionType`.
2. `src/utils/docxParser.ts` — regex nhận diện + nhánh trong vòng lặp dòng
   + `inferGroupType` + (nếu cần) giữ type ở switch `for (const q of ...)`.
3. `src/components/QuestionCard.tsx` — `TYPE_BADGE` + `renderControl()`.
4. `src/components/GroupView.tsx` — `TYPE_INFO`.
5. `src/utils/docxExporter.ts` — `TYPE_LABEL` (+ render đáp án nếu đặc biệt).
6. `scripts/make-sample.mjs` hoặc test mới — fixture + assertion.
7. Cập nhật mục 2 của file này + bảng ở `README.md`.

Test liên quan:

## 7. Bảng ký hiệu được hỗ trợ (`src/utils/symbols.ts`)

Mọi regex ký hiệu sống ở **1 file duy nhất** `src/utils/symbols.ts`
(`BLANK_RE`, `normalizeLine`) — parser và UI render nét đứt dùng chung,
thêm ký hiệu mới chỉ cần sửa 1 chỗ.

### Chỗ trống (gap / form / bảng)

| Ký hiệu | Ví dụ |
|---|---|
| Gạch dưới 2+ | `___`, `﹏﹏`, `＿` (full-width) |
| Chấm 3+ / … 2+ | `...`, `……`, `···` |
| Ngoặc tròn | `(....)`, `(      )`, `( )` (rỗng cũng tính) |
| Ngoặc vuông | `[]`, `[ ]`, `[____]`, `[....]` |
| Ô vuông / tròn | `□`, `□□□`, `◻`, `○○` |
| Khác | `???`, `###`, `***`, `×××` |

> 1 ký tự đơn (`_ ? * • …`) **không** tính là blank (tránh nuốt dấu câu).

### Số câu

`1.` `1)` `(1)` `1:` `1、` `1 text` + tiền tố
`Q1.` `Q. 5` `No. 12:` `Question 3` `Câu 1:` `Câu hỏi 2:` `Item 7`.

### Options

`A.` `A)` `(A)` `[A]` `A:` `A、` (tới `J`), La Mã `i.` `ii.` `iv)`,
full-width `Ａ．`, khoanh tròn `Ⓐ` `ⓐ`, `①` → số câu.

### Header group

`Questions`, `Question`, `Câu hỏi`, `Câu`, `Part`, `Section`,
`Exercise`, `Task`, `Bài` (+ `Bài tập`) — range `1-5 1–5 1—5 1~5 1 to 5`,
chấp nhận `Part 1: Questions 1-5`, header dính instruction.

### Legend boolean

`TRUE FALSE NOT GIVEN YES NO` đứng riêng từng dòng,
kể cả `T/F`, `ĐÚNG/SAI`.

### Chuẩn hoá tự động (`normalizeLine`)

Số/chữ full-width (`９ Ａ ．`), `①-⑳` → số, `Ⓐ-Ⓙ` → `A.`–`J.`,
dấu câu CJK (`，；：（）［］【】` → `,;:()[]`), `﹏﹍＿` → `_`,
`⋯`/`···` → `...`, `～` → `~`, quotes cong, NBSP.

```bash
npx tsx scripts/test-symbols.ts   # 40+ assertions cho bảng ký hiệu
```

## 8. Tag ép kiểu — `[TFNG]` `[FILL]`...

Khi instruction khó viết đúng từ khóa, gắn tag để **ép thẳng loại câu hỏi**
(ưu tiên tuyệt đối hơn mọi suy đoán). Tag đặt ở:

```text
Questions 1–3 [TFNG]      ← dính sau header
[FILL]                    ← đứng riêng 1 dòng (trước header cũng được)
Complete the sentences. [BANK]   ← dính trong instruction
```

| Tag | Loại ép | Ghi chú |
|---|---|---|
| `[TFNG]` `[T/F/NG]` | boolean TRUE/FALSE/NOT GIVEN | Không cần legend, câu plain vẫn ra nút bấm |
| `[YNNG]` `[Y/N/NG]` | boolean YES/NO/NOT GIVEN | Tự bổ sung vào instruction để ra đúng bộ nút |
| `[MCQ]` `[ABCD]` `[CHOICE]` | trắc nghiệm | |
| `[MATCH]` | matching | |
| `[FILL]` `[GAP]` `[BLANK]` | điền từ | |
| `[BANK]` `[BOX]` | word bank | Bank ít từ/vắng hint vẫn nhận |
| `[FORM]` `[INFO]` | điền thông tin | Dòng `Label: ...` **không cần chỗ trống** cũng thành ô điền; giá trị ví dụ (`Name: Nguyen Van A`) thành placeholder `vd: ...` |
| `[WRITE]` | tự luận | |

- Viết thường cũng được (`[tfng]`), có/không dấu (`[ĐIỀN TỪ]`, `[NỐI]`, `[TỰ LUẬN]`).
- Ngoặc lạ **giữ nguyên**: `[Box A]`, `[see Fig. 2]` (chỉ tag đã biết mới bị ăn).
- UI hiện huy hiệu `🔒 tag` ở group bị ghim.

## 9. Chạy kiểm thử parser

```bash
npx tsx scripts/test-parser.ts        # regression với sample-ielts.docx
npx tsx scripts/test-parser-edge.ts   # heading/list/bảng tách ô/legend/bank chồng/write
npx tsx scripts/test-symbols.ts       # bảng ký hiệu (mục 7)
npx tsx scripts/test-tags.ts          # tag ép kiểu [TFNG]/[FILL]/... (mục 8)
npx tsx scripts/test-passages.ts      # file nhiều passage (tách section + gán group)
npx tsx --tsconfig tsconfig.app.json scripts/test-groups.ts   # interactions
```
