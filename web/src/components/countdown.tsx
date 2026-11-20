import { useEffect, useState } from 'react';

/** Whole seconds left until `deadline` (epoch ms), never below zero. */
export const secondsLeft = (deadline: number, now = Date.now()) => Math.max(0, Math.ceil((deadline - now) / 1000));

/**
 * Audit D45: a held action («No se presentó», «No asistió») says how long is left to undo it. A one-second timer only
 * repaints this text; it never fetches data.
 */
export function HoldCountdown({ deadline, what }: { deadline: number; what: string }) {
  const [, repaint] = useState(0);
  const left = secondsLeft(deadline);
  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => repaint(value => value + 1), 1000);
    return () => clearTimeout(timer);
  });
  return <small>Se marcará «{what}» en <strong className="mono-data">{left}</strong> s.</small>;
}
