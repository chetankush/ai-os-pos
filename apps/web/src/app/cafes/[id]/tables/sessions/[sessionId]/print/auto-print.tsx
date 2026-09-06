'use client';

import { useEffect } from 'react';

/**
 * Fires the browser print dialog once after the page paints. Closes the window
 * after print so popups opened from "Print bill" don't pile up. Kept tiny on
 * purpose — the actual bill markup is server-rendered in the parent route.
 */
export function AutoPrint() {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 100);
    const onAfter = () => {
      // Only attempt to close popups; close() is a no-op on top-level tabs in
      // modern browsers — the user can just Cmd-W.
      try {
        window.close();
      } catch {
        // ignore
      }
    };
    window.addEventListener('afterprint', onAfter);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', onAfter);
    };
  }, []);
  return null;
}
