import { MarketplaceListing } from './types';
import { supabase } from './supabase';
import { getSessionUser } from '../auth/tokenStorage';
import { generateUUID } from '../utils/uuid';

export interface MarketplaceQuery {
 q?: string;
 category?: MarketplaceListing['category'] | 'All Categories' | 'Wishlist';
 condition?: MarketplaceListing['condition'] | 'All Conditions';
 campusCode?: string;
}

import { isUserBlocked } from './connections';
import { getInstitutionForEmail } from './institutions';
import { isItemSavedSync, toggleSavedItem } from './bookmarks';

// Listings this session has *successfully* written to Supabase, kept here
// only so they render instantly before the next refetch. This is never
// mixed with mockData.ts fixtures - those are only ever added back in by
// getLocalPool() below, and only while the admin's "Mock Data Visibility"
// toggle is on.
let locallyCreatedListings: MarketplaceListing[] = [];

function getLocalPool(): MarketplaceListing[] {
 return [...locallyCreatedListings];
}

function filterListings(pool: MarketplaceListing[], query: MarketplaceQuery): MarketplaceListing[] {
 let results = pool.filter((item) => !isUserBlocked(item.sellerId));

 if (query.campusCode && query.campusCode !== 'GLOBAL') {
 results = results.filter(
 (item) => !(item as any).campusCode || (item as any).campusCode === 'GLOBAL' || (item as any).campusCode === query.campusCode,
 );
 }

 if (query.category && query.category !== 'All Categories') {
 if (query.category === 'Wishlist') {
 results = results.filter((item) => isItemSavedSync('marketplace', item.id));
 } else {
 results = results.filter((item) => item.category === query.category);
 }
 }

 if (query.condition && query.condition !== 'All Conditions') {
 results = results.filter((item) => item.condition === query.condition);
 }

 if (query.q) {
 const q = query.q.toLowerCase();
 results = results.filter(
 (item) =>
 item.title.toLowerCase().includes(q) ||
 item.description.toLowerCase().includes(q) ||
 item.sellerName.toLowerCase().includes(q),
 );
 }

 return results;
}

export async function listMarketplaceListings(query: MarketplaceQuery = {}): Promise<MarketplaceListing[]> {
 try {
 const { data: authData } = await supabase.auth.getUser();
 let userCampus = query.campusCode;
 let userRole = 'student';
 if (authData?.user?.id) {
 const { data: prof } = await supabase.from('profiles').select('campus_code, role').eq('id', authData.user.id).maybeSingle();
 if (prof?.campus_code && !userCampus) userCampus = prof.campus_code;
 if (prof?.role) userRole = prof.role;
 }

 if (!userCampus && authData?.user?.email) {
   // Domain match, not substring. The previous chain mis-assigned campuses
      // (`includes('oau')` claimed joaustin@unilag.edu.ng for OAU) and hardcoded
      // demo names above the real domain. Every demo account is @ui.edu.ng, so
      // plain domain matching already covers them.
      userCampus = getInstitutionForEmail(authData.user.email)?.code;
 }

 const isStaffOrAdmin = userRole === 'admin' || userRole === 'staff';

 // Sold listings are excluded from the default browse/search results, the
 // same way blocked sellers and off-campus listings already are below -
 // except for the viewer's own, so a seller can still find and manage a
 // listing they just marked sold.
 const viewerId = authData?.user?.id;
 let req = supabase
 .from('marketplace_listings')
 .select('*, seller:profiles(full_name, avatar_url, trust_score, campus_code, role, verification_status)')
 .order('created_at', { ascending: false });
 req = viewerId ? req.or(`is_sold.eq.false,seller_id.eq.${viewerId}`) : req.eq('is_sold', false);

 if (query.category && query.category !== 'All Categories' && query.category !== 'Wishlist') {
 req = req.eq('category', query.category);
 }

 const { data, error } = await req;

 if (error) throw error;

 const dbListings: MarketplaceListing[] = (data ?? [])
 .filter((row: any) => !isUserBlocked(row.seller_id))
  .filter((row: any) => {
    if (isStaffOrAdmin && !query.campusCode) return true;
    const targetCampus = (userCampus || 'GLOBAL').toUpperCase();
    const rowCampus = (row.campus_code || 'GLOBAL').toUpperCase();
    if (targetCampus === 'GLOBAL') {
      return rowCampus === 'GLOBAL';
    }
    return rowCampus === targetCampus || rowCampus === 'GLOBAL';
  })
 .map((row: any) => ({
 id: row.id,
 sellerId: row.seller_id,
 sellerName: row.seller?.full_name || 'Campus Student',
 sellerAvatarUrl: row.seller?.avatar_url || null,
 sellerTrustLevel: Math.max(1, Math.round((row.seller?.trust_score || 80) / 20)),
 sellerVerified: row.seller?.verification_status === 'verified' || row.seller?.role === 'admin',
 title: row.title,
 description: row.description || '',
 price: row.price_display || `₦${(row.price_kobo / 100).toLocaleString()}`,
 condition: row.condition as any,
 category: row.category as any,
 imageUrl: row.image_url,
 campusCode: row.campus_code || 'GLOBAL',
 createdAt: row.created_at,
 isSold: !!row.is_sold,
 }));

 // Merge unique - the local pool only ever contributes this session's own
 // just-created listings (always) plus seed fixtures (only when the admin
 // mock-data toggle is on).
 const local = filterListings(getLocalPool(), { ...query, campusCode: isStaffOrAdmin && !query.campusCode ? undefined : userCampus });
 const merged = [...dbListings];
 for (const item of local) {
 if (!merged.some((m) => m.id === item.id) && !isUserBlocked(item.sellerId)) {
 merged.push(item);
 }
 }
 return merged;
 } catch (err) {
 console.warn('[Marketplace] listMarketplaceListings failed, showing local pool only:', err);
 // Real failure: never fabricate a full mock catalog here. All that's
 // shown is this session's own successful creations, plus fixtures if
 // the admin has mock data turned on.
 return filterListings(getLocalPool(), query);
 }
}

