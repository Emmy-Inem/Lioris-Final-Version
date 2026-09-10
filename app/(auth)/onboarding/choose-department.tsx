import React, { useState } from'react';
import { OnboardingShell } from'@/components/OnboardingShell';
import { ChipSelect } from'@/components/ChipSelect';
import { AppButton } from'@/components/AppButton';
import { useAdvanceOnboarding } from '@/auth/useAdvanceOnboarding';
import { updateMyProfile } from '@/api/profile';
import { useToast } from '@/context/ToastContext';

const DEPARTMENTS = [
 'Computer Science',
 'Engineering',
 'Business',
 'Biology',
 'Psychology',
 'Economics',
 'Art & Design',
 'Other',
];

export default function ChooseDepartmentScreen() {
 const advance = useAdvanceOnboarding('/(auth)/onboarding/choose-department');
 const toast = useToast();
 const [department, setDepartment] = useState<string | null>(null);
 const [submitting, setSubmitting] = useState(false);

 async function handleContinue() {
 if (!department) return;
 setSubmitting(true);
 try {
 await updateMyProfile({ department });
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
 currentPath="/(auth)/onboarding/choose-department"title="What's your department?"subtitle="This helps us tailor your feed and event recommendations."footer={
 <AppButton label="Continue"onPress={handleContinue} loading={submitting} disabled={!department} fullWidth />
 }
 >
 <ChipSelect
 options={DEPARTMENTS}
 selected={department ? [department] : []}
 onToggle={(value) => setDepartment(value)}
 />
 </OnboardingShell>
 );
}
