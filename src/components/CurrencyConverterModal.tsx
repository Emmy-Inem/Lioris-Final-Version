import React, { useState, useEffect } from 'react';
import { Modal, View, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { SolidCard } from './SolidCard';
import { Badge } from './Badge';
import { AppTextField } from './AppTextField';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { haptics } from '@/utils/haptics';
import {
  CurrencyCode,
  SUPPORTED_CURRENCIES,
  fetchExchangeRates,
  convertFromNgn,
  CurrencyRateInfo,
} from '@/api/currency';

interface CurrencyConverterModalProps {
  visible: boolean;
  onClose: () => void;
  initialAmount?: number;
}

const PRESET_AMOUNTS = [5000, 20000, 50000, 100000, 250000];

export function CurrencyConverterModal({ visible, onClose, initialAmount = 25000 }: CurrencyConverterModalProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();

  const [amountStr, setAmountStr] = useState(String(initialAmount));
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>('USD');
  const [rateData, setRateData] = useState<CurrencyRateInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      fetchExchangeRates()
        .then((data) => setRateData(data))
        .finally(() => setLoading(false));
    }
  }, [visible]);

  const numAmount = parseFloat(amountStr) || 0;
  const convertedValue = convertFromNgn(numAmount, selectedCurrency);
  const selectedMeta = SUPPORTED_CURRENCIES.find((c) => c.code === selectedCurrency) || SUPPORTED_CURRENCIES[1];

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              width: isDesktop ? 520 : '92%',
              maxHeight: '90%',
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.divider }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <View style={[styles.iconPill, { backgroundColor: colors.divider }]}>
                <Ionicons name="cash-outline" size={20} color={colors.textSecondary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="h3" weight="bold" numberOfLines={1}>
                  Live Currency & FX Rates
                </AppText>
                <AppText variant="caption" tone="secondary" numberOfLines={1}>
                  Real-time interbank conversions for campus trade & gifts
                </AppText>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={[styles.closeBtn, { backgroundColor: colors.divider }]}>
              <Ionicons name="close" size={18} color={colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 12 }}>
            {/* Input Amount in NGN */}
            <AppTextField
              label="Amount in Nigerian Naira (₦ NGN)"
              value={amountStr}
              onChangeText={setAmountStr}
              placeholder="e.g. 50000"
              keyboardType="numeric"
            />

            {/* Quick Amount Chips */}
            <View>
              <AppText variant="caption" tone="secondary" style={{ marginBottom: 6 }}>
                Quick Presets:
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {PRESET_AMOUNTS.map((amt) => (
                  <Pressable
                    key={amt}
                    onPress={() => {
                      haptics.light();
                      setAmountStr(String(amt));
                    }}
                    style={[
                      styles.presetChip,
                      {
                        backgroundColor: numAmount === amt ? colors.brandPrimary : colors.divider,
                        borderColor: numAmount === amt ? colors.brandPrimary : colors.border,
                      },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      weight="bold"
                      style={{ color: numAmount === amt ? '#FFFFFF' : colors.textPrimary, fontSize: 11 }}
                    >
                      ₦{amt.toLocaleString()}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Target Currency Selector Chips */}
            <View style={{ marginTop: 4 }}>
              <AppText variant="caption" tone="secondary" style={{ marginBottom: 6 }}>
                Convert To Currency:
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {SUPPORTED_CURRENCIES.filter((c) => c.code !== 'NGN').map((cur) => {
                  const isSelected = selectedCurrency === cur.code;
                  return (
                    <Pressable
                      key={cur.code}
                      onPress={() => {
                        haptics.light();
                        setSelectedCurrency(cur.code);
                      }}
                      style={[
                        styles.curChip,
                        {
                          backgroundColor: isSelected ? colors.brandPrimary : colors.surface,
                          borderColor: isSelected ? colors.brandPrimary : colors.border,
                        },
                      ]}
                    >
                      <AppText variant="caption" weight="bold" style={{ color: isSelected ? '#FFFFFF' : colors.textPrimary }}>
                        {cur.flag} {cur.code} ({cur.symbol})
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Result Preview Card */}
            <SolidCard
              radius={16}
              style={{
                backgroundColor: colors.divider,
                borderColor: colors.border,
                borderWidth: 1,
                padding: 16,
                alignItems: 'center',
                marginVertical: 4,
              }}
            >
              <AppText variant="caption" tone="secondary" style={{ marginBottom: 4 }}>
                Converted Value:
              </AppText>
              {loading ? (
                <ActivityIndicator size="small" color={colors.brandPrimary} />
              ) : (
                <AppText variant="h1" weight="bold" style={{ color: colors.brandPrimary, fontSize: 28 }}>
                  {selectedMeta.symbol}
                  {convertedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                  <AppText variant="bodySmall" weight="bold" tone="brand">
                    {selectedCurrency}
                  </AppText>
                </AppText>
              )}
              <AppText variant="caption" tone="secondary" style={{ marginTop: 6, fontSize: 11, textAlign: 'center' }}>
                Exchange Rate: 1 NGN ≈ {(rateData?.rates[selectedCurrency] || 0.00067).toFixed(6)} {selectedCurrency}
              </AppText>
            </SolidCard>

            {/* Live Data Attribution */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Ionicons name="shield-checkmark" size={13} color="#10B981" />
              <AppText variant="caption" tone="secondary" style={{ fontSize: 10 }}>
                Live global FX rates • Updated daily from central interbank feeds
              </AppText>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  iconPill: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  curChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
});
