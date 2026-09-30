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
  wordBank?: string[];
  sharedOptions?: OptionItem[];
  questions: Question[];
  table?: TableCell[][];
}

export interface Exercise {
  title: string;
  fileName: string;
  passage: string[];
  groups: QuestionGroup[];
  warnings: string[];
  /** Link audio phát hiện được trong file (bài Listening) */
  audioUrl?: string;
}

export type Answers = Record<string, string>;
export type Flags = Record<string, boolean>;
