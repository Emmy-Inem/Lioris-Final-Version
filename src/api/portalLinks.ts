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

/**
 * Fallback portal links used when the `portal_links` table is empty or unreachable.
 *
 * EVERY url here was fetched and confirmed to answer HTTP 200 over https (2026-09-19), and each one
 * was discovered from the university's OWN homepage rather than guessed. Several previously shipped
 * links were invented and their domains do not exist (lms.unilag.edu.ng, payments.unilag.edu.ng,
 * medical.unilag.edu.ng, portal.ui.edu.ng, uhs.ui.edu.ng, lms.unaab.edu.ng, library.unaab.edu.ng,
 * healthservices.unaab.edu.ng) - they were removed, not "fixed", because no real equivalent exists.
 *
 * Rules when editing:
 *   - https only. An http-only host (e.g. jajaclinic.ui.edu.ng) is dropped: the web build sends
 *     `upgrade-insecure-requests`, so an http link would silently fail.
 *   - Verify before adding:  curl -sIL -o /dev/null -w '%{http_code}' <url>
 *   - GLOBAL is for national services that apply to every campus, NOT a copy of one campus's links.
 */
export const DEFAULT_CAMPUS_PORTAL_LINKS: Record<string, PortalLink[]> = {
 UNILAG: [
 { id: 'unilag-1', campusCode: 'UNILAG', title: 'UNILAG Student Portal', url: 'https://unilag.edu.ng/student-portal/', category: 'Academic', icon: 'school-outline', active: true, displayOrder: 1 },
 { id: 'unilag-2', campusCode: 'UNILAG', title: 'University Library', url: 'https://library.unilag.edu.ng/', category: 'Library', icon: 'book-outline', active: true, displayOrder: 2 },
 { id: 'unilag-3', campusCode: 'UNILAG', title: 'Bursary & Student Accounts', url: 'https://unilag.edu.ng/bursary/', category: 'Finance', icon: 'card-outline', active: true, displayOrder: 3 },
 { id: 'unilag-4', campusCode: 'UNILAG', title: 'Remita Fee Payments', url: 'https://unilag.edu.ng/remita/', category: 'Finance', icon: 'cash-outline', active: true, displayOrder: 4 },
 { id: 'unilag-5', campusCode: 'UNILAG', title: 'Parent Portal', url: 'https://unilag.edu.ng/parent-portal/', category: 'Academic', icon: 'people-outline', active: true, displayOrder: 5 },
 ],
 UI: [
 { id: 'ui-1', campusCode: 'UI', title: 'UI Student Portal', url: 'https://student-portal.ui.edu.ng/login', category: 'Academic', icon: 'school-outline', active: true, displayOrder: 1 },
 { id: 'ui-2', campusCode: 'UI', title: 'UI e-Learning (LMS)', url: 'https://lms.ui.edu.ng/', category: 'Classes', icon: 'laptop-outline', active: true, displayOrder: 2 },
 { id: 'ui-3', campusCode: 'UI', title: 'Kenneth Dike Library', url: 'https://library.ui.edu.ng/', category: 'Library', icon: 'book-outline', active: true, displayOrder: 3 },
 { id: 'ui-4', campusCode: 'UI', title: 'Bursary & Student Accounts', url: 'https://bursary.ui.edu.ng/', category: 'Finance', icon: 'card-outline', active: true, displayOrder: 4 },
 { id: 'ui-5', campusCode: 'UI', title: 'Transcript Requests', url: 'https://ui.edu.ng/content/students-transcript', category: 'Academic', icon: 'document-text-outline', active: true, displayOrder: 5 },
 ],
 FUNAAB: [
 { id: 'funaab-1', campusCode: 'FUNAAB', title: 'FUNAAB Student Portal', url: 'https://portal.unaab.edu.ng/pt/', category: 'Academic', icon: 'school-outline', active: true, displayOrder: 1 },
 { id: 'funaab-2', campusCode: 'FUNAAB', title: 'Nimbe Adedipe Library', url: 'https://funaab.edu.ng/section/nimbe-adedipe-library/', category: 'Library', icon: 'book-outline', active: true, displayOrder: 2 },
 { id: 'funaab-3', campusCode: 'FUNAAB', title: 'Bursary', url: 'https://funaab.edu.ng/section/bursary/', category: 'Finance', icon: 'card-outline', active: true, displayOrder: 3 },
 { id: 'funaab-4', campusCode: 'FUNAAB', title: 'Directorate of Health Services', url: 'https://funaab.edu.ng/section/directorate-of-health-services/', category: 'Health', icon: 'medkit-outline', active: true, displayOrder: 4 },
 { id: 'funaab-5', campusCode: 'FUNAAB', title: 'Student Affairs', url: 'https://funaab.edu.ng/section/students-affairs/', category: 'Academic', icon: 'people-outline', active: true, displayOrder: 5 },
 ],
 GLOBAL: [
 { id: 'glob-1', campusCode: 'GLOBAL', title: 'JAMB eFacility', url: 'https://efacility.jamb.gov.ng/', category: 'Academic', icon: 'shield-checkmark-outline', active: true, displayOrder: 1 },
 { id: 'glob-2', campusCode: 'GLOBAL', title: 'National Universities Commission', url: 'https://www.nuc.edu.ng/', category: 'Academic', icon: 'business-outline', active: true, displayOrder: 2 },
 { id: 'glob-3', campusCode: 'GLOBAL', title: 'TETFund', url: 'https://tetfund.gov.ng/', category: 'Research', icon: 'library-outline', active: true, displayOrder: 3 },
 { id: 'glob-4', campusCode: 'GLOBAL', title: 'Remita Payments', url: 'https://remita.net/', category: 'Finance', icon: 'cash-outline', active: true, displayOrder: 4 },
 { id: 'glob-5', campusCode: 'GLOBAL', title: 'NYSC', url: 'https://www.nysc.gov.ng/', category: 'Academic', icon: 'ribbon-outline', active: true, displayOrder: 5 },
 ],
};

