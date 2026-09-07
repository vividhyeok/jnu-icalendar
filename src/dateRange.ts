export const TIME_ZONE = 'Asia/Seoul';
const DAY = 86_400_000;

export function getSyncRange(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid sync date');
  const today = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [year, month] = today.split('-').map(Number);
  const spring = month >= 3 && month <= 8;
  const semesterStart = spring ? `${year}-03-01` : `${month <= 2 ? year - 1 : year}-09-01`;
  const semesterYear = month <= 2 ? year : year + 1;
  const semesterEnd = spring
    ? `${year}-08-31`
    : `${semesterYear}-02-${new Date(Date.UTC(semesterYear, 2, 0)).getUTCDate()}`;
  const startMidnight = Date.parse(semesterStart + 'T00:00:00Z');
  const endMidnight = Date.parse(semesterEnd + 'T00:00:00Z');
  const format = (value: number) => new Date(value).toISOString().slice(0, 10);
  const start = format(startMidnight - 7 * DAY);
  const end = format(endMidnight);
  const timeMax = format(endMidnight + DAY);
  return {
    start: start.replace(/-/g, ''),
    end: end.replace(/-/g, ''),
    timeMin: start + 'T00:00:00+09:00',
    timeMax: timeMax + 'T00:00:00+09:00',
  };
}
export type SyncRange = ReturnType<typeof getSyncRange>;
