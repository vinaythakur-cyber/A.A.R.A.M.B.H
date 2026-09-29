import React, { useEffect, useState, useRef, useMemo } from 'react';
import '../styles/led-timer.css';

/**
 * SVG 7-segment paths for a single digit cell (viewBox: 0 0 46 76).
 * Segments a..g arranged in standard digital clock topology.
 */
const SEGMENT_PATHS = {
  a: 'M 8,5 L 13,1 L 33,1 L 38,5 L 34,9 L 12,9 Z',
  b: 'M 39,6 L 43,10 L 43,33 L 39,37 L 35,33 L 35,10 Z',
  c: 'M 39,39 L 43,43 L 43,66 L 39,70 L 35,66 L 35,43 Z',
  d: 'M 8,71 L 12,67 L 34,67 L 38,71 L 33,75 L 13,75 Z',
  e: 'M 7,39 L 11,43 L 11,66 L 7,70 L 3,66 L 3,43 Z',
  f: 'M 7,6 L 11,10 L 11,33 L 7,37 L 3,33 L 3,10 Z',
  g: 'M 8,38 L 12,35 L 34,35 L 38,38 L 34,41 L 12,41 Z',
};

const DIGIT_MAP = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'g', 'e', 'd'],
  '3': ['a', 'b', 'g', 'c', 'd'],
  '4': ['f', 'g', 'b', 'c'],
  '5': ['a', 'f', 'g', 'c', 'd'],
  '6': ['a', 'f', 'e', 'd', 'c', 'g'],
  '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  '9': ['a', 'b', 'c', 'd', 'f', 'g'],
  '-': ['g'],
  ' ': [],
  'S': ['a', 'f', 'g', 'c', 'd'],
  'Y': ['b', 'c', 'd', 'f', 'g'],
  'N': ['c', 'e', 'g'],
  'C': ['a', 'f', 'e', 'd'],
};

/** Single 7-segment SVG Digit */
function SevenSegmentDigit({ char }) {
  const activeSegments = DIGIT_MAP[char] || [];
  return (
    <div className="led-digit-wrapper">
      <svg
        className="led-svg-digit"
        viewBox="0 0 46 76"
        width="18"
        height="30"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g transform="skewX(-5) translate(4, 0)">
          {Object.entries(SEGMENT_PATHS).map(([seg, path]) => {
            const isLit = activeSegments.includes(seg);
            return (
              <path
                key={seg}
                d={path}
                className={`led-segment ${isLit ? 'led-segment-lit' : 'led-segment-off'}`}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}

/** Colon separator with two square glowing red LED dots */
function LedColon() {
  return (
    <div className="led-colon-wrapper">
      <svg
        className="led-svg-digit led-colon-dots"
        viewBox="0 0 16 76"
        width="8"
        height="30"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g transform="skewX(-5) translate(2, 0)">
          <rect x="4" y="21" width="8" height="8" rx="1.5" className="led-segment led-segment-lit" />
          <rect x="4" y="47" width="8" height="8" rx="1.5" className="led-segment led-segment-lit" />
        </g>
      </svg>
    </div>
  );
}

/**
 * Format integer seconds into HH:MM:SS string (e.g. 00:04:58).
 */
function formatSecondsToHHMMSS(totalSecs) {
  if (totalSecs < 0) totalSecs = 0;
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/**
 * Format Date into live IST time HH:MM:SS string (e.g. 09:44:03).
 */
function formatLiveIST(date) {
  try {
    const parts = new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    }).formatToParts(date);
    const h = parts.find((p) => p.type === 'hour')?.value || '00';
    const m = parts.find((p) => p.type === 'minute')?.value || '00';
    const s = parts.find((p) => p.type === 'second')?.value || '00';
    return `${h}:${m}:${s}`;
  } catch {
    return '00:00:00';
  }
}

/**
 * LedTimer — Glowing Red 7-Segment Mission-Control Timer
 *
 * @param {number} nextInSeconds - Seconds until next nowcast cycle
 * @param {function} onRefresh - Callback triggered when countdown hits 0 or clicked
 * @param {string} size - 'sm' | 'md' | 'lg' (default: 'sm')
 * @param {string} label - Header label text (default: 'NEXT UPDATE')
 * @param {boolean} showClockToggle - Allow clicking to toggle between countdown and IST clock
 */
export default function LedTimer({
  nextInSeconds = 300,
  onRefresh,
  size = 'sm',
  label = 'NEXT UPDATE',
  showClockToggle = true,
  className = '',
}) {
  const [mode, setMode] = useState('countdown'); // 'countdown' | 'clock'
  const [secondsLeft, setSecondsLeft] = useState(nextInSeconds ?? 300);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [isSyncing, setIsSyncing] = useState(false);

  // Sync state whenever the prop changes
  useEffect(() => {
    if (typeof nextInSeconds === 'number' && !isNaN(nextInSeconds)) {
      setSecondsLeft(Math.max(0, nextInSeconds));
    }
  }, [nextInSeconds]);

  // 1-second interval ticker for countdown and clock
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());

      setSecondsLeft((prev) => {
        if (prev <= 1) {
          // Trigger refresh when countdown hits zero
          if (onRefresh && !isSyncing) {
            setIsSyncing(true);
            try {
              onRefresh();
            } finally {
              setTimeout(() => setIsSyncing(false), 2000);
            }
          }
          return 300; // Reset to standard 5-min cycle while waiting for server response
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [onRefresh, isSyncing]);

  const displayString = useMemo(() => {
    if (isSyncing) return 'SYNC';
    if (mode === 'clock') return formatLiveIST(currentTime);
    return formatSecondsToHHMMSS(secondsLeft);
  }, [mode, isSyncing, currentTime, secondsLeft]);

  const handleToggleOrSync = () => {
    if (showClockToggle) {
      setMode((m) => (m === 'countdown' ? 'clock' : 'countdown'));
    } else if (onRefresh) {
      onRefresh();
    }
  };

  const currentLabel =
    isSyncing
      ? 'SYNCING NOW'
      : mode === 'clock'
      ? 'LIVE IST CLOCK'
      : label;

  const hint = mode === 'countdown' ? 'IST CLOCK →' : 'COUNTDOWN →';

  return (
    <div
      className={`led-timer-chassis led-size-${size} ${className}`}
      onClick={handleToggleOrSync}
      title={`${currentLabel}: ${displayString}. Click to ${
        showClockToggle ? 'toggle view / ' : ''
      }force sync nowcast`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleToggleOrSync();
      }}
    >
      <div className="led-timer-header">
        <div className="led-timer-indicator">
          <span className="led-timer-dot" />
          <span>{currentLabel}</span>
        </div>
        {showClockToggle && <span className="led-timer-mode-hint">{hint}</span>}
      </div>

      <div className="led-display-row">
        {displayString.split('').map((char, index) => {
          if (char === ':') {
            return <LedColon key={`colon-${index}`} />;
          }
          return <SevenSegmentDigit key={`char-${index}`} char={char} />;
        })}
      </div>
    </div>
  );
}
