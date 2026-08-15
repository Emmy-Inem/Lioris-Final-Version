import { api } from './client';
import { MarketplaceListing } from './types';
import { mockMarketplaceListings } from './mockData';
import { withMockFallback } from './withMockFallback';
import { FALL_BACK_TO_MOCKS } from './config';

export interface MarketplaceQuery {
  q?: string;
  category?: MarketplaceListing['category'] | 'All Categories' | 'Wishlist';
  condition?: MarketplaceListing['condition'] | 'All Conditions';
}

let wishlistIds = new Set<string>();
// Mutable in-memory copy so a created listing actually persists for the
// session — createListing previously built and returned a listing
// object without ever storing it anywhere, so it would vanish on the
// next fetch (same bug class as listConversations before it was fixed).
let marketplaceListingsState = [...mockMarketplaceListings];

function filterMockListings(query: MarketplaceQuery): MarketplaceListing[] {
  let results = [...marketplaceListingsState];

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
  return withMockFallback(async () => {
    const { data } = await api.get<{ items: MarketplaceListing[] }>('/marketplace', { params: query });
    return data.items;
  }, filterMockListings(query));
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
  await api.post(`/marketplace/${id}/wishlist`).catch(() => {
    // Non-fatal in dev/mock mode; local wishlist state already updated.
  });
  return wishlistIds.has(id);
}

export interface CreateListingPayload {
  title: string;
  description: string;
  price: string;
  condition: MarketplaceListing['condition'];
  category: MarketplaceListing['category'];
}

export async function createListing(payload: CreateListingPayload): Promise<MarketplaceListing> {
  const created: MarketplaceListing = {
    id: `mock-listing-${Date.now()}`,
    sellerName: 'You',
    sellerAvatarUrl: null,
    sellerId: 'me',
    sellerTrustLevel: 1,
    createdAt: new Date().toISOString(),
    ...payload,
  };

  if (!FALL_BACK_TO_MOCKS) {
    const { data } = await api.post<MarketplaceListing>('/marketplace', payload);
    return data;
  }
  try {
    const { data } = await api.post<MarketplaceListing>('/marketplace', payload);
    marketplaceListingsState = [data, ...marketplaceListingsState];
    return data;
  } catch {
    marketplaceListingsState = [created, ...marketplaceListingsState];
    return created;
  }
}
