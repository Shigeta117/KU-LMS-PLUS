import { useEffect, useRef } from 'react';

const THRESHOLD = 72; // px

export function usePullToRefresh(onRefresh: () => void, enabled = true) {
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);
  const indicator = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled) return;

    function onTouchStart(e: TouchEvent) {
      if (window.scrollY === 0) {
        startY.current = e.touches[0].clientY;
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) return;

      // スクロールが上端のときだけ引っ張りを受け付ける
      if (window.scrollY > 0) { startY.current = null; return; }

      const progress = Math.min(dy / THRESHOLD, 1);
      if (!indicator.current) return;
      indicator.current.style.opacity = String(progress);
      indicator.current.style.transform = `translateY(${Math.min(dy * 0.4, 30)}px) scale(${0.6 + 0.4 * progress})`;
      pulling.current = dy >= THRESHOLD;
    }

    function onTouchEnd() {
      if (pulling.current) onRefresh();
      pulling.current = false;
      startY.current = null;
      if (indicator.current) {
        indicator.current.style.opacity = '0';
        indicator.current.style.transform = 'translateY(0) scale(0.6)';
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd);
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [onRefresh, enabled]);

  return indicator;
}
