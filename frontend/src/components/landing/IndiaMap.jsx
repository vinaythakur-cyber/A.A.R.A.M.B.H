/* Simplified, stylised India silhouette — hand-drawn, no external map data.
   Points are [lon, lat]; projected to a 0..100 viewBox. */

const OUTLINE = [
  [68.2, 23.7], [69.7, 22.3], [69.0, 21.1], [70.3, 20.7], [72.5, 21.6],
  [72.9, 20.6], [72.7, 19.0], [73.4, 16.2], [74.2, 14.4], [74.8, 13.0],
  [75.4, 11.6], [76.2, 10.0], [77.3, 8.1], [78.2, 9.1], [79.3, 10.3],
  [80.3, 11.9], [80.3, 13.6], [80.2, 15.9], [81.5, 16.6], [82.3, 18.3],
  [84.0, 19.2], [86.4, 20.1], [87.1, 21.0], [88.1, 21.6], [89.0, 21.9],
  [88.6, 22.6], [88.0, 23.6], [89.8, 24.4], [90.6, 23.8], [92.2, 23.4],
  [92.9, 22.4], [93.6, 23.9], [94.6, 25.6], [95.2, 27.3], [96.2, 27.8],
  [97.4, 28.2], [96.2, 29.3], [94.6, 29.5], [93.0, 28.3], [91.0, 27.9],
  [89.9, 27.6], [88.9, 28.0], [87.0, 28.3], [85.0, 28.4], [83.0, 28.6],
  [81.0, 28.9], [80.3, 29.8], [79.5, 30.7], [78.9, 31.5], [77.8, 32.4],
  [76.5, 33.2], [75.6, 34.3], [74.5, 34.6], [73.9, 34.4], [73.5, 33.2],
  [74.0, 32.2], [74.6, 31.3], [73.9, 30.3], [72.9, 29.4], [71.6, 28.6],
  [70.9, 27.4], [70.2, 26.1], [69.6, 25.0], [68.9, 24.3], [68.2, 23.7],
];

const LON0 = 68, LON1 = 98, LAT0 = 6, LAT1 = 38;

export function project(lon, lat) {
  return [
    ((lon - LON0) / (LON1 - LON0)) * 100,
    ((LAT1 - lat) / (LAT1 - LAT0)) * 100,
  ];
}

export function indiaPath() {
  return OUTLINE.map(([lo, la]) => project(lo, la).join(',')).join(' ');
}

export function indiaBounds() {
  return { lonMin: LON0, lonMax: LON1, latMin: LAT0, latMax: LAT1 };
}

/** Static SVG silhouette used across the landing page. */
export default function IndiaMap({ className = '', glow = true }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={`india-svg ${className}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="br-india-glow" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#818cf8" stopOpacity="0.22" />
          <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.07" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="br-india-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#38bdf8" stopOpacity="0.10" />
          <stop offset="1" stopColor="#818cf8" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {glow && <rect x="0" y="0" width="100" height="100" fill="url(#br-india-glow)" />}
      <polygon
        points={indiaPath()}
        fill="url(#br-india-fill)"
        stroke="#5b6cff"
        strokeOpacity="0.55"
        strokeWidth="0.45"
        strokeLinejoin="round"
      />
    </svg>
  );
}
