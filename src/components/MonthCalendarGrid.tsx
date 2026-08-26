import React, { useMemo, useState } from'react';
import { Pressable, View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { AppText } from'./AppText';
import { SolidCard } from'./SolidCard';
import { useTheme } from'@/theme/ThemeProvider';
import { CampusEvent } from'@/api/types';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function sameDay(a: Date, b: Date) {
 return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Ported from MonthCalendarGrid (AcademicAndEvents.kt), using real date math instead of the reference's hardcoded month lengths. */
export function MonthCalendarGrid({ events }: { events: CampusEvent[] }) {
 const { colors, spacing, radius } = useTheme();
 const today = new Date();
 const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
 const [selectedDay, setSelectedDay] = useState(today);

 const monthLabel = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

 const cells = useMemo(() => {
 const year = viewDate.getFullYear();
 const month = viewDate.getMonth();
 const firstOfMonth = new Date(year, month, 1);
 // Monday-first offset
 const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
 const daysInMonth = new Date(year, month + 1, 0).getDate();

 const result: Array<{ date: Date } | null> = [];
 for (let i = 0; i < leadingBlanks; i++) result.push(null);
 for (let d = 1; d <= daysInMonth; d++) result.push({ date: new Date(year, month, d) });
 return result;
 }, [viewDate]);

 function eventsOn(date: Date) {
 return events.filter((e) => sameDay(new Date(e.startAt), date));
 }

 const selectedEvents = eventsOn(selectedDay);

 return (
 <View>
 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
 <Pressable
 onPress={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
 hitSlop={8}
 accessibilityRole="button"accessibilityLabel="Previous month"
 >
 <Ionicons name="chevron-back"size={20} color={colors.textPrimary} />
 </Pressable>
 <AppText weight="bold">{monthLabel}</AppText>
 <Pressable
 onPress={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
 hitSlop={8}
 accessibilityRole="button"accessibilityLabel="Next month"
 >
 <Ionicons name="chevron-forward"size={20} color={colors.textPrimary} />
 </Pressable>
 </View>

 <View style={{ flexDirection: 'row', marginBottom: spacing.sm }}>
 {WEEKDAY_LABELS.map((d) => (
 <AppText key={d} variant="caption"weight="bold"style={{ flex: 1, textAlign: 'center' }}>
 {d}
 </AppText>
 ))}
 </View>

 <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
 {cells.map((cell, i) => {
 if (!cell) return <View key={i} style={{ width: '14.28%', aspectRatio: 1 }} />;
 const dayEvents = eventsOn(cell.date);
 const isSelected = sameDay(cell.date, selectedDay);
 const isToday = sameDay(cell.date, today);

 return (
 <Pressable
 key={i}
 onPress={() => setSelectedDay(cell.date)}
 accessibilityRole="button"accessibilityState={{ selected: isSelected }}
 accessibilityLabel={`${cell.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${
 dayEvents.length > 0 ? `, ${dayEvents.length} event${dayEvents.length > 1 ? 's' : ''}` : ''
 }${isToday ? ', today' : ''}`}
 style={{ width: '14.28%', aspectRatio: 1, padding: 2 }}
 >
 <View
 style={{
 flex: 1,
 borderRadius: radius.sm,
 alignItems: 'center',
 justifyContent: 'center',
 backgroundColor: isSelected
 ? colors.brandPrimary
 : dayEvents.length > 0
 ? `${colors.brandPrimary}18`
 : 'transparent',
 borderWidth: isToday && !isSelected ? 1 : 0,
 borderColor: colors.brandPrimary,
 }}
 >
 <AppText variant="bodySmall"weight="bold"tone={isSelected ? 'inverse' : 'primary'}>
 {cell.date.getDate()}
 </AppText>
 {dayEvents.length > 0 ? (
 <View
 style={{
 width: 4,
 height: 4,
 borderRadius: 2,
 marginTop: 2,
 backgroundColor: isSelected ? colors.textInverse : colors.brandPrimary,
 }}
 />
 ) : null}
 </View>
 </Pressable>
 );
 })}
 </View>

 <AppText weight="bold"variant="bodySmall"style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
 Scheduled on {selectedDay.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
 </AppText>
 {selectedEvents.length === 0 ? (
 <AppText tone="secondary"variant="bodySmall">
 No events scheduled for this date.
 </AppText>
 ) : (
 selectedEvents.map((e) => (
 <SolidCard key={e.id} radius={12} style={{ marginBottom: spacing.sm }}>
 <AppText weight="bold"variant="bodySmall">
 {e.title}
 </AppText>
 <AppText tone="secondary"variant="caption">
 {e.location}
 </AppText>
 </SolidCard>
 ))
 )}
 </View>
 );
}
