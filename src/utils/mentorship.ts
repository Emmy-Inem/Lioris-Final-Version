import type { MentorAvailability, MentorSessionMode, MentorshipSessionStatus, MentorshipStatus } from '@/api/types';

export const AVAILABILITY_DAYS: Array<{ key: NonNullable<MentorAvailability['days']>[number]; label: string }> = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

export const AVAILABILITY_WINDOWS: Array<{ key: NonNullable<MentorAvailability['window']>; label: string }> = [
  { key: 'mornings', label: 'Mornings' },
  { key: 'afternoons', label: 'Afternoons' },
  { key: 'evenings', label: 'Evenings' },
  { key: 'weekends', label: 'Weekends' },
  { key: 'flexible', label: 'Flexible' },
];

export const SESSION_MODES: Array<{ key: MentorSessionMode; label: string; icon: 'videocam-outline' | 'chatbubbles-outline' | 'people-outline' }> = [
  { key: 'video', label: 'Video call', icon: 'videocam-outline' },
  { key: 'chat', label: 'Chat', icon: 'chatbubbles-outline' },
  { key: 'in_person', label: 'In person', icon: 'people-outline' },
];

export const EXPERTISE_SUGGESTIONS = [
  'Software Engineering',
  'Data & AI',
  'Product Management',
  'Design',
  'Finance',
  'Consulting',
  'Research',
  'Graduate School',
  'Startups',
  'Resume Prep',
  'Interview Prep',
  'Public Sector',
  'Healthcare',
  'Engineering',
];

/** Filters shown to students; "All Fields" clears the filter. */
export const EXPERTISE_FILTERS = ['All Fields', 'Software', 'Data & AI', 'Resume Prep', 'Finance', 'Research', 'Design', 'Startups'];

export const MENTORSHIP_TRACKS = [
  'Career Guidance',
  'Resume & Interview Prep',
  'Technical Skills & Code',
  'Graduate School & Research',
  'Startup & Entrepreneurship',
  'Academic Mentorship',
] as const;

export const ACADEMIC_LEVELS = ['100L', '200L', '300L', '400L', '500L', '600L', 'PGD', 'Masters', 'PhD'] as const;

export const CADENCE_OPTIONS = ['Bi-weekly 30m calls', 'Monthly check-in', 'Async / Chat feedback', 'Flexible'] as const;

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** "Mon, Wed · Evenings" - empty string when nothing was set. */
export function describeAvailability(av: MentorAvailability | null | undefined): string {
  if (!av) return '';
  const days = (av.days ?? [])
    .slice()
    .sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
    .map((d) => AVAILABILITY_DAYS.find((x) => x.key === d)?.label ?? d);
  const windowLabel = av.window ? AVAILABILITY_WINDOWS.find((w) => w.key === av.window)?.label : undefined;
  const parts: string[] = [];
  if (days.length > 0) parts.push(days.join(', '));
  if (windowLabel && !(days.length === 0 && av.window === 'flexible')) parts.push(windowLabel);
  return parts.join(' · ');
}

export type StatusTone = 'warning' | 'success' | 'neutral' | 'critical' | 'brand';

export function mentorshipStatusLabel(status: MentorshipStatus): string {
  switch (status) {
    case 'pending':
      return 'Awaiting reply';
    case 'active':
      return 'Active';
    case 'completed':
      return 'Completed';
    case 'declined':
      return 'Declined';
    case 'withdrawn':
      return 'Withdrawn';
    case 'ended':
      return 'Ended';
  }
}

export function mentorshipStatusTone(status: MentorshipStatus): StatusTone {
  switch (status) {
    case 'pending':
      return 'warning';
    case 'active':
      return 'success';
    case 'declined':
      return 'critical';
    default:
      return 'neutral';
  }
}

export function sessionStatusLabel(status: MentorshipSessionStatus): string {
  switch (status) {
    case 'proposed':
      return 'Waiting for confirmation';
    case 'confirmed':
      return 'Confirmed';
    case 'declined':
      return 'Declined';
    case 'cancelled':
      return 'Cancelled';
    case 'completed':
      return 'Done';
  }
}

export function isOpenMentorship(status: MentorshipStatus): boolean {
  return status === 'pending' || status === 'active';
}

/** Short hint shown on a mentor card when they line up with the student's interests. */
export function matchLabel(score: number): string | null {
  if (score >= 6) return 'Strong match';
  if (score >= 3) return 'Good match';
  return null;
}

/** Sort key: what needs the viewer's attention first (pending for mentors, active for everyone), newest activity next. */
export function mentorshipSortRank(status: MentorshipStatus): number {
  return { pending: 0, active: 1, completed: 2, ended: 3, declined: 4, withdrawn: 5 }[status];
}
