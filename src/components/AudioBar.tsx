import { useEffect, useRef, useState } from 'react';

interface Props {
  /** URL audio hiện tại (remote) — undefined nếu chưa có */
  url?: string | null;
  /** Tên file audio local (phiên hiện tại) */
  name?: string | null;
  onPickFile: (file: File) => void;
  onSetUrl: (url: string | null) => void;
}

const RATES = [0.75, 1, 1.25, 1.5, 2];

function fmt(sec: number): string {
  if (!Number.isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioBar({ url, name, onPickFile, onSetUrl }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);
  const [vol, setVol] = useState(1);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');

  const src = url ?? null;
  const label = name ?? (url ? url.split('/').pop()?.split('?')[0] : null);

  // reset khi đổi nguồn
  useEffect(() => {
    setPlaying(false);
    setCur(0);
    setDur(0);
  }, [src]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      // play() có thể không trả Promise (jsdom / trình duyệt cũ)
      const p = a.play();
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    } else {
      a.pause();
    }
  };

  const seek = (v: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = v;
    setCur(v);
  };

  const changeRate = (r: number) => {
    setRate(r);
    if (audioRef.current) audioRef.current.playbackRate = r;
  };

  const changeVol = (v: number) => {
    setVol(v);
    if (audioRef.current) audioRef.current.volume = v;
  };

  const handleUrl = () => {
    const v = urlDraft.trim();
    if (!v) return;
    onSetUrl(v);
    setShowUrlInput(false);
    setUrlDraft('');
  };

  return (
    <div className="audio-bar">
      <div className="audio-inner">
        <span className="ap-icon" title="Audio bài Listening">
          🎧
        </span>

        {src ? (
          <>
            <button
              type="button"
              className="ap-play"
              onClick={toggle}
              aria-label={playing ? 'Tạm dừng' : 'Phát'}
            >
              {playing ? '⏸' : '▶'}
            </button>

            <span className="ap-time">{fmt(cur)}</span>
            <input
              type="range"
              className="ap-progress"
              min={0}
              max={dur || 0}
              step={0.1}
              value={cur}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Tiến độ phát"
            />
            <span className="ap-time">{fmt(dur)}</span>

            <select
              className="ap-rate"
              value={rate}
              onChange={(e) => changeRate(Number(e.target.value))}
              title="Tốc độ phát"
            >
              {RATES.map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </select>

            <span className="ap-vol">
              🔊
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={vol}
                onChange={(e) => changeVol(Number(e.target.value))}
                aria-label="Âm lượng"
              />
            </span>

            <span className="ap-name" title={label ?? ''}>
              {label}
            </span>
          </>
        ) : (
          <span className="ap-empty">
            Chưa có audio — bài Listening chưa phát được
          </span>
        )}

        <span className="ap-spacer" />

        <button
          type="button"
          className="btn"
          onClick={() => fileRef.current?.click()}
          title="Chọn file audio trên máy (.mp3, .m4a, .wav...)"
        >
          📁 {src ? 'Đổi file' : 'Chọn file'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setShowUrlInput((v) => !v)}
          title="Dán link audio (.mp3, .m4a...)"
        >
          🔗 URL
        </button>
        {src && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onSetUrl(null)}
            title="Xóa audio"
          >
            ✕
          </button>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
            e.target.value = '';
          }}
        />
      </div>

      {showUrlInput && (
        <div className="audio-url-row">
          <input
            className="name-input"
            placeholder="https://example.com/audio-listening-1.mp3"
            value={urlDraft}
            autoFocus
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleUrl();
              if (e.key === 'Escape') setShowUrlInput(false);
            }}
          />
          <button type="button" className="btn btn-primary" onClick={handleUrl}>
            Dùng link này
          </button>
        </div>
      )}

      {/* audio element ẩn */}
      <audio
        ref={audioRef}
        src={src ?? undefined}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
        onError={() => setPlaying(false)}
      />
    </div>
  );
}
