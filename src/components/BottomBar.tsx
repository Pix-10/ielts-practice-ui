import type { Answers, Exercise, Flags } from '../types';

interface Props {
  exercise: Exercise;
  answers: Answers;
  flags: Flags;
  activeId: string | null;
  onJump: (id: string) => void;
  onExport: () => void;
  onCopy: () => void;
}

const R = 15;
const C = 2 * Math.PI * R;

export function BottomBar({
  exercise,
  answers,
  flags,
  activeId,
  onJump,
  onExport,
  onCopy,
}: Props) {
  const allQ = exercise.groups.flatMap((g) => g.questions);
  const total = allQ.length;
  const done = allQ.filter((q) => answers[q.id]?.trim()).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="bottom-bar">
      <div className="bb-inner">
        {/* Tiến độ */}
        <div className="bb-progress" title={`${done}/${total} câu đã điền`}>
          <svg width="40" height="40" viewBox="0 0 40 40" className="bb-ring">
            <circle
              cx="20"
              cy="20"
              r={R}
              fill="none"
              stroke="var(--surface-3)"
              strokeWidth="5"
            />
            <circle
              cx="20"
              cy="20"
              r={R}
              fill="none"
              stroke="url(#bbgrad)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C - (C * pct) / 100}
              transform="rotate(-90 20 20)"
              style={{ transition: 'stroke-dashoffset .4s ease' }}
            />
            <defs>
              <linearGradient id="bbgrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#4f46e5" />
                <stop offset="100%" stopColor="#7c3aed" />
              </linearGradient>
            </defs>
          </svg>
          <div className="bb-progress-text">
            <b>{pct}%</b>
            <span>
              {done}/{total} câu
            </span>
          </div>
        </div>

        {/* Điều hướng câu hỏi */}
        <div className="bb-nav" role="navigation" aria-label="Điều hướng câu hỏi">
          {exercise.groups.map((g, gi) => (
            <div className="bb-nav-group" key={g.id}>
              {gi > 0 && <span className="bb-sep" aria-hidden="true" />}
              <span className="bb-group-label" title={g.title}>
                {g.range ?? g.title.replace(/^questions?\s*/i, '')}
              </span>
              {g.questions.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  className={`nav-cell ${
                    answers[q.id]?.trim() ? 'done' : ''
                  } ${activeId === q.id ? 'current' : ''}`}
                  title={`Câu ${q.number ?? q.id}${
                    answers[q.id]?.trim() ? ' — đã điền' : ' — chưa điền'
                  }${flags[q.id] ? ' — đã đánh dấu 🚩' : ''}`}
                  onClick={() => onJump(q.id)}
                >
                  {q.number ?? '•'}
                  {flags[q.id] && <span className="flag-dot" />}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Thao tác */}
        <div className="bb-actions">
          <button className="btn" onClick={onCopy} title="Copy danh sách đáp án dạng text">
            📋
          </button>
          <button className="btn btn-primary" onClick={onExport}>
            📥 Tải .docx
          </button>
        </div>
      </div>
    </div>
  );
}
