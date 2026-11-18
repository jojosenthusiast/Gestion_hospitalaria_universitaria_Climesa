// MA-OPS-01: whether the API answered recently, so "El servidor se está activando" shows only when it may be asleep.
// Kept apart from `cold-start.ts` so `api.ts` can report answers without an import cycle.

/** Render sleeps the API after about 15 minutes idle (Android `ColdStart.IDLE_UNTIL_COLD_MS`, iOS `idleUntilCold`). */
export const IDLE_UNTIL_COLD_MS = 14 * 60_000;

/**
 * The server is plausibly asleep when nothing answered yet in this tab, nothing answered for `IDLE_UNTIL_COLD_MS`, or a
 * call failed without an answer (network or 502-504) after the last answer. Same rule as Android and iOS.
 */
export function isLikelyCold(lastAnswerAt: number | undefined, failedSinceAnswer: boolean, now: number) {
  return failedSinceAnswer || lastAnswerAt === undefined || now - lastAnswerAt > IDLE_UNTIL_COLD_MS;
}

const warmth = { lastAnswerAt: undefined as number | undefined, failedSinceAnswer: false };
/** `HttpApi` reports every response: a status outside 502-504 means the API itself answered. */
export function recordServerAnswer(status: number, now = Date.now()) {
  if (status >= 502 && status <= 504) { warmth.failedSinceAnswer = true; return; }
  warmth.lastAnswerAt = now;
  warmth.failedSinceAnswer = false;
}
export function recordServerFailure() { warmth.failedSinceAnswer = true; }
export const serverLikelyCold = (now = Date.now()) => isLikelyCold(warmth.lastAnswerAt, warmth.failedSinceAnswer, now);
/** Tests only. */
export function resetServerWarmth() { warmth.lastAnswerAt = undefined; warmth.failedSinceAnswer = false; }
