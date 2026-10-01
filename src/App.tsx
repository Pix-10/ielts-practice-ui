import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Hero } from './components/Hero';
import { GroupView } from './components/GroupView';
import { BottomBar } from './components/BottomBar';
import { AudioBar } from './components/AudioBar';
import { parseDocx, escapeHtml } from './utils/docxParser';
import { answersToText, exportToDocx } from './utils/docxExporter';
import type { Answers, Exercise, Flags } from './types';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [flags, setFlags] = useState<Flags>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [student, setStudent] = useState('');
  const [passageOpen, setPassageOpen] = useState(true);
  // Audio bài Listening: url (remote hoặc objectURL) + tên file local
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioName, setAudioName] = useState<string | null>(null);
  const audioObjUrlRef = useRef<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    load<'light' | 'dark'>('ielts-theme', 'light'),
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ielts-theme', JSON.stringify(theme));
  }, [theme]);

  // Khôi phục theo tên file
  useEffect(() => {
    if (!exercise) return;
    const key = `ielts-${exercise.fileName}`;
    setAnswers(load<Answers>(key, {}));
    setFlags(load<Flags>(`${key}-flags`, {}));
    setStudent(load<string>(`${key}-student`, ''));
    // Audio: ưu tiên URL người dùng đã lưu, sau đó link tìm thấy trong docx
    const saved = load<string | null>(`${key}-audio`, null);
    setAudioUrl(saved ?? exercise.audioUrl ?? null);
    setAudioName(null);
  }, [exercise?.fileName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tự lưu
  useEffect(() => {
    if (!exercise) return;
    const key = `ielts-${exercise.fileName}`;
    localStorage.setItem(key, JSON.stringify(answers));
    localStorage.setItem(`${key}-flags`, JSON.stringify(flags));
    localStorage.setItem(`${key}-student`, JSON.stringify(student));
    // chỉ lưu được URL remote — file local (objectURL) sống trong phiên
    if (audioUrl && !audioUrl.startsWith('blob:')) {
      localStorage.setItem(`${key}-audio`, JSON.stringify(audioUrl));
    }
  }, [answers, flags, student, exercise, audioUrl]);

  // Dọn objectURL khi unmount / đổi file
  useEffect(() => {
    return () => {
      if (audioObjUrlRef.current) URL.revokeObjectURL(audioObjUrlRef.current);
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const handleAudioFile = useCallback((file: File) => {
    if (audioObjUrlRef.current) URL.revokeObjectURL(audioObjUrlRef.current);
    const objUrl = URL.createObjectURL(file);
    audioObjUrlRef.current = objUrl;
    setAudioUrl(objUrl);
    setAudioName(file.name);
  }, []);

  const handleAudioUrl = useCallback(
    (url: string | null) => {
      if (audioObjUrlRef.current) {
        URL.revokeObjectURL(audioObjUrlRef.current);
        audioObjUrlRef.current = null;
      }
      setAudioUrl(url);
      setAudioName(null);
      if (url && exercise) {
        localStorage.setItem(`ielts-${exercise.fileName}-audio`, JSON.stringify(url));
        showToast('Đã gắn link audio 🎧');
      } else if (exercise) {
        localStorage.removeItem(`ielts-${exercise.fileName}-audio`);
      }
    },
    [exercise, showToast],
  );

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.docx')) {
        setError('Chỉ hỗ trợ file định dạng .docx');
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const parsed = await parseDocx(file);
        setExercise(parsed);
        setFlashId(null);
        setActiveId(null);
        if (parsed.warnings.length) {
          showToast(parsed.warnings[0]);
        } else {
          showToast(
            `Đã nhận dạng ${parsed.groups.length} phần câu hỏi 🎉`,
          );
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (e) {
        console.error(e);
        setError(
          'Không đọc được file. Hãy đảm bảo file là .docx hợp lệ (không phải .doc hay file nén).',
        );
      } finally {
        setIsLoading(false);
      }
    },
    [showToast],
  );

  const changeAnswer = useCallback((id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }, []);

  const toggleFlag = useCallback((id: string) => {
    setFlags((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const jumpTo = useCallback((id: string) => {
    setActiveId(id);
    setFlashId(null);
    // ép animation chạy lại
    requestAnimationFrame(() => setFlashId(id));
    document
      .getElementById(`q-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // Đo chiều cao topbar / audio bar / bottom bar → CSS --h-*.
  // Layout .work dùng các biến này để cao đúng bằng viewport còn lại,
  // hai cột passage | câu hỏi cuộn riêng, trang không nhảy scrollbar.
  useLayoutEffect(() => {
    if (!exercise) return;
    const root = document.documentElement;
    const measure = (sel: string, fallback: number) => {
      const h =
        document.querySelector(sel)?.getBoundingClientRect().height ?? 0;
      return Math.round(h || fallback);
    };
    const update = () => {
      root.style.setProperty('--h-top', `${measure('.topbar', 63)}px`);
      root.style.setProperty('--h-audio', `${measure('.audio-bar', 0)}px`);
      root.style.setProperty('--h-bottom', `${measure('.bottom-bar', 60)}px`);
    };
    update();

    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro) {
      for (const sel of ['.topbar', '.audio-bar', '.bottom-bar']) {
        const el = document.querySelector(sel);
        if (el) ro.observe(el);
      }
    }
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [exercise]);

  const allQuestions = useMemo(
    () => exercise?.groups.flatMap((g) => g.questions) ?? [],
    [exercise],
  );

  const doneCount = useMemo(
    () => allQuestions.filter((q) => answers[q.id]?.trim()).length,
    [allQuestions, answers],
  );

  const handleExport = useCallback(async () => {
    if (!exercise) return;
    if (doneCount === 0) {
      showToast('Bạn chưa điền đáp án nào!');
      return;
    }
    await exportToDocx(exercise, answers, student || undefined, audioUrl);
    showToast('Đã tải file Word với đáp án ✓');
  }, [exercise, answers, student, audioUrl, doneCount, showToast]);

  const handleCopy = useCallback(async () => {
    if (!exercise) return;
    try {
      await navigator.clipboard.writeText(answersToText(exercise, answers));
      showToast('Đã copy danh sách đáp án ✓');
    } catch {
      showToast('Không copy được — trình duyệt chặn clipboard');
    }
  }, [exercise, answers, showToast]);

  const clearAnswers = useCallback(() => {
    if (!exercise) return;
    if (!window.confirm('Xóa toàn bộ đáp án đã điền của file này?')) return;
    setAnswers({});
    setFlags({});
    showToast('Đã xóa toàn bộ đáp án');
  }, [exercise, showToast]);

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="brand-badge">IE</div>
          <div style={{ minWidth: 0 }}>
            <div className="brand-title">
              {exercise ? exercise.title : 'IELTS Answer Filler'}
            </div>
            <div className="brand-sub">
              {exercise
                ? `${exercise.fileName} · ${allQuestions.length} câu hỏi`
                : 'Điền đáp án bài tập IELTS vào file .docx'}
            </div>
          </div>
        </div>

        <div className="topbar-spacer" />

        <div className="topbar-actions">
          {exercise && (
            <>
              <button
                className="btn"
                onClick={handleCopy}
                title="Copy danh sách đáp án dạng text"
              >
                📋 Copy
              </button>
              <button
                className="btn"
                onClick={clearAnswers}
                title="Xóa hết đáp án của file này"
              >
                🗑️
              </button>
              <button className="btn btn-primary" onClick={handleExport}>
                📥 Tải file .docx
              </button>
              <button
                className="btn"
                onClick={() => {
                  setExercise(null);
                  setError(null);
                }}
              >
                Đổi file
              </button>
            </>
          )}
          <button
            className="btn btn-icon"
            title="Đổi giao diện sáng/tối"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      {exercise && (
        <AudioBar
          url={audioUrl}
          name={audioName}
          onPickFile={handleAudioFile}
          onSetUrl={handleAudioUrl}
        />
      )}

      {error && (
        <div style={{ maxWidth: 860, margin: '16px auto 0', padding: '0 20px' }}>
          <div className="warn-box">⚠️ {error}</div>
        </div>
      )}

      {!exercise ? (
        <Hero onFileSelect={handleFileSelect} isLoading={isLoading} />
      ) : (
        <>
          <div className="work">
            {/* ===== Cột trái: bài đọc / nội dung nghe ===== */}
            <aside className="work-left">
              {exercise.warnings.length > 0 && (
                <div className="warn-box">
                  {exercise.warnings.map((w, i) => (
                    <span key={i}>⚠️ {w}</span>
                  ))}
                </div>
              )}

              <div className="card">
                <div
                  className="passage-head"
                  onClick={() => setPassageOpen((v) => !v)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setPassageOpen((v) => !v);
                  }}
                >
                  <h3>
                    📖 Passage / Nội dung bài{' '}
                    <span className="badge">
                      {exercise.passage.length} đoạn
                    </span>
                  </h3>
                  <span className={`chev ${passageOpen ? 'open' : ''}`}>▼</span>
                </div>
                {passageOpen &&
                  (exercise.passage.length ? (
                    <div className="passage-body">
                      {exercise.passage.map((p, i) => (
                        <p
                          key={i}
                          dangerouslySetInnerHTML={{ __html: escapeHtml(p) }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="passage-body">
                      <p className="hint">
                        Không tìm thấy phần passage trong file (có thể file chỉ
                        chứa câu hỏi).
                      </p>
                    </div>
                  ))}
              </div>

              <div className="card card-pad">
                <div className="card-title">Thông tin người làm</div>
                <input
                  className="name-input"
                  placeholder="Họ và tên (tùy chọn)..."
                  value={student}
                  onChange={(e) => setStudent(e.target.value)}
                />
                <div className="divider" />
                <p className="hint">
                  💡 Bấm <span className="kbd">Enter</span> ở ô nhập để nhảy câu
                  kế tiếp · click từ <b>word bank</b> để điền nhanh · 🚩 đánh
                  dấu câu khó.
                  <br />
                  <br />
                  Dữ liệu lưu cục bộ trên trình duyệt — không gửi đi đâu.
                </p>
              </div>
            </aside>

            {/* ===== Cột phải: câu hỏi ===== */}
            <main className="work-right">
              {exercise.groups.map((g) => (
                <GroupView
                  key={g.id}
                  group={g}
                  answers={answers}
                  flags={flags}
                  activeId={activeId}
                  flashId={flashId}
                  onChange={changeAnswer}
                  onToggleFlag={toggleFlag}
                  onFocus={setActiveId}
                />
              ))}

              <div className="card card-pad" style={{ textAlign: 'center' }}>
                <p className="hint" style={{ marginBottom: 12 }}>
                  Kiểm tra lại xong? Xuất file Word gồm passage, câu hỏi và đáp
                  án bạn đã điền.
                </p>
                <button className="btn btn-success" onClick={handleExport}>
                  📥 Tải file .docx đã điền đáp án
                </button>
              </div>

              <div className="footer-note">
                Tiến độ: <b>{doneCount}</b>/{allQuestions.length} câu đã điền
              </div>
            </main>
          </div>

          {/* ===== Thanh điều hướng + tiến độ dưới cùng ===== */}
          <BottomBar
            exercise={exercise}
            answers={answers}
            flags={flags}
            activeId={activeId}
            onJump={jumpTo}
            onExport={handleExport}
            onCopy={handleCopy}
          />
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