export function isWishlisted(id: string): boolean {
  return isItemSavedSync('marketplace', id);
}

export async function toggleWishlist(
  id: string,
  meta?: { title?: string; subtitle?: string; imageUrl?: string | null }
): Promise<boolean> {
  const current = isItemSavedSync('marketplace', id);
  const next = !current;
  return toggleSavedItem('marketplace', id, next, meta ? {
    title: meta.title,
    subtitle: meta.subtitle,
    imageUrl: meta.imageUrl || undefined,
  } : undefined);
}



export interface CreateListingPayload {
 title: string;
 description: string;
 price: string;
 condition: MarketplaceListing['condition'];
 category: MarketplaceListing['category'];
 imageUrl?: string | null;
}

/**
 * Throws on any real failure (no authenticated seller, storage upload
 * failure that blocks the insert, or a rejected Supabase insert) instead
 * of quietly returning a fabricated "success" listing. Callers must catch
 * this and show a real error - see SellItemModal.
 */
export async function createListing(payload: CreateListingPayload): Promise<MarketplaceListing> {
 const listingId = generateUUID();
 let sellerId: string | null = null;
 let sellerName = 'You';
 let permanentImageUrl: string | null = payload.imageUrl || null;

 // Upload local device photo to Supabase Storage if present
 if (payload.imageUrl) {
 const { resolveMediaUrl } = await import('./storage');
 permanentImageUrl = await resolveMediaUrl(payload.imageUrl, 'marketplace');
 }

 const { data: authData } = await supabase.auth.getUser();
 if (authData?.user?.id) {
 sellerId = authData.user.id;
 sellerName = authData.user.user_metadata?.full_name || 'Campus Student';
 } else {
 const stored = await getSessionUser();
 if (stored?.id) {
 sellerId = stored.id;
 sellerName = stored.fullName || 'You';
 }
 }

 if (!sellerId) {
 throw new Error('You need to be signed in to publish a listing.');
 }

 let campusCode = (payload as any).campusCode;
 if (!campusCode) {
 const { data: profile } = await supabase
 .from('profiles')
 .select('campus_code')
 .eq('id', sellerId)
 .maybeSingle();
 campusCode = profile?.campus_code || 'GLOBAL';
 }
 if (!campusCode) campusCode = 'GLOBAL';

 const priceClean = Number(payload.price.replace(/[^0-9]/g, '')) || 5000;
 const { error } = await supabase.from('marketplace_listings').insert({
 id: listingId,
 seller_id: sellerId,
 campus_code: campusCode,
 title: payload.title,
 description: payload.description,
 price_kobo: priceClean * 100,
 price_display: payload.price.startsWith('₦') ? payload.price : `₦${payload.price}`,
 currency: 'NGN',
 condition: payload.condition,
 category: payload.category,
 image_url: permanentImageUrl,
 is_sold: false,
 });

 if (error) {
 console.warn('[Marketplace] Create listing Supabase error:', error.message);
 throw new Error('Could not publish your listing. Please try again.');
 }

 const created: MarketplaceListing = {
 id: listingId,
 sellerName,
 sellerAvatarUrl: null,
 sellerId,
 sellerTrustLevel: 1,
 createdAt: new Date().toISOString(),
 ...payload,
 imageUrl: permanentImageUrl,
 };

 locallyCreatedListings = [created, ...locallyCreatedListings];
 return created;
}

