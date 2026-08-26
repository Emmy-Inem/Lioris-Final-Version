import { Ionicons } from '@expo/vector-icons';
import { supabase } from './supabase';
import { generateUUID } from '../utils/uuid';

export interface PortalLink {
 id: string;
 campusCode?: string;
 title: string;
 url: string;
 category: string;
 icon: keyof typeof Ionicons.glyphMap;
 active: boolean;
 displayOrder?: number;
}

export const DEFAULT_CAMPUS_PORTAL_LINKS: Record<string, PortalLink[]> = {
 UNILAG: [
 { id: 'unilag-1', campusCode: 'UNILAG', title: 'UNILAG Student Portal', url: 'https://studentportal.unilag.edu.ng/', category: 'Academic', icon: 'school-outline', active: true, displayOrder: 1 },
 { id: 'unilag-2', campusCode: 'UNILAG', title: 'UNILAG e-Learning LMS', url: 'https://lms.unilag.edu.ng/', category: 'Classes', icon: 'laptop-outline', active: true, displayOrder: 2 },
 { id: 'unilag-3', campusCode: 'UNILAG', title: 'Main Library Catalog & Archives', url: 'https://library.unilag.edu.ng/', category: 'Library', icon: 'book-outline', active: true, displayOrder: 3 },
 { id: 'unilag-4', campusCode: 'UNILAG', title: 'Bursary & Payments (Remita)', url: 'https://payments.unilag.edu.ng/', category: 'Finance', icon: 'card-outline', active: true, displayOrder: 4 },
 { id: 'unilag-5', campusCode: 'UNILAG', title: 'Hostel Accommodation Balloting', url: 'https://studentportal.unilag.edu.ng/hostel', category: 'Housing', icon: 'home-outline', active: true, displayOrder: 5 },
 { id: 'unilag-6', campusCode: 'UNILAG', title: 'Medical Centre e-Services', url: 'https://medical.unilag.edu.ng/', category: 'Health', icon: 'medkit-outline', active: true, displayOrder: 6 },
 ],
 UI: [
 { id: 'ui-1', campusCode: 'UI', title: 'UI Undergraduate Portal', url: 'https://portal.ui.edu.ng/', category: 'Academic', icon: 'school-outline', active: true, displayOrder: 1 },
 { id: 'ui-2', campusCode: 'UI', title: 'UI DLC LMS & Virtual Classroom', url: 'https://dlc.ui.edu.ng/', category: 'Classes', icon: 'laptop-outline', active: true, displayOrder: 2 },
 { id: 'ui-3', campusCode: 'UI', title: 'Kenneth Dike Memorial Library', url: 'https://library.ui.edu.ng/', category: 'Library', icon: 'book-outline', active: true, displayOrder: 3 },
 { id: 'ui-4', campusCode: 'UI', title: 'University Bursary & Invoicing', url: 'https://bursary.ui.edu.ng/', category: 'Finance', icon: 'card-outline', active: true, displayOrder: 4 },
 { id: 'ui-5', campusCode: 'UI', title: 'Halls of Residence Allocation', url: 'https://portal.ui.edu.ng/hostels', category: 'Housing', icon: 'home-outline', active: true, displayOrder: 5 },
 { id: 'ui-6', campusCode: 'UI', title: 'Jaja Health Services Clinic', url: 'https://uhs.ui.edu.ng/', category: 'Health', icon: 'medkit-outline', active: true, displayOrder: 6 },
 ],
 FUNAAB: [
 { id: 'funaab-1', campusCode: 'FUNAAB', title: 'FUNAAB Student Portal', url: 'https://portal.unaab.edu.ng/', category: 'Academic', icon: 'school-outline', active: true, displayOrder: 1 },
 { id: 'funaab-2', campusCode: 'FUNAAB', title: 'FUNAAB LMS e-Learning', url: 'https://lms.unaab.edu.ng/', category: 'Classes', icon: 'laptop-outline', active: true, displayOrder: 2 },
 { id: 'funaab-3', campusCode: 'FUNAAB', title: 'Nimbe Adedipe Digital Library', url: 'https://library.unaab.edu.ng/', category: 'Library', icon: 'book-outline', active: true, displayOrder: 3 },
 { id: 'funaab-4', campusCode: 'FUNAAB', title: 'Bursary & Student Billing', url: 'https://portal.unaab.edu.ng/payments', category: 'Finance', icon: 'card-outline', active: true, displayOrder: 4 },
 { id: 'funaab-5', campusCode: 'FUNAAB', title: 'Hostel Accommodation System', url: 'https://portal.unaab.edu.ng/accommodation', category: 'Housing', icon: 'home-outline', active: true, displayOrder: 5 },
 { id: 'funaab-6', campusCode: 'FUNAAB', title: 'Directorate of Health Services', url: 'https://healthservices.unaab.edu.ng/', category: 'Health', icon: 'medkit-outline', active: true, displayOrder: 6 },
 ],
 GLOBAL: [
 { id: 'glob-1', campusCode: 'GLOBAL', title: 'Campus Student Portal', url: 'https://studentportal.unilag.edu.ng/', category: 'Academic', icon: 'school-outline', active: true, displayOrder: 1 },
 { id: 'glob-2', campusCode: 'GLOBAL', title: 'LMS Virtual Classroom', url: 'https://lms.unilag.edu.ng/', category: 'Classes', icon: 'laptop-outline', active: true, displayOrder: 2 },
 { id: 'glob-3', campusCode: 'GLOBAL', title: 'Academic Library & Archives', url: 'https://library.unilag.edu.ng/', category: 'Library', icon: 'book-outline', active: true, displayOrder: 3 },
 { id: 'glob-4', campusCode: 'GLOBAL', title: 'Tuition & Bursary Services', url: 'https://payments.unilag.edu.ng/', category: 'Finance', icon: 'card-outline', active: true, displayOrder: 4 },
 { id: 'glob-5', campusCode: 'GLOBAL', title: 'Campus Accommodation Portal', url: 'https://studentportal.unilag.edu.ng/hostel', category: 'Housing', icon: 'home-outline', active: true, displayOrder: 5 },
 { id: 'glob-6', campusCode: 'GLOBAL', title: 'University Health Center', url: 'https://medical.unilag.edu.ng/', category: 'Health', icon: 'medkit-outline', active: true, displayOrder: 6 },
 ],
};

