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

import { isUserBlocked, isUserMuted } from './connections';
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
 let results = pool.filter((item) => !isUserBlocked(item.sellerId) && !isUserMuted(item.sellerId));

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

 // Sold AND expired listings are excluded from the default browse/search
 // results, the same way blocked sellers and off-campus listings already are
 // below - except for the viewer's own, so a seller can still find and
 // manage a listing they just marked sold or that has aged out (or use the
 // dedicated, unfiltered listMyMarketplaceListings "My Listings" view below).
 const viewerId = authData?.user?.id;
 const nowIso = new Date().toISOString();
 let req = supabase
 .from('marketplace_listings')
 .select('*, seller:profiles(full_name, avatar_url, trust_score, campus_code, role, verification_status)')
 .order('created_at', { ascending: false });
 // is_removed=true is an admin/staff takedown (takedownListing) - it must drop
 // out of the public browse feed exactly like a sold/expired listing does,
 // but still show up (with its reason) in the seller's own My Listings below.
 req = viewerId
 ? req.or(`and(is_sold.eq.false,expires_at.gt.${nowIso},is_removed.eq.false),seller_id.eq.${viewerId}`)
 : req.eq('is_sold', false).gt('expires_at', nowIso).eq('is_removed', false);

 if (query.category && query.category !== 'All Categories' && query.category !== 'Wishlist') {
 req = req.eq('category', query.category);
 }

 const { data, error } = await req;

 if (error) throw error;

 const dbListings: MarketplaceListing[] = (data ?? [])
 .filter((row: any) => !isUserBlocked(row.seller_id) && !isUserMuted(row.seller_id))
  .filter((row: any) => {
    if (isStaffOrAdmin && !query.campusCode) return true;
    const targetCampus = (userCampus || 'GLOBAL').toUpperCase();
    const rowCampus = (row.campus_code || 'GLOBAL').toUpperCase();
    if (targetCampus === 'GLOBAL') {
      return rowCampus === 'GLOBAL';
    }
    return rowCampus === targetCampus || rowCampus === 'GLOBAL';
  })
 .map(mapListingRow);

 // Merge unique - the local pool only ever contributes this session's own
 // just-created listings (always) plus seed fixtures (only when the admin
 // mock-data toggle is on).
 const local = filterListings(getLocalPool(), { ...query, campusCode: isStaffOrAdmin && !query.campusCode ? undefined : userCampus });
 const merged = [...dbListings];
 for (const item of local) {
 if (!merged.some((m) => m.id === item.id) && !isUserBlocked(item.sellerId) && !isUserMuted(item.sellerId)) {
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

/**
 * The signed-in seller's own listings - active, sold AND expired, with none
 * of listMarketplaceListings' browse-time filtering. Backs the "My Listings"
 * screen (src/components/MyListingsScreen.tsx), where a seller needs to find
 * and manage every listing they ever published, not just what a stranger
 * would currently see in the shared feed.
 */
export async function listMyMarketplaceListings(): Promise<MarketplaceListing[]> {
 const { data: authData } = await supabase.auth.getUser();
 let viewerId = authData?.user?.id;
 if (!viewerId) {
 const stored = await getSessionUser();
 viewerId = stored?.id;
 }
 if (!viewerId) return [];

 try {
 const { data, error } = await supabase
 .from('marketplace_listings')
 .select('*, seller:profiles(full_name, avatar_url, trust_score, campus_code, role, verification_status)')
 .eq('seller_id', viewerId)
 .order('created_at', { ascending: false });

 if (error) throw error;

 const dbListings = (data ?? []).map(mapListingRow);
 const localMine = getLocalPool().filter((item) => item.sellerId === viewerId);
 const merged = [...dbListings];
 for (const item of localMine) {
 if (!merged.some((m) => m.id === item.id)) merged.push(item);
 }
 return merged;
 } catch (err) {
 console.warn('[Marketplace] listMyMarketplaceListings failed, showing local pool only:', err);
 return getLocalPool().filter((item) => item.sellerId === viewerId);
 }
}

/**
 * Turns a DB row (plus its joined `seller` profile) into the shape the app
 * uses everywhere. Shared by listMarketplaceListings, listMyMarketplaceListings
 * and updateListing so the mapping only lives in one place.
 */
function mapListingRow(row: any): MarketplaceListing {
 const imagePaths: string[] | undefined =
 Array.isArray(row.image_paths) && row.image_paths.length > 0
 ? row.image_paths
 : row.image_path
 ? [row.image_path]
 : row.image_url
 ? [row.image_url]
 : undefined;

 return {
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
 // image_path/image_paths (bare storage paths) are the source of truth now;
 // image_url only still has a value for rows created before this fix or a
 // genuinely external link, and resolveMediaUrl/useSignedUrl pass a plain
 // http(s) value straight through unchanged either way.
 imageUrl: row.image_path || row.image_url || null,
 imageUrls: imagePaths,
 campusCode: row.campus_code || 'GLOBAL',
 createdAt: row.created_at,
 isSold: !!row.is_sold,
 expiresAt: row.expires_at || null,
 isRemoved: !!row.is_removed,
 takedownReason: row.takedown_reason ?? null,
 } as MarketplaceListing;
}

/**
 * Resolves one listing photo reference to what should be WRITTEN to the DB:
 *  - a value with no URI scheme at all is already a bare storage path - an
 *    existing photo kept unchanged through an edit - and is passed through
 *    untouched (it must never be re-uploaded, and persistMediaReference would
 *    reject it outright since it only understands http(s)/asset:/on-device
 *    URIs, not an already-stored path);
 *  - anything else (a fresh on-device pick, or a pasted http(s) link) goes
 *    through storage.ts's resolveMediaUrl (persistMediaReference), which
 *    uploads it to the private `campus-media` bucket and hands back the new
 *    bare path (or returns a safe http(s) link unchanged).
 */
async function persistListingImage(value: string): Promise<string> {
 const trimmed = value.trim();
 if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
 return trimmed;
 }
 const { resolveMediaUrl } = await import('./storage');
 return resolveMediaUrl(trimmed, 'marketplace');
}

/** Parses a free-typed price into whole Naira, or throws instead of silently publishing a fake price. */
function parsePriceOrThrow(price: string): number {
 const clean = Number(price.replace(/[^0-9]/g, ''));
 if (!Number.isFinite(clean) || clean <= 0) {
 throw new Error('Please enter a valid asking price greater than ₦0.');
 }
 return clean;
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
 /** Up to 4 photos. When set, takes priority over imageUrl - the first entry also becomes imageUrl, for back-compat. */
 imageUrls?: string[] | null;
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

 // Upload local device photo/photos to Supabase Storage if present. Each
 // becomes a bare storage path (persistListingImage), never a URL - see the
 // module header on resolveMediaUrl/persistMediaReference vs. useSignedUrl.
 const rawImages = (payload.imageUrls && payload.imageUrls.length > 0 ? payload.imageUrls : payload.imageUrl ? [payload.imageUrl] : [])
 .slice(0, 4)
 .filter((v): v is string => !!v);
 const permanentImagePaths = rawImages.length > 0 ? await Promise.all(rawImages.map(persistListingImage)) : [];
 const permanentImagePath = permanentImagePaths[0] ?? null;

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

 const priceClean = parsePriceOrThrow(payload.price);
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
 image_path: permanentImagePath,
 image_paths: permanentImagePaths.length > 0 ? permanentImagePaths : null,
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
 expiresAt: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000).toISOString(),
 ...payload,
 imageUrl: permanentImagePath,
 imageUrls: permanentImagePaths.length > 0 ? permanentImagePaths : undefined,
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
 /** Up to 4 photos. When set (including an empty array, which clears every photo), takes priority over imageUrl. */
 imageUrls?: string[] | null;
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
 const priceClean = parsePriceOrThrow(updates.price);
 dbUpdates.price_kobo = priceClean * 100;
 dbUpdates.price_display = updates.price.startsWith('₦') ? updates.price : `₦${updates.price}`;
 }
 if (updates.imageUrls !== undefined) {
 const raw = (updates.imageUrls ?? []).slice(0, 4).filter((v): v is string => !!v);
 const paths = raw.length > 0 ? await Promise.all(raw.map(persistListingImage)) : [];
 dbUpdates.image_path = paths[0] ?? null;
 dbUpdates.image_paths = paths.length > 0 ? paths : null;
 } else if (updates.imageUrl !== undefined) {
 if (updates.imageUrl) {
 const path = await persistListingImage(updates.imageUrl);
 dbUpdates.image_path = path;
 dbUpdates.image_paths = [path];
 } else {
 dbUpdates.image_path = null;
 dbUpdates.image_paths = null;
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

 const updated = mapListingRow(data);

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

/** Seller's own self-service removal, or a caller who genuinely wants it gone forever - RLS already grants sellers, admins and same-campus staff DELETE. For admin/staff-initiated moderation takedowns, prefer takedownListing() below: a hard delete with no reason and no notification left a seller's listing just vanishing with zero trace. */
export async function deleteListing(id: string): Promise<void> {
 const { error } = await supabase.from('marketplace_listings').delete().eq('id', id);
 if (error) {
 console.warn('[Marketplace] deleteListing error:', error.message);
 throw new Error('Could not remove this listing. Please try again.');
 }
 locallyCreatedListings = locallyCreatedListings.filter((item) => item.id !== id);
}

/**
 * Admin/staff moderation takedown - a soft removal, not a DELETE. Sets
 * is_removed + takedown_reason (so the listing drops out of the public
 * browse feed but still shows, with its reason, in the seller's own My
 * Listings - see the is_removed filtering in listMarketplaceListings above)
 * and notifies the seller why. RLS-enforced to the seller, admins and
 * same-campus staff, same as deleteListing/updateListing.
 */
export async function takedownListing(id: string, reason: string): Promise<void> {
 const cleanReason = reason?.trim();
 if (!cleanReason) {
 throw new Error('A reason is required to take down a listing.');
 }
 const { data, error } = await supabase
 .from('marketplace_listings')
 .update({ is_removed: true, takedown_reason: cleanReason })
 .eq('id', id)
 .select('seller_id, title')
 .maybeSingle();
 if (error || !data) {
 console.warn('[Marketplace] takedownListing error:', error?.message);
 throw new Error('Could not remove this listing. Please try again.');
 }

 locallyCreatedListings = locallyCreatedListings.map((item) =>
 item.id === id ? { ...item, isRemoved: true, takedownReason: cleanReason } : item,
 );

 // Best-effort: the takedown itself must not fail just because the notification did.
 try {
 const { createNotification } = await import('./notifications');
 await createNotification({
 recipientId: data.seller_id,
 type: 'moderation',
 title: 'Marketplace listing removed',
 body: `Your listing "${data.title || 'your listing'}" was removed by campus moderation. Reason: ${cleanReason}. Contact support if you believe this was a mistake.`,
 deepLinkPath: '/marketplace',
 });
 } catch (err) {
 console.warn('[Marketplace] takedownListing notification failed:', err);
 }
}