export interface UpdateListingPayload {
 title?: string;
 description?: string;
 price?: string;
 condition?: MarketplaceListing['condition'];
 category?: MarketplaceListing['category'];
 imageUrl?: string | null;
}

/**
 * Edits an existing listing. Mirrors createListing's contract: throws on any
 * real failure (a rejected update, or RLS silently matching zero rows because
 * the caller isn't the seller/admin/staff) instead of quietly returning a
 * fabricated "success" listing.
 */
export async function updateListing(listingId: string, updates: UpdateListingPayload): Promise<MarketplaceListing> {
 const dbUpdates: Record<string, any> = {};

 if (updates.title !== undefined) dbUpdates.title = updates.title;
 if (updates.description !== undefined) dbUpdates.description = updates.description;
 if (updates.condition !== undefined) dbUpdates.condition = updates.condition;
 if (updates.category !== undefined) dbUpdates.category = updates.category;
 if (updates.price !== undefined) {
 const priceClean = Number(updates.price.replace(/[^0-9]/g, '')) || 5000;
 dbUpdates.price_kobo = priceClean * 100;
 dbUpdates.price_display = updates.price.startsWith('₦') ? updates.price : `₦${updates.price}`;
 }
 if (updates.imageUrl !== undefined) {
 if (updates.imageUrl) {
 const { resolveMediaUrl } = await import('./storage');
 dbUpdates.image_url = await resolveMediaUrl(updates.imageUrl, 'marketplace');
 } else {
 dbUpdates.image_url = null;
 }
 }

 const { data, error } = await supabase
 .from('marketplace_listings')
 .update(dbUpdates)
 .eq('id', listingId)
 .select('*, seller:profiles(full_name, avatar_url, trust_score, campus_code, role, verification_status)')
 .maybeSingle();

 if (error || !data) {
 console.warn('[Marketplace] updateListing error:', error?.message);
 throw new Error('Could not update your listing. Please try again.');
 }

 const updated = {
 id: data.id,
 sellerId: data.seller_id,
 sellerName: data.seller?.full_name || 'Campus Student',
 sellerAvatarUrl: data.seller?.avatar_url || null,
 sellerTrustLevel: Math.max(1, Math.round((data.seller?.trust_score || 80) / 20)),
 sellerVerified: data.seller?.verification_status === 'verified' || data.seller?.role === 'admin',
 title: data.title,
 description: data.description || '',
 price: data.price_display || `₦${(data.price_kobo / 100).toLocaleString()}`,
 condition: data.condition,
 category: data.category,
 imageUrl: data.image_url,
 campusCode: data.campus_code || 'GLOBAL',
 createdAt: data.created_at,
 isSold: !!data.is_sold,
 };

 locallyCreatedListings = locallyCreatedListings.map((item) => (item.id === listingId ? { ...item, ...updated } : item));

 return updated;
}

/** Focused single-field update - the seller toggling whether their own listing is sold. */
export async function markListingSold(listingId: string, sold: boolean): Promise<void> {
 const { data, error } = await supabase
 .from('marketplace_listings')
 .update({ is_sold: sold })
 .eq('id', listingId)
 .select('id')
 .maybeSingle();

 if (error || !data) {
 console.warn('[Marketplace] markListingSold error:', error?.message);
 throw new Error(sold ? 'Could not mark this listing as sold. Please try again.' : 'Could not mark this listing as available. Please try again.');
 }

 locallyCreatedListings = locallyCreatedListings.map((item) => (item.id === listingId ? { ...item, isSold: sold } : item));
}

/** Admin/staff/seller takedown - RLS already grants sellers, admins and same-campus staff DELETE. */
export async function deleteListing(id: string): Promise<void> {
 const { error } = await supabase.from('marketplace_listings').delete().eq('id', id);
 if (error) {
 console.warn('[Marketplace] deleteListing error:', error.message);
 throw new Error('Could not remove this listing. Please try again.');
 }
 locallyCreatedListings = locallyCreatedListings.filter((item) => item.id !== id);
}
