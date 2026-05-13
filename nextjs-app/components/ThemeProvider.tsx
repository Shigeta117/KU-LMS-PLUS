'use client';

import { useEffect } from 'react';

// Service Worker の登録のみ担当（テーマ制御は next-themes に委譲）
export default function ServiceWorkerInit() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return null;
}
