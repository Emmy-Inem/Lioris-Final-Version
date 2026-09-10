import React, { useState } from'react';
import { OnboardingShell } from'@/components/OnboardingShell';
import { AppTextField } from'@/components/AppTextField';
import { AppButton } from'@/components/AppButton';
import { useAdvanceOnboarding } from '@/auth/useAdvanceOnboarding';
import { updateMyProfile } from '@/api/profile';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/auth/AuthContext';

export default function CompleteProfileScreen() {
 const advance = useAdvanceOnboarding('/(auth)/onboarding/complete-profile');
 const toast = useToast();
 const { user } = useAuth();
 const [bio, setBio] = useState('');
 const [submitting, setSubmitting] = useState(false);

 async function handleContinue() {
 setSubmitting(true);
 try {
 if (bio.trim()) {
 await updateMyProfile({ bio: bio.trim() });
 }
 await advance();
 } catch {
 // Advancing anyway keeps a failed save from trapping someone in
 // onboarding, but staying silent meant their answer was dropped and
 // they'd reach the dashboard missing it with no idea why.
 toast.warning('We couldn\u2019t save that just now - you can add it later in Settings.');
 await advance();
 } finally {
 setSubmitting(false);
 }
 }

 return (
 <OnboardingShell
 currentPath="/(auth)/onboarding/complete-profile"title="Tell people a bit about you"subtitle="A short bio shows up on your profile and in the directory."footer={<AppButton label={bio ? 'Continue' : 'Skip for now'} onPress={handleContinue} loading={submitting} fullWidth />}
 >
 <AppTextField
 label="Bio"value={bio}
 onChangeText={setBio}
 // This step is shared by the student and alumni chains, so the hint
 // has to match who's reading it - alumni were being asked to describe
 // themselves as a "Junior studying CS".
 placeholder={
 user?.role === 'alumni'
 ? 'e.g. Class of 2019, product engineer, happy to mentor.'
 : 'e.g. Junior studying CS, into robotics and hiking.'
 }
 multiline
 numberOfLines={4}
 />
 </OnboardingShell>
 );
}