let localPortalLinksState: PortalLink[] = [
 ...DEFAULT_CAMPUS_PORTAL_LINKS.UNILAG,
 ...DEFAULT_CAMPUS_PORTAL_LINKS.UI,
 ...DEFAULT_CAMPUS_PORTAL_LINKS.FUNAAB,
];

export async function listPortalLinks(campusCode?: string): Promise<PortalLink[]> {
 try {
 let query = supabase.from('portal_links').select('*').order('display_order', { ascending: true });
 if (campusCode && campusCode !== 'GLOBAL') {
 query = query.or(`campus_code.eq.${campusCode},campus_code.eq.GLOBAL,campus_code.is.null`);
 }

 const { data, error } = await query;
 if (!error && data && data.length > 0) {
 return data.map((row: any) => ({
 id: row.id,
 campusCode: row.campus_code || 'GLOBAL',
 title: row.title,
 url: row.url,
 category: row.category || 'Academic',
 icon: (row.icon as keyof typeof Ionicons.glyphMap) || 'link-outline',
 active: row.is_active !== false,
 displayOrder: row.display_order ?? 0,
 }));
 }
 } catch (err) {
 console.warn('[PortalLinks] Failed to fetch from Supabase:', err);
 }

 // Curated campus fallback
 const code = (campusCode || 'UNILAG').toUpperCase();
 const campusDefaults = DEFAULT_CAMPUS_PORTAL_LINKS[code] || DEFAULT_CAMPUS_PORTAL_LINKS.UNILAG;
 return campusDefaults;
}

export async function createPortalLink(payload: Omit<PortalLink, 'id'>): Promise<PortalLink> {
 const newId = generateUUID();
 const newLink: PortalLink = {
 id: newId,
 ...payload,
 };

 try {
 const { error } = await supabase.from('portal_links').insert({
 id: newId,
 campus_code: payload.campusCode || 'GLOBAL',
 title: payload.title.trim(),
 url: payload.url.trim(),
 category: payload.category.trim() || 'Academic',
 icon: payload.icon || 'link-outline',
 is_active: payload.active,
 display_order: payload.displayOrder ?? 0,
 });
 if (error) {
 console.warn('[PortalLinks] Insert Supabase error:', error.message);
 }
 } catch (err) {
 console.warn('[PortalLinks] Insert exception:', err);
 }

 localPortalLinksState.push(newLink);
 return newLink;
}

export async function updatePortalLink(id: string, patch: Partial<PortalLink>): Promise<PortalLink> {
 localPortalLinksState = localPortalLinksState.map((l) => (l.id === id ? { ...l, ...patch } : l));

 try {
 const dbPatch: any = {};
 if (patch.title !== undefined) dbPatch.title = patch.title.trim();
 if (patch.url !== undefined) dbPatch.url = patch.url.trim();
 if (patch.category !== undefined) dbPatch.category = patch.category.trim();
 if (patch.icon !== undefined) dbPatch.icon = patch.icon;
 if (patch.active !== undefined) dbPatch.is_active = patch.active;
 if (patch.displayOrder !== undefined) dbPatch.display_order = patch.displayOrder;
 if (patch.campusCode !== undefined) dbPatch.campus_code = patch.campusCode;

 await supabase.from('portal_links').update(dbPatch).eq('id', id);
 } catch (err) {
 console.warn('[PortalLinks] Update error:', err);
 }

 const found = localPortalLinksState.find((l) => l.id === id);
 return found || { id, title: 'Updated Link', url: 'https://lioris.edu', category: 'Academic', icon: 'link-outline', active: true };
}

export async function deletePortalLink(id: string): Promise<void> {
 localPortalLinksState = localPortalLinksState.filter((l) => l.id !== id);
 try {
 await supabase.from('portal_links').delete().eq('id', id);
 } catch (err) {
 console.warn('[PortalLinks] Delete error:', err);
 }
}
