import { FALL_BACK_TO_MOCKS } from'./config';

/**
 * Wraps a real API call. If it fails (network error, 404 because the
 * endpoint doesn't exist yet, etc.) and FALL_BACK_TO_MOCKS is on, returns
 * the provided fixture instead of throwing — so screens stay populated
 * during early development, before the backend in PRD Section 12.3 ships.
 */
export async function withMockFallback<T>(
  realCall: () => Promise<T>,
  mockValue: T,
): Promise<T> {
  if (!FALL_BACK_TO_MOCKS) {
    return realCall();
  }
  try {
    return await realCall();
  } catch {
    return mockValue;
  }
}
