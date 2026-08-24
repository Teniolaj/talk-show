// Single-instance, in-memory sliding-window limiter. Good enough for this
// app's current single-server deployment — it resets on restart and doesn't
// coordinate across instances, so swap it for a shared store (e.g. Redis)
// before running multiple server instances behind a load balancer.
const requestLog = new Map<string, number[]>();

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const windowStart = now - windowMs;

  const timestamps = (requestLog.get(key) ?? []).filter((ts) => ts > windowStart);
  timestamps.push(now);
  requestLog.set(key, timestamps);

  return timestamps.length > limit;
}
