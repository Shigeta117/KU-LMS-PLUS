'use client';

import { useEffect } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export const THEME_KEY = 'ku-theme';

export function applyTheme(pref: ThemePreference) {
  const isDark =
    pref === 'dark' ||
    (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
}

export default function ThemeProvider() {
  useEffect(() => {
    const stored = (localStorage.getItem(THEME_KEY) ?? 'system') as ThemePreference;
    applyTheme(stored);

    // system モードのときはOS設定変更をリッスン
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const current = (localStorage.getItem(THEME_KEY) ?? 'system') as ThemePreference;
      if (current === 'system') applyTheme('system');
    };
    mq.addEventListener('change', handler);

    // Service Worker 登録
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    return () => mq.removeEventListener('change', handler);
  }, []);

  return null;
}
