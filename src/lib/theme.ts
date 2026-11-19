import { useSyncExternalStore } from 'react';
export type Theme = 'light' | 'dark';
export const THEME_KEY = 'teleperformance-travel-theme';
const themeEvent = 'travel-theme-change';
let transitionTimer: ReturnType<typeof setTimeout> | undefined;
function storedTheme(): Theme | null {
  try { const value = localStorage.getItem(THEME_KEY); return value === 'dark' || value === 'light' ? value : null; } catch { return null; }
}
export function preferredTheme(): Theme {
  return storedTheme() ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function applyTheme(theme: Theme, animate = false) {
  const root = document.documentElement;
  if (transitionTimer) clearTimeout(transitionTimer);
  root.classList.remove('theme-switching');
  if (animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('theme-switching');
    transitionTimer = setTimeout(() => root.classList.remove('theme-switching'), 280);
  }
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#230D2E' : '#ffffff');
  window.dispatchEvent(new Event(themeEvent));
}
export function initializeTheme() { applyTheme(preferredTheme()); }
export function setTheme(theme: Theme) {
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* Switching still works when browser storage is unavailable. */ }
  applyTheme(theme, true);
}
function subscribe(callback: () => void) {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const systemChanged = () => { if (!storedTheme()) applyTheme(preferredTheme()); };
  const storageChanged = (event: StorageEvent) => { if (event.key === THEME_KEY || event.key === null) applyTheme(preferredTheme()); };
  window.addEventListener(themeEvent, callback);
  window.addEventListener('storage', storageChanged);
  media?.addEventListener?.('change', systemChanged);
  return () => { window.removeEventListener(themeEvent, callback); window.removeEventListener('storage', storageChanged); media?.removeEventListener?.('change', systemChanged); };
}
const snapshot = (): Theme => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
export function useTheme(): Theme { return useSyncExternalStore(subscribe, snapshot, () => 'light'); }
