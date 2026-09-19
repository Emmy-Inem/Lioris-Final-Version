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
    { id: 'unilag-2', campusCode: 'UNILAG', title: 'Main Library Catalog & Archives', url: 'https://library.unilag.edu.ng/', category: 'Library', icon: 'book-outline', active: true, displayOrder: 2 },
    { id: 'unilag-3', campusCode: 'UNILAG', title: 'UNILAG e-Learning LMS', url: 'https://lms.unilag.edu.ng/', category: 'Classes', icon: 'laptop-outline', active: true, displayOrder: 3 },
    { id: 'unilag-4', campusCode: 'UNILAG', title: 'Bursary & Payments (Remita)', url: 'https://payments.unilag.edu.ng/', category: 'Finance', icon: 'card-outline', active: true, displayOrder: 4 },
    { id: 'unilag-5', campusCode: 'UNILAG', title: 'Hostel Accommodation System', url: 'https://studentportal.unilag.edu.ng/', category: 'Housing', icon: 'home-outline', active: true, displayOrder: 5 },
    { id: 'unilag-6', campusCode: 'UNILAG', title: 'Medical Centre & Health Clinic', url: 'https://unilag.edu.ng/medical-centre/', category: 'Health', icon: 'medkit-outline', active: true, displayOrder: 6 },
    { id: 'unilag-7', campusCode: 'UNILAG', title: 'CITS ICT & Student Email', url: 'https://cits.unilag.edu.ng/', category: 'ICT & Services', icon: 'hardware-chip-outline', active: true, displayOrder: 7 },
    { id: 'unilag-8', campusCode: 'UNILAG', title: 'Postgraduate School (SPGS)', url: 'https://spgs.unilag.edu.ng/', category: 'Postgraduate', icon: 'ribbon-outline', active: true, displayOrder: 8 },
  ],
  UI: [
    { id: 'ui-1', campusCode: 'UI', title: 'UI Student Portal', url: 'https://student-portal.ui.edu.ng/', category: 'Academic', icon: 'school-outline', active: true, displayOrder: 1 },
    { id: 'ui-2', campusCode: 'UI', title: 'Result Management (UIRMS)', url: 'https://uirms.ui.edu.ng/', category: 'Results', icon: 'trophy-outline', active: true, displayOrder: 2 },
    { id: 'ui-3', campusCode: 'UI', title: 'Kenneth Dike Memorial Library', url: 'https://library.ui.edu.ng/', category: 'Library', icon: 'book-outline', active: true, displayOrder: 3 },
    { id: 'ui-4', campusCode: 'UI', title: 'UI DLC Virtual Classroom', url: 'https://dlcportal.ui.edu.ng/', category: 'Classes', icon: 'laptop-outline', active: true, displayOrder: 4 },
    { id: 'ui-5', campusCode: 'UI', title: 'Undergraduate Admissions', url: 'https://admissions.ui.edu.ng/', category: 'Admissions', icon: 'document-text-outline', active: true, displayOrder: 5 },
    { id: 'ui-6', campusCode: 'UI', title: 'University Central Portal', url: 'https://portal.ui.edu.ng/', category: 'Central Portal', icon: 'globe-outline', active: true, displayOrder: 6 },
    { id: 'ui-7', campusCode: 'UI', title: 'Jaja Health Services Clinic', url: 'https://ui.edu.ng/', category: 'Health', icon: 'medkit-outline', active: true, displayOrder: 7 },
  ],
  FUNAAB: [
    { id: 'funaab-1', campusCode: 'FUNAAB', title: 'FUNAAB Student Portal', url: 'https://portal.unaab.edu.ng/', category: 'Academic', icon: 'school-outline', active: true, displayOrder: 1 },
    { id: 'funaab-2', campusCode: 'FUNAAB', title: 'Nimbe Adedipe Digital Library', url: 'https://library.unaab.edu.ng/', category: 'Library', icon: 'book-outline', active: true, displayOrder: 2 },
    { id: 'funaab-3', campusCode: 'FUNAAB', title: 'FUNAAB Central Portal', url: 'https://funaab.edu.ng/', category: 'Central Portal', icon: 'globe-outline', active: true, displayOrder: 3 },
    { id: 'funaab-4', campusCode: 'FUNAAB', title: 'Bursary Invoicing & Billing', url: 'https://portal.unaab.edu.ng/', category: 'Finance', icon: 'card-outline', active: true, displayOrder: 4 },
    { id: 'funaab-5', campusCode: 'FUNAAB', title: 'Hostel Accommodation System', url: 'https://portal.unaab.edu.ng/', category: 'Housing', icon: 'home-outline', active: true, displayOrder: 5 },
    { id: 'funaab-6', campusCode: 'FUNAAB', title: 'Directorate of Health Services', url: 'https://funaab.edu.ng/health-services/', category: 'Health', icon: 'medkit-outline', active: true, displayOrder: 6 },
    { id: 'funaab-7', campusCode: 'FUNAAB', title: 'ICTREC Tech Resource Centre', url: 'https://funaab.edu.ng/', category: 'ICT & Services', icon: 'hardware-chip-outline', active: true, displayOrder: 7 },
  ],
  UNN: [
    { id: 'unn-1', campusCode: 'UNN', title: 'UNN Student Portal', url: 'https://unnportal.unn.edu.ng/', category: 'Academic', icon: 'school-outline', active: true, displayOrder: 1 },
    { id: 'unn-2', campusCode: 'UNN', title: 'UNN e-Learning Portal', url: 'https://elearning.unn.edu.ng/', category: 'Classes', icon: 'laptop-outline', active: true, displayOrder: 2 },
    { id: 'unn-3', campusCode: 'UNN', title: 'Nnamdi Azikiwe Library & OPAC', url: 'https://library.unn.edu.ng/', category: 'Library', icon: 'book-outline', active: true, displayOrder: 3 },
    { id: 'unn-4', campusCode: 'UNN', title: 'Medical Centre Health Portal', url: 'https://medicalcentre.unn.edu.ng/', category: 'Health', icon: 'medkit-outline', active: true, displayOrder: 4 },
    { id: 'unn-5', campusCode: 'UNN', title: 'UNN iLearn Digital Campus', url: 'https://ilearn.unn.edu.ng/', category: 'Online Learning', icon: 'desktop-outline', active: true, displayOrder: 5 },
    { id: 'unn-6', campusCode: 'UNN', title: 'Hostel & Remita Billing', url: 'https://unnportal.unn.edu.ng/', category: 'Housing & Finance', icon: 'home-outline', active: true, displayOrder: 6 },
    { id: 'unn-7', campusCode: 'UNN', title: 'UNN Central University Portal', url: 'https://unn.edu.ng/', category: 'Central Portal', icon: 'globe-outline', active: true, displayOrder: 7 },
  ],
  OAU: [
    { id: 'oau-1', campusCode: 'OAU', title: 'OAU Student ePortal', url: 'https://eportal.oauife.edu.ng/', category: 'Academic', icon: 'school-outline', active: true, displayOrder: 1 },
    { id: 'oau-2', campusCode: 'OAU', title: 'OAU e-Learning LMS', url: 'https://lms.oauife.edu.ng/', category: 'Classes', icon: 'laptop-outline', active: true, displayOrder: 2 },
    { id: 'oau-3', campusCode: 'OAU', title: 'Hezekiah Oluwasanmi Library', url: 'https://library.oauife.edu.ng/', category: 'Library', icon: 'book-outline', active: true, displayOrder: 3 },
    { id: 'oau-4', campusCode: 'OAU', title: 'Postgraduate College Portal', url: 'https://pgcollege.oauife.edu.ng/', category: 'Postgraduate', icon: 'ribbon-outline', active: true, displayOrder: 4 },
    { id: 'oau-5', campusCode: 'OAU', title: 'Centre for Distance Learning', url: 'https://cdl.oauife.edu.ng/', category: 'Distance Learning', icon: 'desktop-outline', active: true, displayOrder: 5 },
    { id: 'oau-6', campusCode: 'OAU', title: 'Bursary & E-Invoicing', url: 'https://bursary.oauife.edu.ng/', category: 'Finance', icon: 'card-outline', active: true, displayOrder: 6 },
    { id: 'oau-7', campusCode: 'OAU', title: 'Hostel Accommodation System', url: 'https://eportal.oauife.edu.ng/', category: 'Housing', icon: 'home-outline', active: true, displayOrder: 7 },
    { id: 'oau-8', campusCode: 'OAU', title: 'OAU Official Portal', url: 'https://oauife.edu.ng/', category: 'Central Portal', icon: 'globe-outline', active: true, displayOrder: 8 },
  ],
  CU: [
    { id: 'cu-1', campusCode: 'CU', title: 'Covenant University Student Portal', url: 'https://portal.covenantuniversity.edu.ng/', category: 'Academic', icon: 'school-outline', active: true, displayOrder: 1 },
    { id: 'cu-2', campusCode: 'CU', title: 'Covenant Moodle LMS Classroom', url: 'https://moodle.cu.edu.ng/', category: 'Classes', icon: 'laptop-outline', active: true, displayOrder: 2 },
    { id: 'cu-3', campusCode: 'CU', title: 'Centre for Learning Resources (CLR)', url: 'https://clr.covenantuniversity.edu.ng/', category: 'Library', icon: 'book-outline', active: true, displayOrder: 3 },
    { id: 'cu-4', campusCode: 'CU', title: 'CBT Examination Platform', url: 'https://cbt.cu.edu.ng/', category: 'Examinations', icon: 'create-outline', active: true, displayOrder: 4 },
    { id: 'cu-5', campusCode: 'CU', title: 'Covenant Admissions Portal', url: 'https://admissions.covenantuniversity.edu.ng/', category: 'Admissions', icon: 'document-text-outline', active: true, displayOrder: 5 },
    { id: 'cu-6', campusCode: 'CU', title: 'Covenant University Official Website', url: 'https://covenantuniversity.edu.ng/', category: 'Central Portal', icon: 'globe-outline', active: true, displayOrder: 6 },
  ],
  GLOBAL: [
    { id: 'glob-1', campusCode: 'GLOBAL', title: 'National Academic Repository (JAMB)', url: 'https://efacility.jamb.gov.ng/', category: 'National', icon: 'school-outline', active: true, displayOrder: 1 },
    { id: 'glob-2', campusCode: 'GLOBAL', title: 'National Universities Commission (NUC)', url: 'https://www.nuc.edu.ng/', category: 'Commission', icon: 'globe-outline', active: true, displayOrder: 2 },
    { id: 'glob-3', campusCode: 'GLOBAL', title: 'TETFUND Digital Research Library', url: 'https://tetfund.gov.ng/', category: 'Research', icon: 'book-outline', active: true, displayOrder: 3 },
    { id: 'glob-4', campusCode: 'GLOBAL', title: 'Central Education Payments (Remita)', url: 'https://remita.net/', category: 'Finance', icon: 'card-outline', active: true, displayOrder: 4 },
    { id: 'glob-5', campusCode: 'GLOBAL', title: 'NYSC Mobilization & Verification', url: 'https://portal.nysc.org.ng/', category: 'National Service', icon: 'shield-checkmark-outline', active: true, displayOrder: 5 },
  ],
};

