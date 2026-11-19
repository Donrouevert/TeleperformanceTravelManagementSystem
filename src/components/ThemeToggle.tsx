import { Moon, Sun } from 'lucide-react';
import { Toaster } from 'sonner';
import { setTheme, useTheme } from '../lib/theme';
export function ThemeToggle() {
  const theme = useTheme(), dark = theme === 'dark';
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
  return <button type="button" className="icon-btn theme-toggle" aria-label={label} title={label} aria-pressed={dark} onClick={() => setTheme(dark ? 'light' : 'dark')}><span className="theme-toggle-icons" aria-hidden="true"><Moon className="theme-icon theme-moon" size={18}/><Sun className="theme-icon theme-sun" size={19}/></span></button>;
}
export function ThemeToaster() { const theme = useTheme(); return <Toaster theme={theme} position="top-right" richColors/>; }
