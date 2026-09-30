import { useEffect, useRef } from 'react';
import type { Answers, Question } from '../types';

const TYPE_BADGE: Record<Question['type'], { label: string; cls: string }> = {
  mcq: { label: 'Trắc nghiệm', cls: '' },
  boolean: { label: 'True / False / Not Given', cls: 'amber' },
  matching: { label: 'Nối', cls: '' },
  gap: { label: 'Điền từ', cls: 'green' },
  'word-bank': { label: 'Điền từ (chọn từ)', cls: 'green' },
  form: { label: 'Điền thông tin', cls: 'green' },
  write: { label: 'Tự luận', cls: 'amber' },
};

interface Props {
  q: Question;
  answers: Answers;
  flags: Record<string, boolean>;
  active: boolean;
  onChange: (id: string, value: string) => void;
  onToggleFlag: (id: string) => void;
  onFocus: (id: string) => void;
}

/** Hiển thị text câu hỏi, biến chỗ trống "____" thành nét đứt */
function QuestionText({ text }: { text: string }) {
  const parts = text.split(/(_{2,}|\(\s*[.。…_-]{3,}\s*\)|…{2,})/g);
  return (
    <span className="qtext">
      {parts.map((p, i) =>
        /(_{2,}|\(\s*[.。…_-]{3,}\s*\)|…{2,})/.test(p) ? (
          <span key={i} className="blank">
            &nbsp;
          </span>
        ) : (
          p
        ),
      )}
    </span>
  );
}

export function QuestionCard({
  q,
  answers,
  flags,
  active,
  onChange,
  onToggleFlag,
  onFocus,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const value = answers[q.id] ?? '';
  const answered = value.trim().length > 0;
  const badge = TYPE_BADGE[q.type];

  useEffect(() => {
    if (active) inputRef.current?.focus({ preventScroll: true });
  }, [active]);

  const selectOption = (letter: string) => {
    onChange(q.id, value === letter ? '' : letter);
  };

  const renderControl = () => {
    switch (q.type) {
      case 'mcq':
      case 'boolean':
      case 'matching':
        return (
          <div
            className={`options ${
              q.type === 'boolean' || (q.options?.length ?? 0) > 3
                ? 'inline'
                : ''
            }`}
          >
            {(q.options ?? []).map((o) => (
              <button
                key={o.letter}
                type="button"
                className={`option ${
                  value === o.letter ? 'selected' : ''
                }`}
                onClick={() => selectOption(o.letter)}
                onFocus={() => onFocus(q.id)}
              >
                <span className="opt-letter">{o.letter}</span>
                <span>{o.text}</span>
              </button>
            ))}
          </div>
        );

      case 'write':
        return (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            className="answer-input"
            placeholder="Viết câu trả lời của bạn tại đây..."
            value={value}
            onChange={(e) => onChange(q.id, e.target.value)}
            onFocus={() => onFocus(q.id)}
          />
        );

      case 'form':
        return (
          <div className="form-field">
            <label className="form-label" htmlFor={`in-${q.id}`}>
              <span className="form-num">{q.number ?? '•'}</span>
              {q.text}
            </label>
            <input
              id={`in-${q.id}`}
              ref={inputRef as React.RefObject<HTMLInputElement>}
              className="form-input"
              type="text"
              placeholder={q.placeholder || '...'}
              value={value}
              onChange={(e) => onChange(q.id, e.target.value)}
              onFocus={() => onFocus(q.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const next = ref.current
                    ?.closest('.group')
                    ?.querySelector<HTMLElement>('.qcard:not(.answered) .form-input');
                  next?.focus();
                }
              }}
            />
          </div>
        );

      case 'word-bank':
      case 'gap':
      default:
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            className="answer-input"
            type="text"
            placeholder={q.placeholder || 'Điền đáp án...'}
            value={value}
            onChange={(e) => onChange(q.id, e.target.value)}
            onFocus={() => onFocus(q.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                // nhảy câu kế tiếp
                const next = ref.current
                  ?.closest('.group')
                  ?.querySelector<HTMLElement>('.qcard:not(.answered) .answer-input');
                next?.focus();
              }
            }}
          />
        );
    }
  };

  return (
    <div
      ref={ref}
      id={`q-${q.id}`}
      className={`qcard ${answered ? 'answered' : ''}`}
      onClick={() => onFocus(q.id)}
    >
      <div className="q-head">
        {q.type !== 'form' && <div className="qnum">{q.number ?? '•'}</div>}
        <div className="q-body">
          {q.context && <div className="qcontext">{q.context}</div>}
          <div className="q-head" style={{ alignItems: 'flex-start' }}>
            {q.type !== 'form' && <QuestionText text={q.text} />}
            <button
              type="button"
              className={`q-flag ${flags[q.id] ? 'on' : ''}`}
              title="Đánh dấu câu khó / chưa chắc"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFlag(q.id);
              }}
            >
              {flags[q.id] ? '🚩' : '⚐'}
            </button>
          </div>
          {q.type !== 'form' && (
            <span className={`badge ${badge.cls}`} style={{ marginTop: 8 }}>
              {badge.label}
            </span>
          )}
          {renderControl()}
        </div>
      </div>
    </div>
  );
}
