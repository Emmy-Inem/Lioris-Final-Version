import React, { useState } from 'react';
import { View } from 'react-native';
import Slider from '@react-native-community/slider';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { AppButton } from '@/components/AppButton';
import { useTheme } from '@/theme/ThemeProvider';

// --- Add University Wizard (3 steps) ---
export function AddUniversityWizardContent({
  onComplete,
}: {
  onComplete: (data: { name: string; abbrev: string; region: string }) => void;
}) {
  const { spacing, colors, radius } = useTheme();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [abbrev, setAbbrev] = useState('');
  const [region, setRegion] = useState('');

  return (
    <View>
      <AppText tone="secondary" variant="caption" style={{ marginBottom: spacing.md }}>
        Step {step} of 3: {step === 1 ? 'Identity' : step === 2 ? 'Upload Logo' : 'Geography'}
      </AppText>
      {step === 1 && (
        <>
          <AppTextField label="University name" value={name} onChangeText={setName} />
          <AppTextField label="Abbreviation" placeholder="e.g. UNILAG" value={abbrev} onChangeText={setAbbrev} />
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
          <AppText tone="secondary" variant="bodySmall">
            Tap to upload SVG/PNG logo
          </AppText>
        </View>
      )}
      {step === 3 && (
        <>
          <AppTextField label="Geographic region ID" value={region} onChangeText={setRegion} />
          <AppText tone="secondary" variant="caption">
            This creates a new multi-tenant database partition for {abbrev || 'this institution'}.
          </AppText>
        </>
      )}

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, alignItems: 'center' }}>
        {step > 1 ? <AppButton label="Back" variant="ghost" onPress={() => setStep((s) => s - 1)} /> : null}
        <View style={{ flex: 1 }}>
          <AppButton
            label={step < 3 ? 'Next step' : 'Provision node'}
            onPress={() => (step < 3 ? setStep((s) => s + 1) : onComplete({ name, abbrev, region }))}
          />
        </View>
      </View>
    </View>
  );
}

// --- Domain Authority Binding ---
export function DomainAuthorityModalContent({
  domains,
  onChangeDomains,
}: {
  domains?: string;
  onChangeDomains?: (d: string) => void;
}) {
  const [localDomains, setLocalDomains] = useState('@university.edu, @student.university.edu');
  const currentDomains = domains !== undefined ? domains : localDomains;
  const handleChange = onChangeDomains || setLocalDomains;

  return (
    <AppTextField
      label="Authoritative domains (comma-separated)"
      value={currentDomains}
      onChangeText={handleChange}
      multiline
    />
  );
}

// --- XP Multiplier ---
export function XpMultiplierModalContent({
  multiplier = 1,
  onChangeMultiplier,
}: {
  multiplier?: number;
  onChangeMultiplier?: (m: number) => void;
}) {
  const { spacing } = useTheme();
  const [localMultiplier, setLocalMultiplier] = useState(1);
  const currentVal = onChangeMultiplier ? multiplier : localMultiplier;
  const handleChange = onChangeMultiplier || setLocalMultiplier;

  return (
    <View>
      <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
        Adjusts how quickly students and alumni earn XP platform-wide.
      </AppText>
      <AppText weight="bold" style={{ marginBottom: spacing.sm }}>
        Current multiplier: {currentVal.toFixed(1)}x
      </AppText>
      <Slider
        minimumValue={0.5}
        maximumValue={3.0}
        step={0.1}
        value={currentVal}
        onValueChange={handleChange}
      />
    </View>
  );
}

// --- Level & Badges ---
export function LevelBadgesModalContent() {
  const { spacing } = useTheme();
  return (
    <View>
      <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
        Configure level thresholds and which badges unlock at each tier.
      </AppText>
      {[1, 3, 5, 10].map((level) => (
        <View key={level} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }}>
          <AppText variant="bodySmall">Level {level}</AppText>
          <AppText variant="bodySmall" tone="secondary">
            {level === 1 ? '200' : level === 3 ? '500' : level === 5 ? '1000' : '2000'} XP
          </AppText>
        </View>
      ))}
    </View>
  );
}

// --- Seasonal Leaderboards ---
export function SeasonalLeaderboardsModalContent({
  seasonName = 'Semester 1 2025/2026',
  onChangeSeasonName,
  autoReset = true,
  onChangeAutoReset,
}: {
  seasonName?: string;
  onChangeSeasonName?: (val: string) => void;
  autoReset?: boolean;
  onChangeAutoReset?: (val: boolean) => void;
}) {
  const { spacing } = useTheme();
  const [localAutoReset, setLocalAutoReset] = useState(true);
  const currentAutoReset = onChangeAutoReset ? autoReset : localAutoReset;
  const handleAutoResetToggle = onChangeAutoReset || setLocalAutoReset;

  return (
    <View>
      <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
        Configure XP season resets, academic quarter mappings, and global tier thresholds.
      </AppText>
      <AppTextField
        label="Active season identifier"
        value={seasonName}
        onChangeText={onChangeSeasonName || (() => {})}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm }}>
        <AppText weight="semiBold" variant="bodySmall">
          Auto-reset at term end
        </AppText>
        <AppButton
          label={currentAutoReset ? 'On' : 'Off'}
          variant={currentAutoReset ? 'primary' : 'secondary'}
          onPress={() => handleAutoResetToggle(!currentAutoReset)}
        />
      </View>
    </View>
  );
}

