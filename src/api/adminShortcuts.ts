import { FALL_BACK_TO_MOCKS } from'./config';
import { api } from'./client';

export interface DashboardShortcut {
 id: string;
 hubType: 'student' | 'alumni';
 icon: string;
 iconColor: 'sage' | 'rose' | 'mint' | 'lavender';
 title: string;
 description: string;
 internalAction: string;
 campusScope: string;
 minLevel: number;
 department: string;
 active: boolean;
}

let shortcutsState: DashboardShortcut[] = [
 {
 id: 'sc-1',
 hubType: 'student',
 icon: 'add-circle',
 iconColor: 'lavender',
 title: 'Upload Events',
 description: 'Contribute calendar dates to student calendars',
 internalAction: 'upload_events',
 campusScope: 'All',
 minLevel: 1,
 department: 'All',
 active: true,
 },
 {
 id: 'sc-2',
 hubType: 'student',
 icon: 'book',
 iconColor: 'lavender',
 title: 'Courses',
 description: 'Explore catalog curricula and schedules',
 internalAction: 'courses',
 campusScope: 'All',
 minLevel: 1,
 department: 'All',
 active: true,
 },
 {
 id: 'sc-3',
 hubType: 'student',
 icon: 'document-text',
 iconColor: 'mint',
 title: 'Past Questions',
 description: 'Review past practice exams & solved libraries',
 internalAction: 'past_questions',
 campusScope: 'All',
 minLevel: 1,
 department: 'All',
 active: true,
 },
 {
 id: 'sc-5',
 hubType: 'student',
 icon: 'time',
 iconColor: 'rose',
 title: 'Timetable',
 description: 'View your class schedule for the term',
 internalAction: 'timetable',
 campusScope: 'All',
 minLevel: 1,
 department: 'All',
 active: true,
 },
 {
 id: 'sc-6',
 hubType: 'student',
 icon: 'library',
 iconColor: 'mint',
 title: 'Library',
 description: 'Browse shared academic resources',
 internalAction: 'library',
 campusScope: 'All',
 minLevel: 1,
 department: 'All',
 active: true,
 },
 {
 id: 'sc-7',
 hubType: 'alumni',
 icon: 'briefcase',
 iconColor: 'rose',
 title: 'Post a Job',
 description: 'Share an opening with current students',
 internalAction: 'post_job',
 campusScope: 'All',
 minLevel: 1,
 department: 'All',
 active: true,
 },
 {
 id: 'sc-8',
 hubType: 'alumni',
 icon: 'people',
 iconColor: 'lavender',
 title: 'Mentor a Student',
 description: 'Open a mentorship slot for this term',
 internalAction: 'mentor_slot',
 campusScope: 'All',
 minLevel: 1,
 department: 'All',
 active: true,
 },
];

export async function listDashboardShortcuts(hubType: 'student' | 'alumni'): Promise<DashboardShortcut[]> {
 try {
 const { data } = await api.get<{ items: DashboardShortcut[] }>('/admin/dashboard-shortcuts', { params: { hubType } });
 if (data?.items && data.items.length > 0) return data.items;
 } catch {
 // Graceful fallback to client portal catalog
 }
 return shortcutsState.filter((s) => s.hubType === hubType && s.active);
}

export type CreateShortcutPayload = Omit<DashboardShortcut, 'id'>;

export async function createDashboardShortcut(payload: CreateShortcutPayload): Promise<DashboardShortcut> {
 const created: DashboardShortcut = { id: `sc-${Date.now()}`, ...payload };
 shortcutsState = [...shortcutsState, created];
 return created;
}

export async function updateDashboardShortcut(id: string, patch: Partial<DashboardShortcut>): Promise<void> {
 shortcutsState = shortcutsState.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

export async function deleteDashboardShortcut(id: string): Promise<void> {
 shortcutsState = shortcutsState.filter((s) => s.id !== id);
}
