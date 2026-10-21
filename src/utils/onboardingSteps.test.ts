import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { GUARDIAN_STEP, nextOnboardingStep, resolveOnboardingStep, firstOnboardingStep } from '../auth/onboardingSteps.ts';

test('a stored onboarding step is only trusted while it is still a real step for the role', () => {
  assert.equal(resolveOnboardingStep('student', '/(auth)/onboarding/verify'), '/(auth)/onboarding/verify');
  assert.equal(resolveOnboardingStep('student', '/(auth)/onboarding/retired-step'), firstOnboardingStep('student'));
  assert.equal(resolveOnboardingStep('student', null), firstOnboardingStep('student'));
  assert.equal(resolveOnboardingStep(undefined, '/(auth)/onboarding/verify'), firstOnboardingStep());
});

test('a member aged 13-17 with no guardian yet gets one extra step after the profile; everyone else does not', () => {
  const profile = '/(auth)/onboarding/build-profile';
  assert.equal(nextOnboardingStep('student', profile), '/(auth)/onboarding/select-interests');
  assert.equal(nextOnboardingStep('student', profile, { needsGuardian: false }), '/(auth)/onboarding/select-interests');
  assert.equal(nextOnboardingStep('student', profile, { needsGuardian: true }), GUARDIAN_STEP);
  assert.equal(nextOnboardingStep('alumni', profile, { needsGuardian: true }), GUARDIAN_STEP);
  // the guardian step hands over to the step that would have followed the profile
  assert.equal(nextOnboardingStep('student', GUARDIAN_STEP), '/(auth)/onboarding/select-interests');
  // needsGuardian only matters straight after the profile
  assert.equal(nextOnboardingStep('student', '/(auth)/onboarding/verify', { needsGuardian: true }), '/(auth)/onboarding/get-started');
  assert.equal(nextOnboardingStep('admin', profile, { needsGuardian: true }), null);
});

test('a stored guardian step is a valid place to resume onboarding', () => {
  assert.equal(resolveOnboardingStep('student', GUARDIAN_STEP), GUARDIAN_STEP);
  assert.equal(resolveOnboardingStep('alumni', GUARDIAN_STEP), GUARDIAN_STEP);
  assert.equal(resolveOnboardingStep(undefined, GUARDIAN_STEP), firstOnboardingStep());
});
