import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

import { get, put } from './api';
import { applyLanguage, storedLanguage, type Language } from '../i18n';

export type FontSize = 'small' | 'normal' | 'large';
export type Contrast = 'light' | 'normal' | 'dark' | 'contrast';

export interface DisplayPreferences {
  language: Language;
  fontSize: FontSize;
  contrast: Contrast;
}

interface DisplayValue extends DisplayPreferences {
  setLanguage: (value: Language) => void;
  setFontSize: (value: FontSize) => void;
  setContrast: (value: Contrast) => void;
}

const FONT_KEY = 'kortex_support_font_size';
const CONTRAST_KEY = 'kortex_support_contrast';

const DisplayContext = createContext<DisplayValue | null>(null);

function read<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const stored = localStorage.getItem(key) as T | null;
    if (stored && allowed.includes(stored)) return stored;
  } catch {
    /* private browsing */
  }
  return fallback;
}

const FONT_SIZES: FontSize[] = ['small', 'normal', 'large'];
const CONTRASTS: Contrast[] = ['light', 'normal', 'dark', 'contrast'];

/** Applied to <html> so the very first paint is already correct — the value is
 *  read from localStorage synchronously, before React mounts. */
function applyAttribute(name: string, value: string, isDefault: boolean): void {
  const root = document.documentElement;
  if (isDefault) root.removeAttribute(name);
  else root.setAttribute(name, value);
}

export function DisplayProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [language, setLanguageState] = useState<Language>(storedLanguage);
  const [fontSize, setFontSizeState] = useState<FontSize>(
    () => read(FONT_KEY, 'normal', FONT_SIZES));
  const [contrast, setContrastState] = useState<Contrast>(
    () => read(CONTRAST_KEY, 'normal', CONTRASTS));

  useEffect(() => {
    applyAttribute('data-font-size', fontSize, fontSize === 'normal');
    try {
      if (fontSize === 'normal') localStorage.removeItem(FONT_KEY);
      else localStorage.setItem(FONT_KEY, fontSize);
    } catch { /* private browsing */ }
  }, [fontSize]);

  useEffect(() => {
    applyAttribute('data-contrast', contrast, contrast === 'normal');
    try {
      if (contrast === 'normal') localStorage.removeItem(CONTRAST_KEY);
      else localStorage.setItem(CONTRAST_KEY, contrast);
    } catch { /* private browsing */ }
  }, [contrast]);

  useEffect(() => {
    void i18n.changeLanguage(language);
    applyLanguage(language);
  }, [language, i18n]);

  // Preferences follow the user between devices. A failure here is harmless:
  // the local value already applied, and the server copy is a convenience.
  const persist = useCallback((next: Partial<DisplayPreferences>) => {
    void put('/me/preferences', {
      language: next.language ?? language,
      font_size: next.fontSize ?? fontSize,
      contrast: next.contrast ?? contrast,
    }).catch(() => undefined);
  }, [language, fontSize, contrast]);

  const value = useMemo<DisplayValue>(() => ({
    language,
    fontSize,
    contrast,
    setLanguage: (next) => { setLanguageState(next); persist({ language: next }); },
    setFontSize: (next) => { setFontSizeState(next); persist({ fontSize: next }); },
    setContrast: (next) => { setContrastState(next); persist({ contrast: next }); },
  }), [language, fontSize, contrast, persist]);

  return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>;
}

export function useDisplay(): DisplayValue {
  const context = useContext(DisplayContext);
  if (!context) throw new Error('useDisplay must be used inside DisplayProvider');
  return context;
}

/** Pulls the signed-in user's saved preferences once, after login, and adopts
 *  them if they differ from what this device had. */
export function useSyncDisplayPreferences(enabled: boolean): void {
  const { language, fontSize, contrast, setLanguage, setFontSize, setContrast } = useDisplay();

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void get<{ language: Language; font_size: FontSize; contrast: Contrast }>('/me/preferences')
      .then((saved) => {
        if (!active) return;
        if (saved.language && saved.language !== language) setLanguage(saved.language);
        if (saved.font_size && saved.font_size !== fontSize) setFontSize(saved.font_size);
        if (saved.contrast && saved.contrast !== contrast) setContrast(saved.contrast);
      })
      .catch(() => undefined);
    return () => { active = false; };
    // Runs once per sign-in; re-running on every preference change would fight
    // the user's own edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
