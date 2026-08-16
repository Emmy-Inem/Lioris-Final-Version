import { MarketplaceListing } from './types';
import { mockMarketplaceListings } from './mockData';
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

let wishlistIds = new Set<string>();
let marketplaceListingsState = [...mockMarketplaceListings];

function filterMockListings(query: MarketplaceQuery): MarketplaceListing[] {
  let results = [...marketplaceListingsState].filter((item) => !isUserBlocked(item.sellerId));

  if (query.campusCode && query.campusCode !== 'GLOBAL') {
    results = results.filter(
      (item) => !(item as any).campusCode || (item as any).campusCode === 'GLOBAL' || (item as any).campusCode === query.campusCode,
    );
  }

  if (query.category && query.category !== 'All Categories') {
    if (query.category === 'Wishlist') {
      results = results.filter((item) => wishlistIds.has(item.id));
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

    const isStaffOrAdmin = userRole === 'admin' || userRole === 'staff';

    let req = supabase
      .from('marketplace_listings')
      .select('*, seller:profiles(full_name, avatar_url, trust_score, campus_code)')
      .eq('is_sold', false)
      .order('created_at', { ascending: false });

    if (query.category && query.category !== 'All Categories' && query.category !== 'Wishlist') {
      req = req.eq('category', query.category);
    }

    const { data, error } = await req;

    if (!error && data && data.length > 0) {
      const dbListings: MarketplaceListing[] = data
        .filter((row: any) => !isUserBlocked(row.seller_id))
        .filter((row: any) => {
          if (isStaffOrAdmin && !query.campusCode) return true;
          return !userCampus || userCampus === 'GLOBAL' || !row.campus_code || row.campus_code === 'GLOBAL' || row.campus_code === userCampus;
        })
        .map((row: any) => ({
          id: row.id,
          sellerId: row.seller_id,
          sellerName: row.seller?.full_name || 'Campus Student',
          sellerAvatarUrl: row.seller?.avatar_url || null,
          sellerTrustLevel: Math.max(1, Math.round((row.seller?.trust_score || 80) / 20)),
          title: row.title,
          description: row.description || '',
          price: row.price_display || `₦${(row.price_kobo / 100).toLocaleString()}`,
          condition: row.condition as any,
          category: row.category as any,
          imageUrl: row.image_url,
          campusCode: row.campus_code || 'GLOBAL',
          createdAt: row.created_at,
        }));

      // Merge unique
      const local = filterMockListings({ ...query, campusCode: isStaffOrAdmin && !query.campusCode ? undefined : userCampus });
      const merged = [...dbListings];
      for (const item of local) {
        if (!merged.some((m) => m.id === item.id) && !isUserBlocked(item.sellerId)) {
          merged.push(item);
        }
      }
      return merged;
    }
  } catch {
    // fallback
  }

  return filterMockListings(query);
}

export function isWishlisted(id: string): boolean {
  return wishlistIds.has(id);
}

export async function toggleWishlist(id: string): Promise<boolean> {
  if (wishlistIds.has(id)) {
    wishlistIds.delete(id);
  } else {
    wishlistIds.add(id);
  }
  return wishlistIds.has(id);
}

export interface CreateListingPayload {
  title: string;
  description: string;
  price: string;
  condition: MarketplaceListing['condition'];
  category: MarketplaceListing['category'];
  imageUrl?: string | null;
}

export async function createListing(payload: CreateListingPayload): Promise<MarketplaceListing> {
  const listingId = generateUUID();
  let sellerId = 'me';
  let sellerName = 'You';
  let permanentImageUrl: string | null = payload.imageUrl || null;

  try {
    // Upload local device photo to Supabase Storage if present
    if (payload.imageUrl && !payload.imageUrl.startsWith('http://') && !payload.imageUrl.startsWith('https://')) {
      try {
        const { uploadMediaFile } = await import('./storage');
        permanentImageUrl = await uploadMediaFile('campus-media', payload.imageUrl, 'marketplace');
      } catch (uploadErr) {
        console.warn('[Marketplace] Storage upload failed, keeping original URL:', uploadErr);
      }
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

    if (sellerId && sellerId !== 'me') {
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
      }
    }
  } catch (err) {
    console.warn('[Marketplace] Create listing exception:', err);
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

  marketplaceListingsState = [created, ...marketplaceListingsState];
  return created;
}
