import React, { useEffect, useState } from'react';
import { Modal, ScrollView, View } from'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from'react-native-reanimated';
import { AppText } from'../AppText';
import { AppTextField } from'../AppTextField';
import { AppButton } from'../AppButton';
import { ChipSelect } from'../ChipSelect';
import { useTheme } from'@/theme/ThemeProvider';
import { DashboardShortcut } from'@/api/adminShortcuts';

const ICON_OPTIONS = ['add-circle', 'book', 'document-text', 'card', 'time', 'library', 'briefcase', 'people', 'school', 'calendar'];
const COLOR_OPTIONS: DashboardShortcut['iconColor'][] = ['sage', 'rose', 'mint', 'lavender'];
const DEPARTMENTS = ['All', 'Computer Science', 'Mathematics', 'Electrical Engineering'];

interface EditShortcutModalProps {
 visible: boolean;
 onClose: () => void;
 hubType: 'student' | 'alumni';
 initial?: DashboardShortcut;
 onSave: (payload: Omit<DashboardShortcut, 'id' | 'active'>) => void;
}

export function EditShortcutModal({ visible, onClose, hubType, initial, onSave }: EditShortcutModalProps) {
 const { colors, spacing, radius } = useTheme();
 const [title, setTitle] = useState('');
 const [description, setDescription] = useState('');
 const [internalAction, setInternalAction] = useState('');
 const [icon, setIcon] = useState(ICON_OPTIONS[0]);
 const [iconColor, setIconColor] = useState<DashboardShortcut['iconColor']>('sage');
 const [department, setDepartment] = useState('All');
 const [minLevel, setMinLevel] = useState('1');
 const opacity = useSharedValue(0);
 const scale = useSharedValue(0.92);

 useEffect(() => {
 if (visible) {
 opacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
 scale.value = withSpring(1, { damping: 16, stiffness: 220 });
 } else {
 opacity.value = 0;
 scale.value = 0.92;
 }
 }, [visible, opacity, scale]);

 const animatedStyle = useAnimatedStyle(() => ({
 opacity: opacity.value,
 transform: [{ scale: scale.value }],
 }));

 useEffect(() => {
 if (initial) {
 setTitle(initial.title);
 setDescription(initial.description);
 setInternalAction(initial.internalAction);
 setIcon(initial.icon);
 setIconColor(initial.iconColor);
 setDepartment(initial.department);
 setMinLevel(String(initial.minLevel));
 } else {
 setTitle('');
 setDescription('');
 setInternalAction('');
 setIcon(ICON_OPTIONS[0]);
 setIconColor('sage');
 setDepartment('All');
 setMinLevel('1');
 }
 }, [initial, visible]);

 function handleSave() {
 onSave({
 hubType,
 icon,
 iconColor,
 title,
 description,
 internalAction: internalAction || title.toLowerCase().replace(/\s+/g, '_'),
 campusScope: 'All',
 minLevel: Number(minLevel) || 1,
 department,
 });
 onClose();
 }

 return (
 <Modal visible={visible} transparent animationType="fade"onRequestClose={onClose}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
 <Animated.View style={[{ width: '100%', maxHeight: '85%' }, animatedStyle]}>
 <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, width: '100%', maxHeight: '85%' }}>
 <AppText variant="h3"weight="bold"style={{ marginBottom: spacing.md }}>
 {initial ? 'Edit Option' : 'Add Option'}
 </AppText>
 <ScrollView showsVerticalScrollIndicator={true}>
 <AppTextField label="Title"value={title} onChangeText={setTitle} placeholder="e.g. Timetable" />
 <AppTextField label="Description"value={description} onChangeText={setDescription} multiline numberOfLines={2} />
 <AppTextField label="Internal Action key"value={internalAction} onChangeText={setInternalAction} placeholder="e.g. timetable" />

 <AppText weight="semiBold"variant="bodySmall"style={{ marginBottom: spacing.sm }}>
 Icon color
 </AppText>
 <View style={{ marginBottom: spacing.md }}>
 <ChipSelect options={COLOR_OPTIONS} selected={[iconColor]} onToggle={(v: string) => setIconColor(v as DashboardShortcut['iconColor'])} />
 </View>

 <AppText weight="semiBold"variant="bodySmall"style={{ marginBottom: spacing.sm }}>
 Department targeting
 </AppText>
 <View style={{ marginBottom: spacing.md }}>
 <ChipSelect options={DEPARTMENTS} selected={[department]} onToggle={setDepartment} />
 </View>

 <AppTextField label="Minimum level"value={minLevel} onChangeText={setMinLevel} keyboardType="number-pad" />
 </ScrollView>
 <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.md }}>
 <AppButton label="Cancel"variant="ghost"onPress={onClose} />
 <AppButton label="Save"onPress={handleSave} disabled={!title.trim()} />
 </View>
 </View>
 </Animated.View>
 </View>
 </Modal>
 );
}
