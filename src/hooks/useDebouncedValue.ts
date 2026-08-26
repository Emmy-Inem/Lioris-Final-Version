import { useEffect, useState } from'react';

/**
 * Returns `value`, but only updates after it's stopped changing for
 * `delayMs`. Used to stop search inputs from firing a new query (and,
 * against a real backend, a new network request) on every single
 * keystroke - CommunityFeedScreen and SearchScreen both had their
 * query text wired directly into a React Query key with no debounce.
 */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
 const [debounced, setDebounced] = useState(value);

 useEffect(() => {
 const timer = setTimeout(() => setDebounced(value), delayMs);
 return () => clearTimeout(timer);
 }, [value, delayMs]);

 return debounced;
}
