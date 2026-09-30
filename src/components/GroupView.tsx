import { useEffect, useRef } from 'react';
import type { Answers, QuestionGroup, Question } from '../types';
import { QuestionCard } from './QuestionCard';

const TYPE_INFO: Record<Question['type'], { label: string; cls: string }> = {
  mcq: { label: '📝 Trắc nghiệm', cls: '' },
  boolean: { label: '⚖️ True / False / Not Given', cls: 'amber' },
  matching: { label: '🔗 Nối', cls: '' },
  gap: { label: '✍️ Điền từ', cls: 'green' },
  'word-bank': { label: '🏦 Điền từ (word bank)', cls: 'green' },
  form: { label: '🪪 Điền thông tin', cls: 'green' },
  write: { label: '📄 Tự luận', cls: 'amber' },
};

interface Props {
  group: QuestionGroup;
  answers: Answers;
  flags: Record<string, boolean>;
  activeId: string | null;
  flashId: string | null;
  onChange: (id: string, value: string) => void;
  onToggleFlag: (id: string) => void;
  onFocus: (id: string) => void;
}

/** Bảng điền chỗ trống: input nằm ngay trong ô */
function TableInput({
  q,
  value,
  onChange,
  onFocus,
}: {
  q: Question;
  value: string;
  onChange: (v: string) => void;
  onFocus: (id: string) => void;
}) {
  return (
    <input
      className="cell-input"
      type="text"
      placeholder={`#${q.number}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => onFocus(q.id)}
      aria-label={`Đáp án câu ${q.number}`}
    />
  );
}

export function GroupView({
  group,
  answers,
  flags,
  activeId,
  flashId,
  onChange,
  onToggleFlag,
  onFocus,
}: Props) {
  const info = TYPE_INFO[group.type];
  const done = group.questions.filter((q) => answers[q.id]?.trim()).length;
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!flashId) return;
    const el = bodyRef.current?.querySelector(`#q-${CSS.escape(flashId)}`);
    if (el) {
      el.classList.remove('flash');
      void (el as HTMLElement).offsetWidth; // restart animation
      el.classList.add('flash');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [flashId]);

  const usedWords = new Set(
    Object.values(answers)
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  );

  return (
    <section className="group fade-in" id={`group-${group.id}`}>
      <div className="group-head">
        <div className="group-title-row">
          <h3>{group.title}</h3>
          <span className={`badge ${info.cls}`}>{info.label}</span>
          <span
            className={`badge ${done === group.questions.length ? 'green' : 'amber'}`}
          >
            {done}/{group.questions.length}
          </span>
        </div>
        {group.instruction && <p className="instruction">{group.instruction}</p>}
      </div>

      <div className="group-body" ref={bodyRef}>
        {group.wordBank?.length ? (
          <div className="bank">
            <div className="bank-label">🏦 Word bank — click để điền nhanh</div>
            <div className="bank-chips">
              {group.wordBank.map((w, i) => {
                const isUsed = usedWords.has(w.trim().toLowerCase());
                return (
                  <button
                    key={`${w}-${i}`}
                    type="button"
                    className={`chip ${isUsed ? 'used' : ''}`}
                    onClick={() => {
                      // điền vào câu đang được chọn (hoặc câu đầu chưa làm của group)
                      const target =
                        activeId &&
                        group.questions.some((q) => q.id === activeId)
                          ? group.questions.find((q) => q.id === activeId)
                          : group.questions.find((q) => !answers[q.id]?.trim());
                      if (target) onChange(target.id, w);
                      onFocus(target?.id ?? '');
                    }}
                  >
                    {w}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {group.table ? (
          <div className="table-wrap">
            <table className="matrix">
              <tbody>
                {group.table.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => {
                      const q = cell.qid
                        ? group.questions.find((x) => x.id === cell.qid)
                        : undefined;
                      const isHeader = ri === 0 || ci === 0;
                      return q ? (
                        <td
                          key={ci}
                          id={`q-${q.id}`}
                          className={answers[q.id]?.trim() ? 'answered' : ''}
                        >
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {q.number}. {q.context}
                          </div>
                          <TableInput
                            q={q}
                            value={answers[q.id] ?? ''}
                            onChange={(v) => onChange(q.id, v)}
                            onFocus={onFocus}
                          />
                        </td>
                      ) : isHeader ? (
                        <th key={ci}>{cell.text}</th>
                      ) : (
                        <td key={ci}>{cell.text}</td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          group.questions.map((q) => (
            <QuestionCard
              key={q.id}
              q={q}
              answers={answers}
              flags={flags}
              active={activeId === q.id}
              onChange={onChange}
              onToggleFlag={onToggleFlag}
              onFocus={onFocus}
            />
          ))
        )}
        {group.table && (
          <p className="hint" style={{ marginTop: 10 }}>
            💡 Điền đáp án trực tiếp vào các ô có đánh số trong bảng ở trên.
          </p>
        )}
      </div>
    </section>
  );
}
