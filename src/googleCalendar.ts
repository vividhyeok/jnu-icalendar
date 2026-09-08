import crypto from 'node:crypto';

import type { Lecture } from './response';
import { buildCalendarEvents } from './googleEvents';
import { readConfig } from './env';
import { getAccessToken } from './googleAuth';
import { getSyncRange, type SyncRange } from './dateRange';
import { withRetry } from './retry';

const MANAGED_BY = 'jnu-google-calendar-sync';
class GoogleApiError extends Error {
  constructor(readonly status: number) {
    super('Google Calendar API request failed (HTTP ' + status + ')');
  }
}
async function googleRequest(path: string, init: RequestInit = {}) {
  return withRetry(
    async () => {
      const token = await getAccessToken();
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/${path}`,
        {
          ...init,
          signal: AbortSignal.timeout(20_000),
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(init.headers as Record<string, string> | undefined),
          },
        }
      );

      if (!response.ok) {
        await response.body?.cancel();
        throw new GoogleApiError(response.status);
      }

      return response;
    },
    {
      retries: 2,
      delayMs: 1000,
      shouldRetry(error) {
        if (!(error instanceof GoogleApiError)) return error instanceof Error && /timeout|fetch failed|ECONNRESET/i.test(error.message);
        return error.status === 429 || error.status >= 500;
      },
      onRetry(_error, attempt) { console.warn('Google API transient failure; retry ' + attempt); },
    }
  );
}

type CalendarEventLite = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  extendedProperties?: { private?: { managedBy?: string; sourceKey?: string } };
};

function toEventId(sourceKey: string) {
  const digest = crypto
    .createHash('sha256')
    .update(sourceKey)
    .digest('hex')
    .slice(0, 48);
  return `jnu${digest}`;
}

async function listManagedEventsBetween(timeMin: string, timeMax: string) {
  const calendarId = encodeURIComponent(readConfig().calendarId);
  const managedEvents: CalendarEventLite[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      maxResults: '2500',
      orderBy: 'startTime',
      privateExtendedProperty: `managedBy=${MANAGED_BY}`,
    });
    if (pageToken) params.set('pageToken', pageToken);

    const response = await googleRequest(
      `calendars/${calendarId}/events?${params.toString()}`
    );
    const body = (await response.json()) as {
      nextPageToken?: string;
      items?: CalendarEventLite[];
    };
    if (!Array.isArray(body.items ?? [])) throw new Error('Invalid Calendar list response');
    managedEvents.push(...(body.items ?? []).filter(event =>
      event.extendedProperties?.private?.managedBy === MANAGED_BY
      && event.start?.dateTime && event.end?.dateTime
      && Date.parse(event.start.dateTime) >= Date.parse(timeMin)
      && Date.parse(event.end.dateTime) <= Date.parse(timeMax)
    ));

    pageToken = body.nextPageToken;
  } while (pageToken);

  return managedEvents;
}

function isSameEvent(
  remote: CalendarEventLite | undefined,
  local: ReturnType<typeof buildCalendarEvents>[number]
) {
  if (!remote) return false;
  return (
    remote.summary === local.summary &&
    (remote.description ?? '') === local.description &&
    (remote.location ?? '') === (local.location ?? '') &&
    Date.parse(remote.start?.dateTime ?? '') === Date.parse(local.start.dateTime) &&
    Date.parse(remote.end?.dateTime ?? '') === Date.parse(local.end.dateTime)
  );
}

async function upsertEvents(
  events: ReturnType<typeof buildCalendarEvents>,
  remoteById: Map<string, CalendarEventLite>
) {
  const calendarId = encodeURIComponent(readConfig().calendarId);
  let inserted = 0;

  for (const event of events) {
    const eventId = toEventId(event.sourceKey);
    const body = {
      summary: event.summary,
      description: event.description,
      start: event.start,
      end: event.end,
      ...(event.location ? { location: event.location } : {}),
      extendedProperties: {
        private: {
          managedBy: MANAGED_BY,
          sourceKey: event.sourceKey,
        },
      },
    };

    if (remoteById.has(eventId)) {
      await googleRequest(`calendars/${calendarId}/events/${eventId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
    } else {
      try {
        await googleRequest(`calendars/${calendarId}/events`, {
          method: 'POST',
          body: JSON.stringify({ id: eventId, ...body }),
        });
      } catch (error) {
        if (!(error instanceof GoogleApiError) || error.status !== 409)
          throw error;

        const conflict = await googleRequest(`calendars/${calendarId}/events/${eventId}`);
        const existing = await conflict.json() as CalendarEventLite;
        if (existing.extendedProperties?.private?.managedBy !== MANAGED_BY) {
          throw new Error('Calendar event ID conflict with unmanaged event');
        }
        await googleRequest(`calendars/${calendarId}/events/${eventId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      }
    }
    inserted += 1;
  }

  return inserted;
}

async function deleteStaleEvents(
  remoteEvents: CalendarEventLite[],
  localEvents: ReturnType<typeof buildCalendarEvents>
) {
  const calendarId = encodeURIComponent(readConfig().calendarId);
  const localIds = new Set(localEvents.map((event) => toEventId(event.sourceKey)));
  let deleted = 0;

  for (const remoteEvent of remoteEvents) {
    if (!remoteEvent.id || localIds.has(remoteEvent.id)) continue;

    await googleRequest(
      `calendars/${calendarId}/events/${encodeURIComponent(remoteEvent.id)}`,
      {
        method: 'DELETE',
      }
    );
    deleted += 1;
  }

  return deleted;
}

export async function syncGoogleCalendar(lectures: Lecture[], range: SyncRange = getSyncRange()) {
  const events = [...new Map(buildCalendarEvents(lectures).map(event => [event.sourceKey, event])).values()];
  const { timeMin, timeMax } = range;
  if (events.some(event => Date.parse(event.start.dateTime) < Date.parse(timeMin)
    || Date.parse(event.end.dateTime) > Date.parse(timeMax))) throw new Error('Portal schema error: event outside sync range');

  const remoteEvents = await listManagedEventsBetween(timeMin, timeMax);
  const remoteById = new Map(
    remoteEvents.filter((event) => event.id).map((event) => [event.id!, event])
  );

  const changedEvents = events.filter((event) => {
    const eventId = toEventId(event.sourceKey);
    const remoteEvent = remoteById.get(eventId);
    return !isSameEvent(remoteEvent, event);
  });

  // Compare only events wholly inside the same window, before any mutation.
  function guardCounts(remoteCount: number, localCount: number) {
    if (remoteCount && !localCount) {
      throw new Error('Destructive sync blocked: empty replacement for existing events');
    }
    if (remoteCount - localCount >= 5 && localCount < remoteCount / 2) {
      throw new Error('Destructive sync blocked: event count dropped by more than half');
    }
  }
  guardCounts(remoteEvents.length, events.length);
  // Semester history must not hide an abnormal loss of upcoming classes.
  const now = Date.now();
  guardCounts(
    remoteEvents.filter(event => Date.parse(event.end!.dateTime!) > now).length,
    events.filter(event => Date.parse(event.end.dateTime) > now).length,
  );

  const inserted = await upsertEvents(changedEvents, remoteById);
  const deleted = await deleteStaleEvents(remoteEvents, events);

  return { inserted, deleted };
}
