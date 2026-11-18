/**
 * Handler for `HttpApi`'s 401 callback. The first 401 tries `renew` once; requests that fail together share that one
 * attempt. A failed renewal, or a 401 after a renewal, calls `expire` (sign out with the expired-session notice).
 */
export function renewOnce(renew: () => Promise<boolean>, expire: () => void) {
  let pending: Promise<boolean> | null = null;
  let ended = false;
  const end = () => { if (!ended) { ended = true; expire(); } return false; };
  return async (afterRenewal: boolean): Promise<boolean> => {
    if (ended) return false;
    if (afterRenewal) return end();
    pending ??= renew().finally(() => { pending = null; });
    return (await pending) || end();
  };
}
