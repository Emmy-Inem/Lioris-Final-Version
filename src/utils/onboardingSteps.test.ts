import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { resolveOnboardingStep, firstOnboardingStep } from '../auth/onboardingSteps.ts';

test('a stored onboarding step is only trusted while it is still a real step for the role', () => {
  assert.equal(resolveOnboardingStep('student', '/(auth)/onboarding/verify'), '/(auth)/onboarding/verify');
  assert.equal(resolveOnboardingStep('student', '/(auth)/onboarding/retired-step'), firstOnboardingStep('student'));
  assert.equal(resolveOnboardingStep('student', null), firstOnboardingStep('student'));
  assert.equal(resolveOnboardingStep(undefined, '/(auth)/onboarding/verify'), firstOnboardingStep());
});
