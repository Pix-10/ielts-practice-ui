import { useRef, useState } from 'react';

interface Props {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

const FEATURES = [
  {
    icon: '📄',
    title: 'Upload file .docx',
    desc: 'Kéo thả bài tập IELTS Reading/Listening vào đây',
  },
  {
    icon: '🧠',
    title: 'Parser tự nhận dạng',
    desc: 'Trắc nghiệm, TF/NG, matching, điền từ, word bank, bảng',
  },
  {
    icon: '✏️',
    title: 'Giao diện làm bài',
    desc: 'Điền đáp án trên web thay vì gõ tay vào Word',
  },
  {
    icon: '📥',
    title: 'Xuất file đáp án',
    desc: 'Tải về .docx hoàn chỉnh + bảng đáp án cuối file',
  },
];

export function Hero({ onFileSelect, isLoading }: Props) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileSelect(file);
  };

  return (
    <div className="hero fade-in">
      <h1>
        Điền đáp án IELTS <span className="grad">ngay trên trình duyệt</span>
      </h1>
      <p className="lead">
        Upload file .docx bài tập, làm bài trên giao diện web thân thiện, rồi
        tải về file Word đã có sẵn đáp án — không cần gõ tay từng câu.
      </p>

      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') inputRef.current?.click();
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="kbd"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFileSelect(f);
            e.target.value = '';
          }}
        />
        <span className="dz-icon">{isLoading ? '⏳' : '📄'}</span>
        <h3>{isLoading ? 'Đang phân tích file...' : 'Kéo thả file .docx vào đây'}</h3>
        <p>hoặc bấm để chọn file từ máy tính</p>
      </div>

      <div className="feature-grid">
        {FEATURES.map((f) => (
          <div className="feature" key={f.title}>
            <span className="f-icon">{f.icon}</span>
            <b>{f.title}</b>
            <span>{f.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
