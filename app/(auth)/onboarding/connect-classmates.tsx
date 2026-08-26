import React, { useState } from'react';
import { useQuery } from'@tanstack/react-query';
import { OnboardingShell } from'@/components/OnboardingShell';
import { DirectoryCard } from'@/components/DirectoryCard';
import { AppButton } from'@/components/AppButton';
import { AppText } from'@/components/AppText';
import { searchAlumniDirectory } from'@/api/connections';
import { useAuth } from'@/auth/AuthContext';
import { useAdvanceOnboarding } from'@/auth/useAdvanceOnboarding';

export default function ConnectClassmatesScreen() {
 const { user } = useAuth();
 const advance = useAdvanceOnboarding('/(auth)/onboarding/connect-classmates');
 const { data: entries, isLoading } = useQuery({
 queryKey: ['directory', 'onboarding-suggestions'],
 queryFn: () => searchAlumniDirectory(),
 });
 const [submitting, setSubmitting] = useState(false);

 async function handleContinue() {
 setSubmitting(true);
 try {
 await advance();
 } finally {
 setSubmitting(false);
 }
 }

 return (
 <OnboardingShell
 currentPath="/(auth)/onboarding/connect-classmates"title={user?.role === 'alumni' ? 'Connect with classmates' : 'Connect with peers and alumni'}
 subtitle="A few suggested people to get your network started. You can always connect with more later."footer={<AppButton label="Continue"onPress={handleContinue} loading={submitting} fullWidth />}
 >
 {!isLoading && entries?.slice(0, 2).map((entry) => <DirectoryCard key={entry.id} entry={entry} />)}
 {!isLoading && (entries?.length ?? 0) === 0 ? (
 <AppText tone="secondary">No suggestions available yet - check the directory later.</AppText>
 ) : null}
 </OnboardingShell>
 );
}
