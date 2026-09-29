import { formatIST } from '../utils/api.js';
import { IconPlay, IconPause } from './icons.jsx';

export default function TimeSlider({
  leadMin,
  onChange,
  validTimeISO,
  playing,
  onPlayToggle,
  t,
}) {
  return (
    <div className="time-slider">
      <button
        className="play-btn"
        onClick={onPlayToggle}
        title={playing ? t.pause : t.play}
        aria-label={playing ? t.pause : t.play}
      >
        {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
      </button>
      <div className="slider-body">
        <div className="slider-top">
          <span className="slider-label">{t.forecastLead}</span>
          <span className="slider-lead">
            {leadMin === 0 ? (
              t.now
            ) : (
              <span className="grad-text">T+{leadMin} {t.minutes}</span>
            )}
          </span>
          <span className="slider-valid">
            {t.validTime}: {formatIST(validTimeISO)}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="360"
          step="15"
          value={leadMin}
          onChange={(e) => onChange(Number(e.target.value))}
          className="lead-range"
          aria-label={t.forecastLead}
        />
        <div className="slider-ticks">
          {[0, 60, 120, 180, 240, 300, 360].map((m) => (
            <span key={m}>{m === 0 ? t.now : `+${m / 60}h`}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
