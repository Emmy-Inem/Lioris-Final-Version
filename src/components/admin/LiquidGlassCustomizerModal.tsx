import React from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useLiquidGlass, PRESETS } from '@/context/LiquidGlassContext';
import { GlassCard } from '@/components/GlassCard';
import { haptics } from '@/utils/haptics';

interface LiquidGlassCustomizerModalProps {
  visible: boolean;
  onClose: () => void;
}

export function LiquidGlassCustomizerModal({ visible, onClose }: LiquidGlassCustomizerModalProps) {
  const { colors, spacing, isDark } = useTheme();
  const {
    settings,
    updateSetting,
    applyPreset,
    resetDefaults,
    getGlassBackground,
    getGlassBorderColor,
    getBackdropFilterString,
  } = useLiquidGlass();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: isDark ? '#0B1120' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  backgroundColor: 'rgba(45, 212, 191, 0.15)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(45, 212, 191, 0.3)',
                }}
              >
                <Ionicons name="sparkles" size={18} color="#2DD4BF" />
              </View>
              <View>
                <Text style={[styles.title, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                  Liquid Glass Studio
                </Text>
                <Text style={[styles.subtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  iOS 26 Translucency & Refraction Tuner
                </Text>
              </View>
            </View>

            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={isDark ? '#94A3B8' : '#64748B'} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Live Interactive Preview Card */}
            <View style={styles.previewContainer}>
              <View style={styles.previewBackgroundPattern}>
                <View style={[styles.colorBlob, { top: -20, left: 20, backgroundColor: '#3B82F6' }]} />
                <View style={[styles.colorBlob, { bottom: -10, right: 30, backgroundColor: '#EC4899' }]} />
                <View style={[styles.colorBlob, { top: 30, right: 90, backgroundColor: '#10B981' }]} />

                {/* The dynamic glass card rendered on top of background blobs */}
                <View
                  style={[
                    styles.previewGlassCard,
                    {
                      backgroundColor: getGlassBackground(isDark),
                      borderColor: getGlassBorderColor(isDark),
                    },
                    Platform.OS === 'web' &&
                      ({
                        backdropFilter: getBackdropFilterString(),
                        WebkitBackdropFilter: getBackdropFilterString(),
                      } as any),
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="water" size={16} color={colors.brandPrimary} />
                      <Text style={{ fontWeight: '700', fontSize: 13, color: isDark ? '#FFFFFF' : '#0F172A' }}>
                        Live Glass Preview
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11, color: colors.brandPrimary, fontWeight: '600' }}>
                      {Math.round((1 - settings.translucency) * 100)}% Clear
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11.5, color: isDark ? '#CBD5E1' : '#475569', lineHeight: 16 }}>
                    Substrate colors refract smoothly through this lens. Bottom navigation and floating cards adapt in real-time.
                  </Text>
                </View>
              </View>
            </View>

            {/* Quick Presets */}
            <Text style={[styles.sectionLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              PRESET STYLES
            </Text>
            <View style={styles.presetsRow}>
              {(['ios26', 'crystal', 'frosted', 'obsidian'] as const).map((key) => {
                const active = settings.preset === key;
                const labels: Record<string, string> = {
                  ios26: 'iOS 26 Liquid',
                  crystal: 'Ultra Crystal',
                  frosted: 'Soft Frost',
                  obsidian: 'Deep Obsidian',
                };
                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      haptics.light();
                      applyPreset(key);
                    }}
                    style={[
                      styles.presetButton,
                      {
                        backgroundColor: active
                          ? 'rgba(45, 212, 191, 0.15)'
                          : isDark
                          ? 'rgba(30, 41, 59, 0.6)'
                          : '#F1F5F9',
                        borderColor: active ? '#2DD4BF' : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.presetButtonText,
                        { color: active ? '#2DD4BF' : isDark ? '#E2E8F0' : '#334155' },
                      ]}
                    >
                      {labels[key]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Sliders Section */}
            <Text style={[styles.sectionLabel, { color: isDark ? '#94A3B8' : '#64748B', marginTop: 20 }]}>
              FINE-TUNE LIQUID GLASS METRICS
            </Text>

            {/* 1. Translucency Slider */}
            <View style={styles.sliderCard}>
              <View style={styles.sliderHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="eye-outline" size={15} color={colors.brandPrimary} />
                  <Text style={[styles.sliderTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                    Translucency (Alpha Transparency)
                  </Text>
                </View>
                <Text style={[styles.sliderValue, { color: colors.brandPrimary }]}>
                  {Math.round(settings.translucency * 100)}%
                </Text>
              </View>
              <Text style={styles.sliderDesc}>Lower values make glass more see-through; higher values create denser milk glass.</Text>
              <Slider
                style={styles.slider}
                minimumValue={0.12}
                maximumValue={0.85}
                step={0.01}
                value={settings.translucency}
                onValueChange={(val) => updateSetting('translucency', val)}
                minimumTrackTintColor="#2DD4BF"
                maximumTrackTintColor={isDark ? '#334155' : '#E2E8F0'}
                thumbTintColor="#2DD4BF"
              />
            </View>

            {/* 2. Blur Intensity Slider */}
            <View style={styles.sliderCard}>
              <View style={styles.sliderHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="contrast-outline" size={15} color={colors.brandPrimary} />
                  <Text style={[styles.sliderTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                    Backdrop Blur Diffusion
                  </Text>
                </View>
                <Text style={[styles.sliderValue, { color: colors.brandPrimary }]}>
                  {settings.blurIntensity}px
                </Text>
              </View>
              <Text style={styles.sliderDesc}>Optical diffusion of backgrounds behind the floating pill navigation.</Text>
              <Slider
                style={styles.slider}
                minimumValue={8}
                maximumValue={45}
                step={1}
                value={settings.blurIntensity}
                onValueChange={(val) => updateSetting('blurIntensity', val)}
                minimumTrackTintColor="#2DD4BF"
                maximumTrackTintColor={isDark ? '#334155' : '#E2E8F0'}
                thumbTintColor="#2DD4BF"
              />
            </View>

            {/* 3. Refraction Saturation Slider */}
            <View style={styles.sliderCard}>
              <View style={styles.sliderHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="color-palette-outline" size={15} color={colors.brandPrimary} />
                  <Text style={[styles.sliderTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                    Prism Refraction (Color Saturation)
                  </Text>
                </View>
                <Text style={[styles.sliderValue, { color: colors.brandPrimary }]}>
                  {settings.refractionSaturation}%
                </Text>
              </View>
              <Text style={styles.sliderDesc}>Vibrancy boost applied to colors passing through the curved liquid meniscus.</Text>
              <Slider
                style={styles.slider}
                minimumValue={100}
                maximumValue={240}
                step={5}
                value={settings.refractionSaturation}
                onValueChange={(val) => updateSetting('refractionSaturation', val)}
                minimumTrackTintColor="#2DD4BF"
                maximumTrackTintColor={isDark ? '#334155' : '#E2E8F0'}
                thumbTintColor="#2DD4BF"
              />
            </View>

            {/* 4. Specular Shine Slider */}
            <View style={styles.sliderCard}>
              <View style={styles.sliderHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="sunny-outline" size={15} color={colors.brandPrimary} />
                  <Text style={[styles.sliderTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                    Specular Surface Shine
                  </Text>
                </View>
                <Text style={[styles.sliderValue, { color: colors.brandPrimary }]}>
                  {Math.round(settings.specularShine * 100)}%
                </Text>
              </View>
              <Text style={styles.sliderDesc}>Top edge reflection simulating liquid surface tension and iPhone bevel sheen.</Text>
              <Slider
                style={styles.slider}
                minimumValue={0.0}
                maximumValue={0.50}
                step={0.02}
                value={settings.specularShine}
                onValueChange={(val) => updateSetting('specularShine', val)}
                minimumTrackTintColor="#2DD4BF"
                maximumTrackTintColor={isDark ? '#334155' : '#E2E8F0'}
                thumbTintColor="#2DD4BF"
              />
            </View>

            {/* 5. Rim Border Opacity Slider */}
            <View style={styles.sliderCard}>
              <View style={styles.sliderHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="square-outline" size={15} color={colors.brandPrimary} />
                  <Text style={[styles.sliderTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                    Hairline Rim Opacity
                  </Text>
                </View>
                <Text style={[styles.sliderValue, { color: colors.brandPrimary }]}>
                  {Math.round(settings.borderOpacity * 100)}%
                </Text>
              </View>
              <Text style={styles.sliderDesc}>Subtle edge border defining the glass boundary without harsh glowing lines.</Text>
              <Slider
                style={styles.slider}
                minimumValue={0.02}
                maximumValue={0.18}
                step={0.01}
                value={settings.borderOpacity}
                onValueChange={(val) => updateSetting('borderOpacity', val)}
                minimumTrackTintColor="#2DD4BF"
                maximumTrackTintColor={isDark ? '#334155' : '#E2E8F0'}
                thumbTintColor="#2DD4BF"
              />
            </View>

            {/* Reset Button */}
            <Pressable
              onPress={() => {
                haptics.medium();
                resetDefaults();
              }}
              style={({ pressed }) => [
                styles.resetButton,
                pressed && { opacity: 0.8 },
                { borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)' },
              ]}
            >
              <Ionicons name="refresh" size={14} color={colors.brandPrimary} />
              <Text style={[styles.resetButtonText, { color: colors.brandPrimary }]}>
                Reset to Recommended iOS 26 Defaults
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    maxHeight: '92%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewContainer: {
    marginBottom: 20,
    borderRadius: 20,
    overflow: 'hidden',
    height: 140,
    backgroundColor: '#0F172A',
  },
  previewBackgroundPattern: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  colorBlob: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    opacity: 0.8,
    filter: 'blur(20px)',
  } as any,
  previewGlassCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    overflow: 'hidden',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  presetButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  presetButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sliderCard: {
    marginBottom: 16,
    paddingVertical: 4,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  sliderTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  sliderValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  sliderDesc: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 6,
  },
  slider: {
    width: '100%',
    height: 36,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    marginBottom: 20,
  },
  resetButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