let localPortalLinksState: PortalLink[] = [
 ...DEFAULT_CAMPUS_PORTAL_LINKS.UI,
 ...DEFAULT_CAMPUS_PORTAL_LINKS.UNILAG,
 ...DEFAULT_CAMPUS_PORTAL_LINKS.FUNAAB,
 ...DEFAULT_CAMPUS_PORTAL_LINKS.GLOBAL,
];

/**
 * Links for one campus, always followed by the GLOBAL national services (JAMB, NUC, Remita, NYSC)
 * which apply to every student. Asking for GLOBAL returns only those national services.
 *
 * An unknown campus code falls back to GLOBAL, never to another university: showing a FUNAAB
 * student UI's portal (the previous behaviour) is worse than showing nothing campus-specific.
 */
export async function listPortalLinks(campusCode?: string): Promise<PortalLink[]> {
 const code = (campusCode || 'GLOBAL').toUpperCase();
 const wantedCodes = code === 'GLOBAL' ? ['GLOBAL'] : [code, 'GLOBAL'];

 try {
  const { data, error } = await supabase
   .from('portal_links')
   .select('*')
   .in('campus_code', wantedCodes)
   .order('display_order', { ascending: true });

  if (!error && data && data.length > 0) {
   const rows: PortalLink[] = data.map((row: any) => ({
    id: row.id,
    campusCode: row.campus_code || 'GLOBAL',
    title: row.title,
    url: row.url,
    category: row.category || 'Academic',
    icon: (row.icon as keyof typeof Ionicons.glyphMap) || 'link-outline',
    active: row.is_active !== false,
    displayOrder: row.display_order ?? 0,
   }));
   // Campus links first, national ones after, each by display order.
   return rows.sort((a, b) => {
    const aGlobal = a.campusCode === 'GLOBAL' ? 1 : 0;
    const bGlobal = b.campusCode === 'GLOBAL' ? 1 : 0;
    if (aGlobal !== bGlobal) return aGlobal - bGlobal;
    return (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
   });
  }
 } catch (err) {
  console.warn('[PortalLinks] Failed to fetch from Supabase:', err);
 }

 // Curated fallback - every url verified, see DEFAULT_CAMPUS_PORTAL_LINKS.
 return wantedCodes.flatMap((c) => DEFAULT_CAMPUS_PORTAL_LINKS[c] ?? []);
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
