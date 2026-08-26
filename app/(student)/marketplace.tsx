import React, { useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { ChipSelect } from '@/components/ChipSelect';
import { SolidCard } from '@/components/SolidCard';
import { MarketplaceItemCard } from '@/components/MarketplaceItemCard';
import { EmptyState } from '@/components/EmptyState';
import { SellItemModal } from '@/components/SellItemModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { listMarketplaceListings, createListing } from '@/api/marketplace';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const CATEGORIES = [
 { id: 'All Categories', label: 'All Categories', icon: 'grid-outline' as const },
 { id: 'Wishlist', label: 'Wishlist & Requests', icon: 'heart-outline' as const },
 { id: 'Electronics', label: 'Electronics & Tech', icon: 'laptop-outline' as const },
 { id: 'Books/Academic', label: 'Books & Notes', icon: 'book-outline' as const },
 { id: 'Furniture/Room Accessories', label: 'Hostel & Furniture', icon: 'bed-outline' as const },
];

const CONDITIONS = ['All Conditions', 'New', 'Like New', 'Fair'];

export default function MarketplaceScreen() {
 const { colors, spacing, radius, isDark } = useTheme();
 const { isDesktop } = useResponsive();
 const queryClient = useQueryClient();
 const [query, setQuery] = useState('');
 const debouncedQuery = useDebouncedValue(query);
 const [category, setCategory] = useState('All Categories');
 const [condition, setCondition] = useState('All Conditions');
 const [sellModalOpen, setSellModalOpen] = useState(false);

 const { data: listings, isLoading } = useQuery({
 queryKey: ['marketplace', debouncedQuery, category, condition],
 queryFn: () => listMarketplaceListings({ q: debouncedQuery || undefined, category: category as any, condition: condition as any }),
 });

 async function handlePublish(payload: Parameters<typeof createListing>[0]) {
 await createListing(payload);
 queryClient.invalidateQueries({ queryKey: ['marketplace'] });
 }

 return (
 <ScreenContainer glow={false}>
 {isDesktop ? (
 <View style={{ flexDirection: 'row', gap: 24, flex: 1, paddingTop: spacing.md, paddingBottom: 30 }}>
 {/* Left Column: Filters & Escrow */}
 <View style={{ width: 260, gap: spacing.md }}>
 <View
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 backgroundColor: colors.surface,
 borderRadius: radius.md,
 paddingHorizontal: spacing.md,
 paddingVertical: 10,
 borderWidth: 1,
 borderColor: colors.border,
 gap: spacing.sm,
 }}
 >
 <Ionicons name="search" size={18} color={colors.textSecondary} />
 <TextInput
 value={query}
 onChangeText={setQuery}
 placeholder="Search items..."
 placeholderTextColor={colors.textSecondary}
 style={{ flex: 1, color: colors.textPrimary, fontSize: 13, outlineStyle: 'none' as any }}
 />
 </View>

 <SolidCard radius={18} style={{ padding: spacing.md }}>
 <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.sm }}>
 Categories �
 </AppText>
 <View style={{ gap: 4 }}>
 {CATEGORIES.map((cat) => {
 const isSelected = category === cat.id;
 return (
 <Pressable
 key={cat.id}
 onPress={() => setCategory(cat.id)}
 style={({ hovered }: any) => [
 {
 flexDirection: 'row',
 alignItems: 'center',
 gap: 10,
 paddingHorizontal: 12,
 paddingVertical: 8,
 borderRadius: radius.md,
 backgroundColor: isSelected
 ? colors.brandPrimary
 : hovered
 ? isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'
 : 'transparent',
 },
 ]}
 >
 <Ionicons
 name={cat.icon}
 size={16}
 color={isSelected ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B'}
 />
 <AppText
 variant="bodySmall"
 weight={isSelected ? 'bold' : 'medium'}
 style={{ color: isSelected ? '#FFFFFF' : isDark ? '#E2E8F0' : '#1E293B', flex: 1 }}
 >
 {cat.label}
 </AppText>
 </Pressable>
 );
 })}
 </View>
 </SolidCard>

 <Pressable
 onPress={() => setSellModalOpen(true)}
 style={{
 backgroundColor: colors.brandPrimary,
 borderRadius: radius.md,
 paddingVertical: 12,
 alignItems: 'center',
 justifyContent: 'center',
 flexDirection: 'row',
 gap: 8,
 }}
 >
 <Ionicons name="add-circle" size={18} color="#FFFFFF" />
 <AppText variant="bodySmall" weight="bold" tone="inverse">
 List an Item for Sale
 </AppText>
 </Pressable>

 <SolidCard radius={18} style={{ padding: spacing.md }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
 <Ionicons name="shield-checkmark" size={16} color="#10B981" />
 <AppText variant="bodySmall" weight="bold">Campus Escrow</AppText>
 </View>
 <AppText variant="caption" tone="secondary">
 Funds are held safely until you meet in person and inspect the item.
 </AppText>
 </SolidCard>
 </View>

 {/* Right Column: 3-Across Grid */}
 <View style={{ flex: 1 }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
 <AppText variant="h2" weight="bold">
 Listings ({(listings ?? []).length})
 </AppText>
 </View>

 <FlatList
 data={listings ?? []}
 keyExtractor={(item) => item.id}
 numColumns={3}
 columnWrapperStyle={{ gap: spacing.md }}
 contentContainerStyle={{ gap: spacing.md, paddingBottom: 40 }}
 renderItem={({ item }) => (
 <View style={{ flex: 1, minWidth: 0 }}>
 <MarketplaceItemCard item={item} />
 </View>
 )}
 showsVerticalScrollIndicator={false}
 ListEmptyComponent={!isLoading ? <EmptyState title="No listings found" description="Try a different search or filter." /> : null}
 />
 </View>
 </View>
 ) : (
 /* Mobile Layout */
 <>
 <AppHeader />

 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.md }}>
 <View>
 <AppText variant="h1" weight="bold">
 Campus Marketplace 
 </AppText>
 <AppText tone="secondary" variant="bodySmall">
 Buy & sell books, gadgets, and campus gear with escrow
 </AppText>
 </View>
 <Pressable
 onPress={() => setSellModalOpen(true)}
 accessibilityRole="button"
 accessibilityLabel="Sell an item"
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: 4,
 backgroundColor: colors.brandPrimary,
 borderRadius: radius.pill,
 paddingHorizontal: spacing.md,
 paddingVertical: 8,
 }}
 >
 <Ionicons name="add" size={18} color="#FFFFFF" />
 <AppText weight="bold" tone="inverse" variant="caption">
 List Item
 </AppText>
 </Pressable>
 </View>

 <View style={{ flex: 1 }}>
 <View
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: spacing.sm,
 backgroundColor: colors.surface,
 borderRadius: radius.pill,
 borderWidth: 1,
 borderColor: colors.border,
 paddingHorizontal: spacing.md,
 height: 42,
 marginBottom: spacing.sm,
 }}
 >
 <Ionicons name="search" size={16} color={colors.textSecondary} />
 <TextInput
 value={query}
 onChangeText={setQuery}
 placeholder="Search textbooks, tech, appliances..."
 placeholderTextColor={colors.textSecondary}
 style={{ flex: 1, color: colors.textPrimary, fontSize: 13 }}
 />
 </View>
 <View style={{ marginBottom: spacing.sm }}>
 <ChipSelect options={CATEGORIES.map((c) => c.id)} selected={[category]} onToggle={setCategory} />
 </View>
 <View style={{ marginBottom: spacing.lg }}>
 <ChipSelect options={CONDITIONS} selected={[condition]} onToggle={setCondition} />
 </View>

 <FlatList
 data={listings ?? []}
 keyExtractor={(item) => item.id}
 numColumns={2}
 columnWrapperStyle={{ gap: spacing.md }}
 contentContainerStyle={{ gap: spacing.md, paddingBottom: 130 }}
 renderItem={({ item }) => <MarketplaceItemCard item={item} />}
 showsVerticalScrollIndicator={false}
 initialNumToRender={10}
 maxToRenderPerBatch={10}
 windowSize={7}
 removeClippedSubviews
 ListEmptyComponent={!isLoading ? <EmptyState title="No listings found" description="Try a different search or filter." /> : null}
 />
 </View>

 <Pressable
 onPress={() => setSellModalOpen(true)}
 accessibilityRole="button"
 accessibilityLabel="Sell an item"
 style={{
 position: 'absolute',
 bottom: 90,
 right: spacing.lg,
 width: 52,
 height: 52,
 borderRadius: 26,
 backgroundColor: colors.brandPrimary,
 alignItems: 'center',
 justifyContent: 'center',
 shadowColor: '#000',
 shadowOffset: { width: 0, height: 4 },
 shadowOpacity: 0.2,
 shadowRadius: 8,
 elevation: 4,
 }}
 >
 <Ionicons name="add" size={26} color="#FFFFFF" />
 </Pressable>
 </>
 )}

 <SellItemModal visible={sellModalOpen} onClose={() => setSellModalOpen(false)} onPublish={handlePublish} />
 </ScreenContainer>
 );
}
