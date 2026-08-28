import { isMockDataVisible } from './mockDataSettings';

/**
 * Wraps a real API call. If it fails (network error, 404 because the
 * endpoint doesn't exist yet, etc.) and the admin's "Mock Data Visibility"
 * toggle (Settings -> Super Admin Config) is on, returns the provided
 * fixture instead of throwing - so screens stay populated during early
 * development, before the backend in PRD Section 12.3 ships.
 *
 * isMockDataVisible() is read at call time (not just once at startup), so
 * flipping the admin toggle off immediately stops every caller of this
 * helper from ever returning fixture data again - including on failure.
 */
export async function withMockFallback<T>(
 realCall: () => Promise<T>,
 mockValue: T,
): Promise<T> {
 if (!isMockDataVisible()) {
 return realCall();
 }
 try {
 return await realCall();
 } catch {
 return mockValue;
 }
}
