# IELTS Answer Filler — Điền đáp án vào file .docx

Web app giúp làm bài tập IELTS Reading/Listening trên giao diện web thay vì gõ tay vào Word, rồi tải về file .docx đã điền đáp án.

## Tính năng

### 🧠 Parser thông minh
Tự nhận dạng cấu trúc file .docx và phân loại câu hỏi:

| Dạng câu hỏi | Giao diện điền đáp án |
|---|---|
| Trắc nghiệm (A/B/C/D) | Thẻ lựa chọn bấm chọn |
| TRUE / FALSE / NOT GIVEN | Nút TRUE–FALSE–NOT GIVEN |
| YES / NO / NOT GIVEN | Nút YES–NO–NOT GIVEN |
| Matching (nối, List of Headings) | Chọn từ bộ options dùng chung |
| Điền từ / Sentence completion | Ô nhập, chỗ trống hiển thị nét đứt |
| Word bank (chọn từ trong hộp) | Chips bấm để điền nhanh + ô nhập |
| Table completion | Ô nhập nằm ngay trong ô bảng |
| Điền thông tin (form: Họ tên, Địa chỉ...) | Dòng label + ô nhập bên phải |
| Tự luận / short answer | Ô textarea |

- Tách **passage** và **khu vực câu hỏi** tự động
- Gom câu hỏi theo nhóm `Questions 1–5` kèm instruction
- Nhận diện word bank (dòng phân cách hoặc bảng)
- Nhận diện bảng có ô đánh số để điền
- Nhận diện dòng form `17. Họ tên: .........` / `Địa chỉ: _____`

### 🎧 Audio cho bài Listening (tùy chọn)
- Parser tự tìm **link audio trong file docx** (hyperlink `.mp3/.m4a/.wav/.ogg...`)
- Player sticky ngay dưới topbar: phát/tạm dừng, thanh tiến độ, **tốc độ 0.75×–2×**, âm lượng
- Chọn file audio từ máy hoặc **dán URL** bất kỳ lúc nào (nút 📁 / 🔗)
- Link audio được lưu theo file và ghi kèm khi xuất .docx (`🎧 Audio: ...`)

### ✏️ Làm bài trên web
- **Bố cục 2 cột**: bên trái là passage/audio (dính khi cuộn), bên phải là các câu hỏi
- **Nhiều passage**: tabs chuyển phần bài đọc (Passage 1/2/3...), bấm số câu
  ở thanh dưới → tab tự nhảy theo passage chứa câu đó (`READING PASSAGE 1`,
  `Bài đọc 1`... — xem README)
- **Thanh dưới cùng**: điều hướng mọi câu (nhóm tách riêng) + tiến độ vòng tròn % + nút Copy/Xuất
- Đánh dấu 🚩 câu khó (chấm hiện trên số ở thanh điều hướng)
- Word bank: click chip để tự điền vào câu đang chọn
- Nhấn `Enter` ở ô nhập để nhảy câu kế tiếp
- Tự lưu đáp án vào localStorage theo từng file (đổi file không mất dữ liệu)
- Giao diện sáng/tối 🌙/☀️

### 📥 Xuất file
- **Tải file .docx**: passage + câu hỏi + đáp án đã điền + bảng đáp án cuối file
- **Copy**: danh sách đáp án dạng text để dán nhanh

## Sử dụng

```bash
npm install
npm run dev        # http://localhost:5173
```

Tạo file mẫu để kiểm thử:

```bash
node scripts/make-sample.mjs   # tạo sample-ielts.docx (đủ 6 dạng câu hỏi)
```

> 📖 Quy ước viết file .docx để parser nhận dạng chuẩn:
> xem **[PARSER_GUIDE.md](./PARSER_GUIDE.md)** (mẫu GOOD/BAD cho từng dạng,
> giới hạn đã biết, bảng khắc phục sự cố).

## Kiểm thử (dev)

```bash
npx tsx scripts/test-parser.ts                          # parser với sample docx
npx tsx scripts/test-parser-edge.ts                     # heading/list/bảng tách ô/legend/bank chồng/write
npx tsx scripts/test-symbols.ts                         # bảng ký hiệu (normalize + tiền tố số + blank mới)
npx tsx scripts/test-tags.ts                            # tag ép kiểu [TFNG]/[FILL]/[FORM]/...
npx tsx scripts/test-passages.ts                        # file nhiều passage (tách section + gán group)
npx tsx --tsconfig tsconfig.app.json scripts/test-render.ts   # render App
npx tsx --tsconfig tsconfig.app.json scripts/test-groups.ts   # interactions
```

## Build production

```bash
npm run build
```

## Cấu trúc file docx lý tưởng

```
Tiêu đề bài

Passage...

Questions 1–4
Choose the correct letter, A, B, C or D.
1. Câu hỏi?
A. ...
B. ...

Questions 5–7
TRUE / FALSE / NOT GIVEN
5. Câu phát biểu...

Questions 8–10
Complete the sentences. Choose words from the box.
từ1, từ2, từ3, ...
8. Sentence with ______.

Questions 11–13   (kèm bảng, ô điền ghi "11. ..........")

Questions 17–19
Complete the form below. Write ONE WORD ONLY.
17. Full name: ..........
18. Address: ..........
```

### Nhiều passage trong 1 file

```text
IELTS Reading Test 1

READING PASSAGE 1              ← header passage (để Heading 1/2 càng tốt)
<đoạn văn...>

Questions 1–6
...

READING PASSAGE 2: The History of Salt    ← tiêu đề sau số cũng được
<đoạn văn...>

Questions 7–13
...
```

- Header passage: `READING PASSAGE 1`, `Passage 2`, `Bài đọc 1`, `Đoạn văn 2`.
  Cố tình KHÔNG nhận `Section/Part` (đó là section nghe/làm bài) và `Bài 1`
  trần (đó là header group câu hỏi).
- Cột trái hiện **tabs chuyển passage**; bấm số câu ở thanh dưới → tab tự
  nhảy theo passage chứa câu đó. Xuất `.docx` cũng tách từng passage kèm
  đúng groups của nó.
- Nội dung trước header Passage đầu tiên gộp vào section đó (file 1 passage
  hành xử y như cũ).

## Công nghệ

- React 19 + Vite + TypeScript
- [mammoth](https://github.com/mwilliamson/mammoth) — đọc .docx
- [docx](https://docx.js.org/) — xuất .docx
- file-saver — tải file về
- jsdom + tsx — test script
