const LS_KEY = 'bhoomirakshak_alerts_v1';

export function loadArmed() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveArmed(map) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable — alert state stays in memory */
  }
}
