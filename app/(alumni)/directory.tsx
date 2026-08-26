import React, { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { DirectoryCard } from '@/components/DirectoryCard';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { searchAlumniDirectory, listIncomingConnectionRequests } from '@/api/connections';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { ManageDirectoryModal } from '@/components/admin/ManageDirectoryModal';

export default function AlumniDirectoryScreen() {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [adminManageOpen, setAdminManageOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(query);

  const { data: entries, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['directory', debouncedQuery],
    queryFn: () => searchAlumniDirectory({ q: debouncedQuery || undefined }),
  });

  const { data: incomingRequests } = useQuery({
    queryKey: ['connections', 'incoming'],
    queryFn: listIncomingConnectionRequests,
  });
  const pendingCount = incomingRequests?.length ?? 0;

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: isDesktop ? spacing.md : spacing.lg, marginBottom: spacing.md }}>
        <View>
          <AppText variant="h1" weight="bold">
            Alumni Directory
          </AppText>
          <AppText tone="secondary" variant="bodySmall">
            Network with graduates across technology, finance & engineering
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          {(user?.role === 'admin' || user?.role === 'staff') && (
            <Pressable
              onPress={() => setAdminManageOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Admin manage directory"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: colors.pastelPrimaryBg,
                borderColor: `${colors.brandPrimary}40`,
                borderWidth: 1,
                borderRadius: radius.pill,
                paddingHorizontal: spacing.sm,
                paddingVertical: 7,
              }}
            >
              <Ionicons name="settings-outline" size={15} color={colors.brandPrimary} />
              <AppText weight="bold" tone="brand" variant="caption">
                Manage
              </AppText>
            </Pressable>
          )}

          <Pressable
            onPress={() => router.push('/(alumni)/connection-requests')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.sm }}
            accessibilityRole="button"
            accessibilityLabel="Connection requests"
          >
            <View>
              <Ionicons name="person-add-outline" size={22} color={colors.brandPrimary} />
              {pendingCount > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    width: 9,
                    height: 9,
                    borderRadius: 5,
                    backgroundColor: colors.brandAccent,
                  }}
                />
              ) : null}
            </View>
            {pendingCount > 0 ? (
              <AppText tone="brand" weight="semiBold" variant="bodySmall">
                {pendingCount}
              </AppText>
            ) : null}
          </Pressable>
        </View>
      </View>

      <AppTextField
        label=""
        placeholder="Search by name, company, industry..."
        value={query}
        onChangeText={setQuery}
      />
      <FlatList
        data={entries ?? []}
        keyExtractor={(item) => item.id}
        key={isDesktop ? 'desktop-3-col' : 'mobile-1-col'}
        numColumns={isDesktop ? 3 : 1}
        columnWrapperStyle={isDesktop ? { gap: spacing.md } : undefined}
        contentContainerStyle={{ gap: spacing.md, paddingBottom: isDesktop ? 40 : 130 }}
        renderItem={({ item }) => (
          <View style={isDesktop ? { flex: 1, minWidth: 0 } : undefined}>
            <DirectoryCard entry={item} />
          </View>
        )}
        showsVerticalScrollIndicator={false}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState title="No alumni found" description="Try a different search query." />
          ) : null
        }
      />

      <ManageDirectoryModal visible={adminManageOpen} onClose={() => setAdminManageOpen(false)} />
    </ScreenContainer>
  );
}
