import React, { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/utils/haptics';

interface EventCalendarPickerModalProps {
  visible: boolean;
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  onClose: () => void;
  minDate?: string;
}

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateInput(str: string): Date | null {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
}

export function EventCalendarPickerModal({
  visible,
  selectedDate,
  onSelectDate,
  onClose,
  minDate,
}: EventCalendarPickerModalProps) {
  const { colors, spacing, radius } = useTheme();

  const today = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => toIsoDate(today), [today]);
  const activeMinIso = minDate || todayIso;

  const initialDate = useMemo(() => {
    return parseDateInput(selectedDate) || today;
  }, [selectedDate, today]);

  const [viewMonth, setViewMonth] = useState<Date>(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), 1),
  );

  const monthTitle = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Grid calculation: Monday-first
  const calendarCells = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    // Sunday is 0 in JS, so Monday is 1 -> offset = (day + 6) % 7
    const leadingBlanks = (firstDay.getDay() + 6) % 7;
    const totalDays = new Date(year, month + 1, 0).getDate();

    const cells: Array<{ date: Date; iso: string; dayNum: number } | null> = [];
    for (let i = 0; i < leadingBlanks; i++) {
      cells.push(null);
    }
    for (let d = 1; d <= totalDays; d++) {
      const dt = new Date(year, month, d);
      cells.push({
        date: dt,
        iso: toIsoDate(dt),
        dayNum: d,
      });
    }
    return cells;
  }, [viewMonth]);

  function prevMonth() {
    haptics.light();
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  }

  function nextMonth() {
    haptics.light();
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));
  }

  function pickDate(iso: string) {
    haptics.medium();
    onSelectDate(iso);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="calendar" size={20} color={colors.brandPrimary} />
              <AppText weight="bold" style={{ fontSize: 16 }}>
                Select Event Date
              </AppText>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Quick Presets */}
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: spacing.md, flexWrap: 'wrap' }}>
            {[
              { label: 'Today', date: today },
              { label: 'Tomorrow', date: new Date(Date.now() + 86400000) },
              {
                label: 'This Sat',
                date: new Date(
                  Date.now() + (((6 - today.getDay() + 7) % 7 || 7) * 86400000),
                ),
              },
              { label: 'Next Week', date: new Date(Date.now() + 7 * 86400000) },
            ].map((p) => {
              const iso = toIsoDate(p.date);
              const isSelected = selectedDate === iso;
              return (
                <Pressable
                  key={p.label}
                  onPress={() => pickDate(iso)}
                  style={[
                    styles.quickPresetChip,
                    {
                      borderColor: isSelected ? colors.brandPrimary : colors.border,
                      backgroundColor: isSelected ? colors.pastelPrimaryBg : colors.surface,
                    },
                  ]}
                >
                  <AppText variant="caption" weight="semiBold" tone={isSelected ? 'brand' : 'secondary'}>
                    {p.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {/* Month Navigation */}
          <View style={styles.monthNavRow}>
            <Pressable onPress={prevMonth} style={styles.navButton} hitSlop={10}>
              <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
            </Pressable>
            <AppText weight="bold" style={{ fontSize: 15 }}>
              {monthTitle}
            </AppText>
            <Pressable onPress={nextMonth} style={styles.navButton} hitSlop={10}>
              <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
            </Pressable>
          </View>

          {/* Weekday Labels */}
          <View style={styles.weekdayRow}>
            {WEEKDAY_NAMES.map((wd) => (
              <View key={wd} style={styles.weekdayCell}>
                <AppText variant="caption" weight="semiBold" tone="secondary">
                  {wd}
                </AppText>
              </View>
            ))}
          </View>

          {/* Day Cells Grid */}
          <View style={styles.daysGrid}>
            {calendarCells.map((cell, idx) => {
              if (!cell) {
                return <View key={`blank-${idx}`} style={styles.dayCell} />;
              }

              const isPast = cell.iso < activeMinIso;
              const isSelected = cell.iso === selectedDate;
              const isToday = cell.iso === todayIso;

              return (
                <Pressable
                  key={cell.iso}
                  disabled={isPast}
                  onPress={() => pickDate(cell.iso)}
                  style={[
                    styles.dayCell,
                    isSelected && {
                      backgroundColor: colors.brandPrimary,
                      borderRadius: radius.pill,
                    },
                  ]}
                >
                  <AppText
                    variant="bodySmall"
                    weight={isSelected || isToday ? 'bold' : 'regular'}
                    style={{
                      color: isSelected
                        ? '#FFFFFF'
                        : isPast
                        ? colors.border
                        : isToday
                        ? colors.brandPrimary
                        : colors.textPrimary,
                    }}
                  >
                    {cell.dayNum}
                  </AppText>
                  {isToday && !isSelected && (
                    <View style={[styles.todayDot, { backgroundColor: colors.brandPrimary }]} />
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Footer note */}
          <View style={{ marginTop: spacing.md, alignItems: 'center' }}>
            <AppText variant="caption" tone="secondary">
              Selected: {selectedDate || 'None chosen'}
            </AppText>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface EventClockPickerModalProps {
  visible: boolean;
  title: string;
  currentTime: string; // HH:MM (24-hour)
  onSelectTime: (time: string) => void;
  onClose: () => void;
  onSelectPresetRange?: (start: string, end: string) => void;
}

const COMMON_PERIOD_PRESETS = [
  { label: 'Morning Lecture', start: '09:00', end: '11:00', icon: 'sunny-outline' as const },
  { label: 'Midday Seminar', start: '11:30', end: '13:30', icon: 'partly-sunny-outline' as const },
  { label: 'Afternoon Workshop', start: '14:00', end: '16:00', icon: 'school-outline' as const },
  { label: 'Evening Gathering', start: '16:30', end: '18:30', icon: 'cafe-outline' as const },
  { label: 'Campus Night Gala', start: '19:00', end: '22:00', icon: 'moon-outline' as const },
];

export function EventClockPickerModal({
  visible,
  title,
  currentTime,
  onSelectTime,
  onClose,
  onSelectPresetRange,
}: EventClockPickerModalProps) {
  const { colors, spacing, radius } = useTheme();

  // Parse current 24-hr time into 12-hr representation
  const parsed = useMemo(() => {
    let hour = 10;
    let minute = 0;
    if (currentTime && /^\d{1,2}:\d{2}$/.test(currentTime)) {
      const [h, m] = currentTime.split(':').map(Number);
      if (!isNaN(h)) hour = h;
      if (!isNaN(m)) minute = m;
    }
    const isPm = hour >= 12;
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return { hour12, minute, isPm };
  }, [currentTime]);

  const [selectedHour12, setSelectedHour12] = useState(parsed.hour12);
  const [selectedMinute, setSelectedMinute] = useState(parsed.minute);
  const [isPm, setIsPm] = useState(parsed.isPm);

  // Sync when reopened
  React.useEffect(() => {
    setSelectedHour12(parsed.hour12);
    setSelectedMinute(parsed.minute);
    setIsPm(parsed.isPm);
  }, [parsed]);

  function getFormatted24Hour(h12: number, min: number, pm: boolean): string {
    let h24 = h12;
    if (pm && h12 !== 12) h24 += 12;
    if (!pm && h12 === 12) h24 = 0;
    return `${pad2(h24)}:${pad2(min)}`;
  }

  function handleConfirm() {
    const formatted = getFormatted24Hour(selectedHour12, selectedMinute, isPm);
    haptics.medium();
    onSelectTime(formatted);
    onClose();
  }

  function applyPreset(preset: typeof COMMON_PERIOD_PRESETS[number]) {
    haptics.medium();
    if (onSelectPresetRange) {
      onSelectPresetRange(preset.start, preset.end);
    } else {
      onSelectTime(preset.start);
    }
    onClose();
  }

  const currentFormatted = getFormatted24Hour(selectedHour12, selectedMinute, isPm);
  const display12String = `${selectedHour12}:${pad2(selectedMinute)} ${isPm ? 'PM' : 'AM'}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="time" size={20} color={colors.brandPrimary} />
              <AppText weight="bold" style={{ fontSize: 16 }}>
                {title || 'Pick Time'}
              </AppText>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Time Display Header Card */}
          <View
            style={[
              styles.timeDisplayCard,
              { backgroundColor: colors.pastelPrimaryBg, borderColor: colors.brandPrimary },
            ]}
          >
            <AppText weight="bold" style={{ fontSize: 26, color: colors.brandPrimary }}>
              {display12String}
            </AppText>
            <AppText variant="caption" tone="secondary">
              (24-Hour: {currentFormatted})
            </AppText>
          </View>

          <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
            {/* AM / PM Selector */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: spacing.md }}>
              <Pressable
                onPress={() => {
                  haptics.light();
                  setIsPm(false);
                }}
                style={[
                  styles.ampmButton,
                  {
                    backgroundColor: !isPm ? colors.brandPrimary : colors.surface,
                    borderColor: !isPm ? colors.brandPrimary : colors.border,
                  },
                ]}
              >
                <AppText weight="bold" style={{ color: !isPm ? '#FFFFFF' : colors.textPrimary }}>
                  AM (Morning)
                </AppText>
              </Pressable>
              <Pressable
                onPress={() => {
                  haptics.light();
                  setIsPm(true);
                }}
                style={[
                  styles.ampmButton,
                  {
                    backgroundColor: isPm ? colors.brandPrimary : colors.surface,
                    borderColor: isPm ? colors.brandPrimary : colors.border,
                  },
                ]}
              >
                <AppText weight="bold" style={{ color: isPm ? '#FFFFFF' : colors.textPrimary }}>
                  PM (Afternoon / Evening)
                </AppText>
              </Pressable>
            </View>

            {/* Hour Selector (1-12) */}
            <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 6 }}>
              Choose Hour:
            </AppText>
            <View style={styles.gridContainer}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => {
                const isSelected = selectedHour12 === h;
                return (
                  <Pressable
                    key={`h-${h}`}
                    onPress={() => {
                      haptics.light();
                      setSelectedHour12(h);
                    }}
                    style={[
                      styles.circlePickerButton,
                      {
                        backgroundColor: isSelected ? colors.brandPrimary : colors.surface,
                        borderColor: isSelected ? colors.brandPrimary : colors.border,
                      },
                    ]}
                  >
                    <AppText
                      weight={isSelected ? 'bold' : 'medium'}
                      style={{ color: isSelected ? '#FFFFFF' : colors.textPrimary, fontSize: 13 }}
                    >
                      {h}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {/* Minute Selector */}
            <AppText variant="caption" weight="bold" tone="secondary" style={{ marginTop: spacing.md, marginBottom: 6 }}>
              Choose Minutes:
            </AppText>
            <View style={styles.gridContainer}>
              {[0, 15, 30, 45].map((m) => {
                const isSelected = selectedMinute === m;
                return (
                  <Pressable
                    key={`m-${m}`}
                    onPress={() => {
                      haptics.light();
                      setSelectedMinute(m);
                    }}
                    style={[
                      styles.minutePickerButton,
                      {
                        backgroundColor: isSelected ? colors.brandPrimary : colors.surface,
                        borderColor: isSelected ? colors.brandPrimary : colors.border,
                      },
                    ]}
                  >
                    <AppText
                      weight={isSelected ? 'bold' : 'medium'}
                      style={{ color: isSelected ? '#FFFFFF' : colors.textPrimary, fontSize: 13 }}
                    >
                      :{pad2(m)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {/* Campus Period Presets (1-tap complete periods) */}
            {onSelectPresetRange && (
              <View style={{ marginTop: spacing.lg }}>
                <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 6 }}>
                  Or Pick a Standard Campus Period:
                </AppText>
                <View style={{ gap: 6 }}>
                  {COMMON_PERIOD_PRESETS.map((p) => (
                    <Pressable
                      key={p.label}
                      onPress={() => applyPreset(p)}
                      style={[
                        styles.periodPresetCard,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <Ionicons name={p.icon} size={16} color={colors.brandPrimary} />
                        <AppText variant="bodySmall" weight="semiBold">
                          {p.label}
                        </AppText>
                      </View>
                      <Badge label={`${p.start} – ${p.end}`} tone="brand" />
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.md, paddingTop: spacing.xs }}>
            <View style={{ flex: 1 }}>
              <AppButton label="Cancel" variant="secondary" size="sm" onPress={onClose} />
            </View>
            <View style={{ flex: 1 }}>
              <AppButton label="Set Time" variant="primary" size="sm" onPress={handleConfirm} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  quickPresetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginBottom: 8,
  },
  navButton: {
    padding: 6,
    borderRadius: 8,
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 6,
  },
  weekdayCell: {
    width: 36,
    alignItems: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  dayCell: {
    width: '14.28%',
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
    position: 'relative',
  },
  todayDot: {
    position: 'absolute',
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  timeDisplayCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 14,
  },
  ampmButton: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  circlePickerButton: {
    width: 46,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minutePickerButton: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  periodPresetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
});
