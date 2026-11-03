import { useEffect, useState } from 'react';
import { Icon, Segmented } from './ui';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'mybuffer_theme';
const listeners = new Set<(t: ThemePref) => void>();

export function getTheme(): ThemePref {
  try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; }
}
const mq = () => window.matchMedia('(prefers-color-scheme: dark)');
const isDark = (t: ThemePref) => t === 'dark' || (t === 'system' && mq().matches);

function apply(t: ThemePref) {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  // keep the status bar / Safari chrome in step with the chosen theme
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = isDark(t) ? '#000000' : '#f2f2f7';
  document.head.appendChild(meta);
}

export function setTheme(t: ThemePref) {
  try { if (t === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* */ }
  apply(t);
  listeners.forEach((l) => l(t));
}

export function useTheme(): [ThemePref, (t: ThemePref) => void] {
  const [t, setT] = useState<ThemePref>(getTheme);
  useEffect(() => {
    listeners.add(setT);
    // when following the system, react live to iOS switching Light/Dark (incl. Automatic at sunset)
    const onChange = () => getTheme() === 'system' && apply('system');
    mq().addEventListener?.('change', onChange);
    return () => { listeners.delete(setT); mq().removeEventListener?.('change', onChange); };
  }, []);
  return [t, setTheme];
}

export function initTheme() { apply(getTheme()); }

export function ThemePicker() {
  const [t, set] = useTheme();
  return <Segmented value={t} onChange={set} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />;
}

/** One-tap toggle for the Home header: flips between light and dark. */
export function ThemeButton() {
  const [t, set] = useTheme();
  const dark = isDark(t);
  return (
    <button className="icon-btn" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => set(dark ? 'light' : 'dark')}>
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  );
}
