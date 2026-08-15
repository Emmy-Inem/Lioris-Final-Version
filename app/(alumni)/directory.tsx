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
import { searchAlumniDirectory, listIncomingConnectionRequests } from '@/api/connections';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export default function AlumniDirectoryScreen() {
  const { colors, spacing } = useTheme();
  const [query, setQuery] = useState('');
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
      <AppHeader />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.lg, marginBottom: spacing.md }}>
        <AppText variant="h1" weight="bold">
          Alumni Directory
        </AppText>
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

      <AppTextField
        label=""
        placeholder="Search by name, company, industry..."
        value={query}
        onChangeText={setQuery}
      />
      <FlatList
        data={entries ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <DirectoryCard entry={item} />}
        showsVerticalScrollIndicator={false}
        onRefresh={refetch}
        refreshing={isRefetching}
        ListEmptyComponent={
          !isLoading ? <EmptyState title="No alumni found" description="Try a different search term." /> : null
        }
      />
    </ScreenContainer>
  );
}
