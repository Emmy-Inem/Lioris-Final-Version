import React from'react';
import { useQuery } from'@tanstack/react-query';
import { OnboardingShell } from'@/components/OnboardingShell';
import { DirectoryCard } from'@/components/DirectoryCard';
import { AppButton } from'@/components/AppButton';
import { AppText } from'@/components/AppText';
import { searchAlumniDirectory } from'@/api/connections';
import { useAdvanceOnboarding } from'@/auth/useAdvanceOnboarding';

export default function BrowseDirectoryScreen() {
  const advance = useAdvanceOnboarding('/(auth)/onboarding/browse-directory');
  const { data: entries, isLoading } = useQuery({
    queryKey: ['directory', 'onboarding-preview'],
    queryFn: () => searchAlumniDirectory(),
  });

  return (
    <OnboardingShell
      currentPath="/(auth)/onboarding/browse-directory"title="Meet fellow alumni"subtitle="Here's a preview of the alumni directory — you can search the full directory anytime."footer={<AppButton label="Continue"onPress={advance} fullWidth />}
    >
      {!isLoading && entries?.slice(0, 3).map((entry) => <DirectoryCard key={entry.id} entry={entry} />)}
      {!isLoading && (entries?.length ?? 0) === 0 ? (
        <AppText tone="secondary">No alumni profiles to preview yet.</AppText>
      ) : null}
    </OnboardingShell>
  );
}