// --- Escrow Configuration ---
export function EscrowConfigModalContent({
  holdPeriod = '48',
  onChangeHoldPeriod,
  feePercent = '1.5',
  onChangeFeePercent,
  autoRefund = true,
  onChangeAutoRefund,
}: {
  holdPeriod?: string;
  onChangeHoldPeriod?: (val: string) => void;
  feePercent?: string;
  onChangeFeePercent?: (val: string) => void;
  autoRefund?: boolean;
  onChangeAutoRefund?: (val: boolean) => void;
}) {
  const { spacing } = useTheme();
  const [localHold, setLocalHold] = useState('48');
  const [localAutoRefund, setLocalAutoRefund] = useState(true);

  const currentHold = onChangeHoldPeriod ? holdPeriod : localHold;
  const handleHold = onChangeHoldPeriod || setLocalHold;

  const currentAutoRefund = onChangeAutoRefund ? autoRefund : localAutoRefund;
  const handleAutoRefund = onChangeAutoRefund || setLocalAutoRefund;

  return (
    <View>
      <AppTextField
        label="Escrow holding period (hours)"
        value={currentHold}
        onChangeText={handleHold}
        keyboardType="number-pad"
      />
      {onChangeFeePercent && (
        <AppTextField
          label="Platform escrow fee (%)"
          value={feePercent}
          onChangeText={onChangeFeePercent}
          keyboardType="decimal-pad"
        />
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm }}>
        <AppText weight="semiBold" variant="bodySmall">
          Auto-refund on dispute
        </AppText>
        <AppButton
          label={currentAutoRefund ? 'On' : 'Off'}
          variant={currentAutoRefund ? 'primary' : 'secondary'}
          onPress={() => handleAutoRefund(!currentAutoRefund)}
        />
      </View>
    </View>
  );
}

// --- Cloud Storage Caps ---
export function CloudStorageModalContent({
  imgSize = '5',
  onChangeImgSize,
  pdfSize = '10',
  onChangePdfSize,
}: {
  imgSize?: string;
  onChangeImgSize?: (val: string) => void;
  pdfSize?: string;
  onChangePdfSize?: (val: string) => void;
}) {
  const [localImg, setLocalImg] = useState('5');
  const [localPdf, setLocalPdf] = useState('10');

  const currentImg = onChangeImgSize ? imgSize : localImg;
  const currentPdf = onChangePdfSize ? pdfSize : localPdf;

  return (
    <View>
      <AppTextField
        label="Max image size (MB)"
        value={currentImg}
        onChangeText={onChangeImgSize || setLocalImg}
        keyboardType="number-pad"
      />
      <AppTextField
        label="Max PDF size (MB)"
        value={currentPdf}
        onChangeText={onChangePdfSize || setLocalPdf}
        keyboardType="number-pad"
      />
    </View>
  );
}

// --- Toxicity Thresholds ---
export function ToxicityThresholdsModalContent({
  score = 80,
  onChangeScore,
}: {
  score?: number;
  onChangeScore?: (val: number) => void;
}) {
  const { spacing, colors } = useTheme();
  const [localScore, setLocalScore] = useState(80);
  const currentScore = onChangeScore ? score : localScore;
  const handleScore = onChangeScore || setLocalScore;

  return (
    <View>
      <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
        Messages scoring above this index are auto-flagged for review.
      </AppText>
      <AppText weight="bold" style={{ color: colors.critical, marginBottom: spacing.sm }}>
        Current limit: {Math.round(currentScore)}/100
      </AppText>
      <Slider
        minimumValue={0}
        maximumValue={100}
        step={1}
        value={currentScore}
        onValueChange={handleScore}
      />
    </View>
  );
}

// --- Global Push Notification Composer ---
export function GlobalPushNotificationModalContent({
  title = '',
  onChangeTitle,
  body = '',
  onChangeBody,
}: {
  title?: string;
  onChangeTitle?: (val: string) => void;
  body?: string;
  onChangeBody?: (val: string) => void;
}) {
  const { spacing } = useTheme();
  const [localTitle, setLocalTitle] = useState('');
  const [localBody, setLocalBody] = useState('');

  const currentTitle = onChangeTitle ? title : localTitle;
  const currentBody = onChangeBody ? body : localBody;

  return (
    <View>
      <AppTextField
        label="Notification title"
        value={currentTitle}
        onChangeText={onChangeTitle || setLocalTitle}
      />
      <AppTextField
        label="Message body"
        value={currentBody}
        onChangeText={onChangeBody || setLocalBody}
        multiline
        numberOfLines={3}
      />
      <AppText tone="secondary" variant="caption" style={{ marginBottom: spacing.sm }}>
        Target deployment: All registered campus users
      </AppText>
    </View>
  );
}
