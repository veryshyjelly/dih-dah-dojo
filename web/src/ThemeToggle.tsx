import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';
declare global {
  interface Window {
    dojoTheme: { setTheme: (theme: Theme) => void };
  }
}
function subscribe(onChange: () => void) {
  window.addEventListener('dojo-theme-change', onChange);
  return () => window.removeEventListener('dojo-theme-change', onChange);
}
function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot);
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button
      className="icon-button theme-toggle"
      aria-label={label}
      title={label}
      aria-pressed={theme === 'dark'}
      onClick={() => window.dojoTheme.setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? (
        <Sun size={19} aria-hidden="true" />
      ) : (
        <Moon size={19} aria-hidden="true" />
      )}
    </button>
  );
}
