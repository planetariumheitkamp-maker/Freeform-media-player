import { useEffect, useRef } from 'react';

export const GUIDE_ACTION_EVENT = 'freeform:open-guide-target';

export const GUIDE_TARGETS = [
  'sources',
  'players',
  'quick-geometry',
  'advanced-mesh',
  'trace-border',
  'trace-interior',
  'trace-settings',
  'output',
  'grid',
  'present',
  'media-appearance',
  'color-light',
  'live-ai',
  'planetarium-setup',
  'planetarium-calibration',
  'planetarium-installation',
  'planetarium-preview',
  'saves',
  'history',
  'recovery',
] as const;

export type GuideTarget = (typeof GUIDE_TARGETS)[number];

export function requestGuideTarget(target: GuideTarget) {
  window.dispatchEvent(new CustomEvent<GuideTarget>(GUIDE_ACTION_EVENT, { detail: target }));
  window.setTimeout(() => {
    const element = document.querySelector<HTMLElement>(`[data-guide-target="${target}"]`);
    if (!element) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' });
    element.classList.add('guide-target-highlight');
    if (element.matches('button, input, select, textarea, [tabindex]')) element.focus({ preventScroll: true });
    window.setTimeout(() => element.classList.remove('guide-target-highlight'), 1800);
  }, 80);
}

export function useGuideTarget(target: GuideTarget | readonly GuideTarget[], handler: (target: GuideTarget) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const targetKey = typeof target === 'string' ? target : target.join('|');

  useEffect(() => {
    const targets = targetKey.split('|');
    const listen = (event: Event) => {
      const requested = (event as CustomEvent<GuideTarget>).detail;
      if (targets.includes(requested)) handlerRef.current(requested);
    };
    window.addEventListener(GUIDE_ACTION_EVENT, listen);
    return () => window.removeEventListener(GUIDE_ACTION_EVENT, listen);
  }, [targetKey]);
}