// Flatten all default links for multi-campus searches
export const ALL_DEFAULT_PORTAL_LINKS: PortalLink[] = Object.values(DEFAULT_CAMPUS_PORTAL_LINKS).flat();

let localPortalLinksState: PortalLink[] = [...ALL_DEFAULT_PORTAL_LINKS];

/**
 * Lists portal links for a specific campus, or across all universities if campusCode is 'ALL' or omitted.
 * Prioritizes verified defaults while gracefully merging any dynamic admin-created links from Supabase.
 */
export async function listPortalLinks(campusCode?: string): Promise<PortalLink[]> {
  const normCode = campusCode?.trim().toUpperCase();
  const targetCode = (!normCode || normCode === 'ALL') ? 'ALL' : normCode;

  // Retrieve curated defaults for target code
  const defaults = targetCode === 'ALL'
    ? ALL_DEFAULT_PORTAL_LINKS
    : (DEFAULT_CAMPUS_PORTAL_LINKS[targetCode] || DEFAULT_CAMPUS_PORTAL_LINKS.GLOBAL || []);

  try {
    let query = supabase.from('portal_links').select('*').order('display_order', { ascending: true });
    if (targetCode !== 'ALL') {
      query = query.eq('campus_code', targetCode);
    }

    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      const dbLinks: PortalLink[] = data.map((row: any) => ({
        id: row.id,
        campusCode: row.campus_code || 'GLOBAL',
        title: row.title,
        url: row.url,
        category: row.category || 'Academic',
        icon: (row.icon as keyof typeof Ionicons.glyphMap) || 'link-outline',
        active: row.is_active !== false,
        displayOrder: row.display_order ?? 0,
      }));

      // Merge DB links with curated defaults, avoiding duplicate URLs/titles
      const merged = [...defaults];
      for (const d of dbLinks) {
        const idx = merged.findIndex(
          (m) => m.url.toLowerCase() === d.url.toLowerCase() || m.title.toLowerCase() === d.title.toLowerCase()
        );
        if (idx >= 0) {
          merged[idx] = { ...merged[idx], ...d };
        } else {
          merged.push(d);
        }
      }
      return merged.filter((l) => l.active);
    }
  } catch (err) {
    console.warn('[PortalLinks] Failed to fetch from Supabase, using defaults:', err);
  }

  return defaults.filter((l) => l.active);
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
