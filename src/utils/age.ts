/**
 * Date-of-birth helpers for the age rules (sign-up, the "add your date of birth" prompt, the guardian step).
 *
 * The database is the authority (public.age_years / the sign-up trigger, migration 20261111000000); this file only
 * gives instant feedback before a request is sent, so it must agree with it:
 *   - under 13: no account;  13-17: a minor (guardian details + consent, some features limited);  18+: adult.
 * Dependency-free so it can be unit-tested with the plain Node runner.
 */

/** Youngest age that may hold an account. Keep in step with MIN_AGE in constants/legal.ts (a test checks it). */
export const MIN_SIGNUP_AGE = 13;
/** Age from which a member is an adult for these rules. Keep in step with INDEPENDENT_AGE in constants/legal.ts. */
export const ADULT_AGE = 18;
/** Dates of birth further back than this are treated as typos (the database refuses them too). */
export const MAX_PLAUSIBLE_AGE = 120;

export type AgeBand = 'under_13' | 'minor' | 'adult';

export type DobStatus = 'incomplete' | 'invalid' | AgeBand;

export interface ParsedDob {
  status: DobStatus;
  /** yyyy-mm-dd, present when the date is real and plausible (status under_13 / minor / adult). */
  iso?: string;
  /** Whole years today, present together with `iso`. */
  age?: number;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** Whole years between a date of birth and `today` (birthday not yet reached this year = one year less). */
export function ageInYears(year: number, month: number, day: number, today: Date = new Date()): number {
  let age = today.getFullYear() - year;
  const beforeBirthday = today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

export function ageBand(age: number): AgeBand {
  if (age < MIN_SIGNUP_AGE) return 'under_13';
  if (age < ADULT_AGE) return 'minor';
  return 'adult';
}

/**
 * Day / month / year as typed into three plain text boxes -> a checked date. 'incomplete' while a box is empty
 * or the year is still being typed (fewer than 4 digits); 'invalid' for impossible dates (31 Feb), future dates
 * and implausibly old ones.
 */
export function parseDobInput(dayText: string, monthText: string, yearText: string, today: Date = new Date()): ParsedDob {
  const d = dayText.trim();
  const m = monthText.trim();
  const y = yearText.trim();
  if (!d || !m || y.length < 4) return { status: 'incomplete' };
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m) || !/^\d{4}$/.test(y)) return { status: 'invalid' };
  const day = Number(d);
  const month = Number(m);
  const year = Number(y);
  const real = new Date(year, month - 1, day);
  if (real.getFullYear() !== year || real.getMonth() !== month - 1 || real.getDate() !== day) return { status: 'invalid' };
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (real.getTime() > startOfToday.getTime()) return { status: 'invalid' };
  const age = ageInYears(year, month, day, today);
  if (age > MAX_PLAUSIBLE_AGE) return { status: 'invalid' };
  return { status: ageBand(age), iso: `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`, age };
}

/** The same classification for a stored yyyy-mm-dd (or a full ISO timestamp), e.g. a date read back from the server. */
export function parseIsoDob(iso: string | null | undefined, today: Date = new Date()): ParsedDob {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return { status: 'incomplete' };
  return parseDobInput(m[3], m[2], m[1], today);
}

/** Text shown under the date-of-birth boxes for a status, or null when nothing needs saying. */
export function dobHint(status: DobStatus): { tone: 'critical' | 'info'; message: string } | null {
  switch (status) {
    case 'invalid':
      return { tone: 'critical', message: 'That is not a valid date. Enter your real date of birth as day, month and year.' };
    case 'under_13':
      return {
        tone: 'critical',
        message: `You must be at least ${MIN_SIGNUP_AGE} years old to use Lioris, so an account cannot be created or kept open.`,
      };
    case 'minor':
      return {
        tone: 'info',
        message: `You are under ${ADULT_AGE}, so we will ask for a parent or guardian's details. Until they confirm, your account has some limits (no job posts, messages only to people you are connected with, and you will not show up in other members' searches).`,
      };
    default:
      return null;
  }
}
