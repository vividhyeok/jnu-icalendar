import { Value } from '@sinclair/typebox/value';
import { Type, Static } from '@sinclair/typebox';

const LectureTObject = Type.Object({
  estblScyr: Type.String({ description: '개설연도', examples: ['2024'] }),
  lsnYmd: Type.String({ description: '강의 일시', examples: ['20240912'] }),
  sbjctNm: Type.String({
    description: '강의 이름',
    examples: ['디지털영상처리'],
  }),
  cclctYn: Type.String({
    examples: ['Y', 'N'],
  }),
  splctYn: Type.String({
    examples: ['Y', 'N'],
  }),
  aftrSplctLttmSe: Type.Union([Type.String(), Type.Null()], {
    description: '수업 방법',
    examples: [null, '91'],
  }),
  untactLsnMthdSe: Type.Union([Type.String(), Type.Null()], {
    description: '수업 방법',
    examples: [null, '91'],
  }),
  lctrmNm: Type.Union([Type.String(), Type.Null()], {
    description: '강의실 위치',
    examples: ['공과4호D417'],
  }),
  empno: Type.String(),
  empnm: Type.String({ description: '교수 이름' }),
  bgngHr: Type.Union([Type.String(), Type.Null()], {
    description: '시작 시간',
    examples: ['14:00'],
  }),
  endHr: Type.Union([Type.String(), Type.Null()], {
    description: '시작 시간',
    examples: ['14:50'],
  }),
});

export const ResponseTObject = Type.Object({
  classTables: Type.Array(LectureTObject),
});

export type Lecture = Static<typeof LectureTObject>;

export function parsePortalResponse(text: string): Lecture[] {
  let json: unknown;
  try { json = JSON.parse(text); }
  catch { throw new Error('Portal response is not JSON; check authentication'); }
  // No coercion/defaults: a missing classTables must never become [].
  if (!Value.Check(ResponseTObject, json)) throw new Error('Portal schema error: invalid timetable payload');
  for (const row of json.classTables) {
    const date = row.lsnYmd;
    const iso = date.slice(0,4) + '-' + date.slice(4,6) + '-' + date.slice(6,8);
    const parsed = new Date(iso + 'T00:00:00Z');
    if (!/^\d{8}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== iso
      || !['Y','N'].includes(row.cclctYn) || !['Y','N'].includes(row.splctYn)
      || !row.sbjctNm.trim()) throw new Error('Portal schema error: invalid lecture fields');
    if (row.cclctYn === 'Y' && !row.aftrSplctLttmSe?.startsWith('9') && row.bgngHr === null && row.endHr === null) continue;
    if (!row.bgngHr || !row.endHr || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.bgngHr)
      || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.endHr) || row.bgngHr >= row.endHr) {
      throw new Error('Portal schema error: invalid lecture time');
    }
  }
  return json.classTables;
}
