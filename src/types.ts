export type QuestionType =
  | 'mcq'        // trắc nghiệm A/B/C/D
  | 'boolean'    // TRUE/FALSE/NOT GIVEN, YES/NO/NOT GIVEN
  | 'matching'   // nối tiêu đề (roman / letter) với options dùng chung
  | 'gap'        // điền từ vào chỗ trống
  | 'word-bank'  // điền từ lựa chọn trong bank
  | 'form'       // điền thông tin (form: Họ tên, Địa chỉ, ...)
  | 'write';     // tự luận

export interface OptionItem {
  letter: string;
  text: string;
}

export interface TableCell {
  text: string;
  qid?: string;
}

export interface Question {
  id: string;
  number: number | null;
  text: string;
  type: QuestionType;
  options?: OptionItem[];
  placeholder?: string;
  context?: string; // ngữ cảnh cho câu trong bảng (hàng / cột)
}

export interface QuestionGroup {
  id: string;
  title: string;
  range?: string;
  instruction: string;
  type: QuestionType;
  /** true khi type do tag [TFNG]/[FILL]/... trong file chỉ định (không suy đoán) */
  typeLocked?: boolean;
  /** id của passage chứa group này (file nhiều passage) */
  passageId?: string;
  wordBank?: string[];
  sharedOptions?: OptionItem[];
  questions: Question[];
  table?: TableCell[][];
}

/** Một phần bài đọc trong file nhiều passage (IELTS Reading P1/P2/P3...) */
export interface PassageSection {
  id: string;
  /** Tiêu đề đầy đủ: "READING PASSAGE 2", "Bài đọc 1"... */
  title: string;
  /** Nhãn ngắn cho tab: "Passage 2", "Bài đọc 1", "Bài đọc" */
  label: string;
  paragraphs: string[];
}

export interface Exercise {
  title: string;
  fileName: string;
  /** Các phần bài đọc (1 phần nếu file chỉ có 1 passage) */
  passages: PassageSection[];
  groups: QuestionGroup[];
  warnings: string[];
  /** Link audio phát hiện được trong file (bài Listening) */
  audioUrl?: string;
}

export type Answers = Record<string, string>;
export type Flags = Record<string, boolean>;
