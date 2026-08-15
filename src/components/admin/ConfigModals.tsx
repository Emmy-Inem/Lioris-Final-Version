import React, { useState } from'react';
import { View } from'react-native';
import Slider from'@react-native-community/slider';
import { AppText } from'@/components/AppText';
import { AppTextField } from'@/components/AppTextField';
import { AppButton } from'@/components/AppButton';
import { ChipSelect } from'@/components/ChipSelect';
import { useTheme } from'@/theme/ThemeProvider';

// --- Add University Wizard (3 steps) ---
export function AddUniversityWizardContent({ onComplete }: { onComplete: () => void }) {
  const { spacing, colors, radius } = useTheme();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [abbrev, setAbbrev] = useState('');
  const [region, setRegion] = useState('');

  return (
    <View>
      <AppText tone="secondary"variant="caption"style={{ marginBottom: spacing.md }}>
        Step {step} of 3: {step === 1 ? 'Identity' : step === 2 ? 'Upload Logo' : 'Geography'}
      </AppText>
      {step === 1 && (
        <>
          <AppTextField label="University name"value={name} onChangeText={setName} />
          <AppTextField label="Abbreviation"placeholder="e.g. UNILAG"value={abbrev} onChangeText={setAbbrev} />
        </>
      )}
      {step === 2 && (
        <View
          style={{
            height: 100,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            borderStyle: 'dashed',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: spacing.md,
          }}
        >
          <AppText tone="secondary"variant="bodySmall">
            Tap to upload SVG/PNG logo
          </AppText>
        </View>
      )}
      {step === 3 && (
        <>
          <AppTextField label="Geographic region ID"value={region} onChangeText={setRegion} />
          <AppText tone="secondary"variant="caption">
            This creates a new multi-tenant database partition for {abbrev || 'this institution'}.
          </AppText>
        </>
      )}

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
        {step > 1 ? <AppButton label="Back"variant="ghost"onPress={() => setStep((s) => s - 1)} /> : null}
        <AppButton
          label={step < 3 ? 'Next step' : 'Provision node'}
          onPress={() => (step < 3 ? setStep((s) => s + 1) : onComplete())}
        />
      </View>
    </View>
  );
}

// --- Domain Authority Binding ---
export function DomainAuthorityModalContent() {
  const [domains, setDomains] = useState('@university.edu, @student.university.edu');
  return (
    <AppTextField
      label="Authoritative domains (comma-separated)"value={domains}
      onChangeText={setDomains}
      multiline
    />
  );
}

// --- XP Multiplier ---
export function XpMultiplierModalContent() {
  const { spacing } = useTheme();
  const [multiplier, setMultiplier] = useState(1);
  return (
    <View>
      <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.md }}>
        Adjusts how quickly students and alumni earn XP platform-wide.
      </AppText>
      <AppText weight="bold"style={{ marginBottom: spacing.sm }}>
        Current multiplier: {multiplier.toFixed(1)}x
      </AppText>
      <Slider minimumValue={0.5} maximumValue={3} step={0.1} value={multiplier} onValueChange={setMultiplier} />
    </View>
  );
}

// --- Level & Badges ---
export function LevelBadgesModalContent() {
  const { spacing } = useTheme();
  return (
    <View>
      <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.md }}>
        Configure level thresholds and which badges unlock at each tier.
      </AppText>
      {[1, 3, 5, 10].map((level) => (
        <View key={level} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }}>
          <AppText variant="bodySmall">Level {level}</AppText>
          <AppText variant="bodySmall"tone="secondary">
            {level === 1 ? '200' : level === 3 ? '500' : level === 5 ? '1000' : '2000'} XP
          </AppText>
        </View>
      ))}
    </View>
  );
}

// --- Seasonal Leaderboards ---
export function SeasonalLeaderboardsModalContent() {
  const { spacing, colors } = useTheme();
  const [autoReset, setAutoReset] = useState(true);
  return (
    <View>
      <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.md }}>
        Configure XP season resets, academic quarter mappings, and global tier thresholds.
      </AppText>
      <AppTextField label="Active season identifier"value="Season 4 — Fall Quarter"onChangeText={() => {}} editable={false} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText weight="semiBold"variant="bodySmall">
          Auto-reset at term end
        </AppText>
        <AppButton label={autoReset ? 'On' : 'Off'} variant={autoReset ? 'primary' : 'secondary'} onPress={() => setAutoReset((v) => !v)} />
      </View>
    </View>
  );
}

// --- Escrow Configuration ---
export function EscrowConfigModalContent() {
  const { spacing } = useTheme();
  const [holdPeriod, setHoldPeriod] = useState('48');
  const [autoRefund, setAutoRefund] = useState(true);
  return (
    <View>
      <AppTextField label="Escrow holding period (hours)"value={holdPeriod} onChangeText={setHoldPeriod} keyboardType="number-pad" />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText weight="semiBold"variant="bodySmall">
          Auto-refund on dispute
        </AppText>
        <AppButton label={autoRefund ? 'On' : 'Off'} variant={autoRefund ? 'primary' : 'secondary'} onPress={() => setAutoRefund((v) => !v)} />
      </View>
    </View>
  );
}

// --- Cloud Storage Caps ---
export function CloudStorageModalContent() {
  const [imgSize, setImgSize] = useState('5');
  const [pdfSize, setPdfSize] = useState('10');
  return (
    <View>
      <AppTextField label="Max image size (MB)"value={imgSize} onChangeText={setImgSize} keyboardType="number-pad" />
      <AppTextField label="Max PDF size (MB)"value={pdfSize} onChangeText={setPdfSize} keyboardType="number-pad" />
    </View>
  );
}

// --- Toxicity Thresholds ---
export function ToxicityThresholdsModalContent() {
  const { spacing, colors } = useTheme();
  const [score, setScore] = useState(80);
  return (
    <View>
      <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.sm }}>
        Messages scoring above this index are auto-flagged for review.
      </AppText>
      <AppText weight="bold"style={{ color: colors.critical, marginBottom: spacing.sm }}>
        Current limit: {Math.round(score)}/100
      </AppText>
      <Slider minimumValue={0} maximumValue={100} value={score} onValueChange={setScore} />
    </View>
  );
}

// --- Global Push Notification Composer ---
export function GlobalPushNotificationModalContent() {
  const { spacing } = useTheme();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  return (
    <View>
      <AppTextField label="Notification title"value={title} onChangeText={setTitle} />
      <AppTextField label="Message body"value={body} onChangeText={setBody} multiline numberOfLines={3} />
      <AppText tone="secondary"variant="caption"style={{ marginBottom: spacing.sm }}>
        Target deployment: All campuses
      </AppText>
    </View>
  );
}
