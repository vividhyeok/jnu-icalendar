export const TIME_ZONE = 'Asia/Seoul';
const DAY = 86_400_000;
export function getSyncRange(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid sync date');
  const today = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const midnight = Date.parse(today + 'T00:00:00Z');
  const day = (offset: number) => new Date(midnight + offset * DAY).toISOString().slice(0, 10);
  // A week of corrections and six weeks of upcoming classes; no semester settings.
  return {
    start: day(-7).replace(/-/g, ''),
    end: day(42).replace(/-/g, ''),
    timeMin: day(-7) + 'T00:00:00+09:00',
    timeMax: day(43) + 'T00:00:00+09:00',
  };
}
export type SyncRange = ReturnType<typeof getSyncRange>;
