import React, { useState } from 'react';
import { FlatList, View, TextInput, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { DirectoryCard } from '@/components/DirectoryCard';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { searchAlumniDirectory } from '@/api/connections';
import { Ionicons } from '@expo/vector-icons';

export default function AlumniNetworkScreen() {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: alumniList, isLoading } = useQuery({
    queryKey: ['alumni', 'directory', searchQuery],
    queryFn: () => searchAlumniDirectory({ q: searchQuery.trim() || undefined }),
  });

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <View style={{ paddingTop: isDesktop ? spacing.xs : spacing.md, paddingBottom: spacing.sm }}>
        <AppText variant={isDesktop ? 'h1' : 'h2'} weight="bold">
          Alumni Network
        </AppText>
        <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>
          Discover fellow alumni, network across industries, and expand your professional circle.
        </AppText>
      </View>

      {/* Search Input Bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: spacing.md,
          paddingVertical: 10,
          marginBottom: spacing.md,
          gap: spacing.sm,
        }}
      >
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search alumni"
          placeholderTextColor={colors.textSecondary}
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontSize: 14,
            padding: 0,
          }}
        />
        {searchQuery.length > 0 && (
          <Ionicons
            name="close-circle"
            size={18}
            color={colors.textSecondary}
            onPress={() => setSearchQuery('')}
          />
        )}
      </View>

      {isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : (
        <FlatList
          data={alumniList ?? []}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          key={isDesktop ? 'desktop-2-col' : 'mobile-1-col'}
          numColumns={isDesktop ? 2 : 1}
          columnWrapperStyle={isDesktop ? { gap: spacing.md } : undefined}
          contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 130, gap: spacing.sm }}
          renderItem={({ item }) => (
            <View style={isDesktop ? { flex: 1, minWidth: 0 } : undefined}>
              <DirectoryCard entry={item} />
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              title="No alumni found"
              description={searchQuery ? 'Try adjusting your search terms.' : 'No other alumni profiles are currently registered.'}
            />
          }
        />
      )}
    </ScreenContainer>
  );
}
