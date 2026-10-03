import { Alert, Platform } from 'react-native';
import { openExternalUrl } from './openExternalUrl';
import { haptics } from './haptics';

export interface CalendarEventPayload {
  id?: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt?: string | null;
}

/** Formats an ISO string (or Date) to UTC YYYYMMDDTHHmmssZ required by calendar providers */
export function toCalendarUtcString(iso?: string | null, fallbackDate?: Date): string {
  const d = iso ? new Date(iso) : fallbackDate ?? new Date();
  const valid = isNaN(d.getTime()) ? (fallbackDate ?? new Date()) : d;
  return valid.toISOString().replace(/[-:]|\.\d{3}/g, '');
}

/**
 * Builds a direct Google Calendar event creation URL (render action).
 * Compatible across desktop browsers, mobile Chrome/Safari, and the Google Calendar app.
 */
export function getGoogleCalendarUrl(event: CalendarEventPayload): string {
  const startUtc = toCalendarUtcString(event.startAt, new Date(Date.now() + 86400000));
  const fallbackEnd = new Date(new Date(event.startAt || Date.now()).getTime() + 2 * 3600000);
  const endUtc = toCalendarUtcString(event.endAt, fallbackEnd);

  const title = encodeURIComponent(event.title || 'Campus Event');
  const details = encodeURIComponent(event.description ?? '');
  const location = encodeURIComponent(event.location ?? 'Campus');

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startUtc}/${endUtc}&details=${details}&location=${location}`;
}

/**
 * Opens Google Calendar directly with pre-populated event details.
 */
export async function openGoogleCalendar(event: CalendarEventPayload): Promise<boolean> {
  haptics.light();
  const url = getGoogleCalendarUrl(event);
  const opened = await openExternalUrl(url);
  if (!opened) {
    Alert.alert('Google Calendar', 'Could not open Google Calendar link.');
    return false;
  }
  return true;
}

/**
 * Generates standards-compliant iCalendar (.ics) content.
 */
export function generateIcsContent(event: CalendarEventPayload): string {
  const now = new Date();
  const dtStamp = toCalendarUtcString(now.toISOString());
  const dtStart = toCalendarUtcString(event.startAt, new Date(Date.now() + 86400000));
  const fallbackEnd = new Date(new Date(event.startAt || Date.now()).getTime() + 2 * 3600000);
  const dtEnd = toCalendarUtcString(event.endAt, fallbackEnd);
  const uid = event.id ? `${event.id}@lioris.app` : `evt-${Date.now()}@lioris.app`;

  // Escape special chars for ICS text fields
  const escapeIcs = (str: string) => str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lioris Campus Platform//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcs(event.title || 'Campus Event')}`,
    `DESCRIPTION:${escapeIcs(event.description ?? '')}`,
    `LOCATION:${escapeIcs(event.location ?? 'Campus')}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Initiates an .ics calendar file download on Web or shares on mobile.
 */
export async function downloadIcsFile(event: CalendarEventPayload): Promise<void> {
  haptics.light();
  const icsText = generateIcsContent(event);

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sanitizedTitle = (event.title || 'event').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    link.download = `${sanitizedTitle}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else {
    // On native, Google Calendar is the most reliable cross-platform link
    await openGoogleCalendar(event);
  }
}
