/* Inline SVG icon set — no emoji in UI chrome. */

function base(props, children) {
  const { size = 18, ...rest } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Logo = (p) => (
  <svg width={p.size || 26} height={p.size || 26} viewBox="0 0 32 32" aria-hidden="true">
    <defs>
      <linearGradient id="br-logo-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#38bdf8" />
        <stop offset="0.55" stopColor="#818cf8" />
        <stop offset="1" stopColor="#c084fc" />
      </linearGradient>
    </defs>
    <path
      d="M16 2 L28 8 V16 C28 24 22 28.5 16 30 C10 28.5 4 24 4 16 V8 Z"
      fill="url(#br-logo-g)"
      opacity="0.92"
    />
    <path
      d="M17.5 7 L9.5 17.5 H15 L14.5 25 L22.5 13.5 H16.8 Z"
      fill="#050507"
      opacity="0.85"
    />
  </svg>
);

export const IconPlay = (p) => base(p, <polygon points="7 4 20 12 7 20" fill="currentColor" stroke="none" />);
export const IconPause = (p) => base(p, <><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" /></>);
export const IconBell = (p) => base(p, <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>);
export const IconCheck = (p) => base(p, <polyline points="20 6 9 17 4 12" />);
export const IconAlert = (p) => base(p, <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>);
export const IconArrowLeft = (p) => base(p, <><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>);
export const IconArrowRight = (p) => base(p, <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>);
export const IconBolt = (p) => base(p, <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />);
export const IconHail = (p) => base(p, <><circle cx="12" cy="5" r="2.2" /><circle cx="6" cy="12" r="2.2" /><circle cx="18" cy="12" r="2.2" /><circle cx="9" cy="19" r="2.2" /><circle cx="15" cy="19" r="2.2" /></>);
export const IconWind = (p) => base(p, <><path d="M9.6 4.6A2 2 0 1 1 11 8H2" /><path d="M12.6 19.4A2 2 0 1 0 14 16H2" /><path d="M17.7 7.6A2.5 2.5 0 1 1 19.5 12H2" /></>);
export const IconRain = (p) => base(p, <><path d="M20 16.6A5 5 0 0 0 18 7h-1.3A7 7 0 1 0 5 15.7" /><line x1="8" y1="18" x2="8" y2="21" /><line x1="12" y1="17" x2="12" y2="20" /><line x1="16" y1="18" x2="16" y2="21" /></>);
export const IconLayers = (p) => base(p, <><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 12 12 17 22 12" /><polyline points="2 17 12 22 22 17" /></>);
export const IconRadar = (p) => base(p, <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" /><line x1="12" y1="12" x2="19" y2="5" /></>);
export const IconGlobe = (p) => base(p, <><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>);
export const IconClock = (p) => base(p, <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>);
export const IconMenu = (p) => base(p, <><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></>);
export const IconX = (p) => base(p, <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>);
export const IconShield = (p) => base(p, <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />);

export const HAZARD_ICON = {
  lightning: IconBolt,
  hail: IconHail,
  downburst: IconWind,
  cloudburst: IconRain,
};
