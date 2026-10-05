// Whether the first-visit intro has been seen. The intro reads it to open; the Bezel dial reads
// it so a page's dial waits while the intro's dial holds the shared 3D engine.

export const WALKTHROUGH_KEY = "arisan.walkthrough.v1";

// Remembered in memory too, so it stays closed if storage is unavailable (private mode).
let dismissed = false;
const listeners = new Set<() => void>();

export function introSeen() {
  if (dismissed) return true;
  try {
    return localStorage.getItem(WALKTHROUGH_KEY) !== null;
  } catch {
    return true;
  }
}

export function markIntroSeen() {
  dismissed = true;
  try {
    localStorage.setItem(WALKTHROUGH_KEY, "done");
  } catch {}
  listeners.forEach((l) => l());
}

export function subscribeIntro(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
