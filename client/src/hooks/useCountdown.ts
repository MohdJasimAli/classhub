import { useEffect, useState } from 'react';

/**
 * A live, self-correcting countdown.
 *
 * The value is *derived during render* from a `now` timestamp that the effect
 * keeps fresh, rather than being pushed into state from inside the effect body.
 * That avoids a cascading render on every retarget, and it means the displayed
 * value is always consistent with the most recent tick.
 *
 * The tick granularity adapts: once under an hour it counts seconds, beyond
 * that a 30-second cadence is plenty, and both resync against the wall clock
 * on every tick so drift and background-tab throttling cannot accumulate.
 */
export function useCountdown(targetIso: string | number | Date | null | undefined): number {
  const targetMs = targetIso === null || targetIso === undefined ? 0 : new Date(targetIso).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!targetIso) return undefined;

    // 1s precision inside the final hour, otherwise a cheap 30s tick.
    const tick = () => {
      const current = Date.now();
      setNow(current);
      const remaining = targetMs - current;
      const interval = remaining > 3_600_000 ? 30_000 : 1_000;
      timer = window.setTimeout(tick, interval);
    };

    let timer = window.setTimeout(tick, 1_000);
    return () => window.clearTimeout(timer);
  }, [targetIso, targetMs]);

  if (!targetIso) return 0;
  return Math.max(0, targetMs - now);
}

/** Debounces a rapidly changing value (e.g. a search box). */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
