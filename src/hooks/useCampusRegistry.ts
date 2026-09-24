import { useQuery } from '@tanstack/react-query';
import { Institution, LAUNCH_INSTITUTIONS, listCampuses } from '@/api/institutions';

/**
 * The universities on Lioris, straight from the database (readable without signing in), so a campus an
 * admin adds shows up in sign-up, onboarding and the landing page without an app update. Falls back to the
 * built-in launch list while loading or offline. Calling this also refreshes the shared registry that
 * getInstitutionForEmail() / getInstitutionByCode() read, so it is safe to call once near the app root.
 */
export function useCampusRegistry(): { campuses: Institution[]; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['campuses'],
    queryFn: listCampuses,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const all = data ?? LAUNCH_INSTITUTIONS;
  return { campuses: all.filter((c) => c.code !== 'GLOBAL' && c.isActive !== false), isLoading };
}
