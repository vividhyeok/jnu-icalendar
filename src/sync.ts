import { readConfig } from './env';
import { getSyncRange } from './dateRange';
import { fetchPortalLectures } from './portalClient';
import { syncGoogleCalendar } from './googleCalendar';
import { notifyDiscord } from './notify';
export async function runSync() {
  let stage = 'configuration';
  try {
    console.info('Sync started');
    readConfig();
    const range = getSyncRange();
    console.info('Sync range: ' + range.start + '–' + range.end + ' (Asia/Seoul)');
    stage = 'portal';
    const lectures = await fetchPortalLectures(range);
    console.info('Portal fetch succeeded: ' + lectures.length + ' lecture rows');
    stage = 'calendar';
    const { inserted, deleted } = await syncGoogleCalendar(lectures, range);
    console.info('Calendar diff: ' + inserted + ' changed, ' + deleted + ' removed');
    if (inserted || deleted) await notifyDiscord('JNU 시간표 변경: 추가/수정 ' + inserted + '개, 삭제 ' + deleted + '개. 캘린더를 확인하세요.');
    console.info('Sync completed');
    return 0;
  } catch (error) {
    // Never serialize transport errors, headers, response bodies or browser stacks.
    const message = error instanceof Error && /^(Missing environment variable: |Destructive sync blocked|Portal authentication failed|Portal schema error|Portal response is not JSON|Google Calendar API request failed|Google authentication failed|Google authentication timeout|Portal HTTP)/.test(error.message)
      ? error.message : 'External request failed (authentication, permission, network or timeout)';
    console.error('Sync failed at ' + stage + ': ' + message);
    if (stage !== 'calendar') console.error('Calendar mutation skipped');
    await notifyDiscord('JNU 시간표 동기화 실패 (' + stage + '). Cloud Run 실행 로그를 확인하세요.');
    return 1;
  }
}
