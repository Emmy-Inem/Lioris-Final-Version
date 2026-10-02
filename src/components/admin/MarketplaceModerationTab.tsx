import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { Badge } from '@/components/Badge';
import { AppButton } from '@/components/AppButton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorStateView } from '@/components/ErrorStateView';
import { useTheme } from '@/theme/ThemeProvider';
import { listMarketplaceListings, deleteListing } from '@/api/marketplace';
import { MarketplaceListing } from '@/api/types';
import { recordAuditLogEntry } from '@/api/auditLog';
import { haptics } from '@/utils/haptics';

/**
 * Lets an admin browse and bulk-remove marketplace listings proactively,
 * mirroring ResourcesModerationTab's list/search/bulk-delete pattern - there
 * was previously no way to manage listings except reactively, through a
 * report landing in the Reports queue.
 */
export function MarketplaceModerationTab() {
  const { colors, spacing } = useTheme();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const { data: listings = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['marketplace-listings', 'admin-all'],
    queryFn: () => listMarketplaceListings({}),
  });

  const filtered = listings.filter((item) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.sellerName.toLowerCase().includes(q)
    );
  });

  function toggleSelected(id: string) {
    haptics.light();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function refreshAll() {
    await queryClient.invalidateQueries({ queryKey: ['marketplace-listings'] });
    await refetch();
  }

  async function removeCore(listing: MarketplaceListing) {
    await deleteListing(listing.id);
    recordAuditLogEntry({
      action: 'event_purged',
      summary: `Removed marketplace listing: "${listing.title}" by ${listing.sellerName}`,
      targetType: 'marketplace_listing',
      targetId: listing.id,
      reason: 'Administrative catalog cleanup',
    });
  }

  function handleDeleteConfirm(listing: MarketplaceListing) {
    haptics.error();
    Alert.alert(
      'Remove Listing?',
      `Permanently remove "${listing.title}" from the marketplace?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setActingId(listing.id);
            try {
              await removeCore(listing);
              await refreshAll();
              Alert.alert('Listing Removed', 'The listing has been removed from the marketplace.');
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Could not remove this listing.');
            } finally {
              setActingId(null);
            }
          },
        },
      ],
    );
  }

  function getSelectedListings(): MarketplaceListing[] {
    return filtered.filter((l) => selectedIds.has(l.id));
  }

  function handleBulkDelete() {
    const targets = getSelectedListings();
    if (targets.length === 0 || bulkProcessing) return;
    haptics.error();
    Alert.alert(
      'Remove Listings?',
      `Permanently remove ${targets.length} listing${targets.length === 1 ? '' : 's'} from the marketplace?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBulkProcessing(true);
            let succeeded = 0;
            let failed = 0;
            for (const listing of targets) {
              try {
                await removeCore(listing);
                succeeded += 1;
              } catch {
                failed += 1;
              }
            }
            await refreshAll();
            setBulkProcessing(false);
            clearSelection();
            if (failed > 0) haptics.error();
            else haptics.success();
            Alert.alert(
              'Bulk Remove Complete',
              failed > 0
                ? `${succeeded} removed, ${failed} failed. Retry the failed ones individually.`
                : `${succeeded} listing${succeeded === 1 ? '' : 's'} removed.`,
            );
          },
        },
      ],
    );
  }

  return (
    <View>
      <View style={{ marginBottom: spacing.md }}>
        <AppText variant="h3" weight="bold">
          Marketplace Listings ({filtered.length})
        </AppText>
        <AppText tone="secondary" variant="caption">
          Browse and remove listings proactively, not only when a student reports one.
        </AppText>
      </View>

      <View style={{ marginBottom: spacing.md }}>
        <AppTextField label="" placeholder="Search listings, sellers..." value={searchQuery} onChangeText={setSearchQuery} />
      </View>

      {selectedIds.size > 0 && (
        <SolidCard radius={16} style={{ marginBottom: spacing.md, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: colors.pastelPrimaryBg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 120 }}>
              <AppText weight="bold" variant="bodySmall">{selectedIds.size} selected</AppText>
            </View>
            <View style={{ flexShrink: 0 }}>
              <AppButton label="Clear" variant="ghost" size="sm" onPress={clearSelection} disabled={bulkProcessing} />
            </View>
            <View style={{ flexShrink: 0, minWidth: 130 }}>
              <AppButton label="Bulk Remove" variant="secondary" size="sm" loading={bulkProcessing} onPress={handleBulkDelete} />
            </View>
          </View>
        </SolidCard>
      )}

      {filtered.map((listing) => (
        <SolidCard key={listing.id} radius={18} style={{ padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable
              onPress={() => toggleSelected(listing.id)}
              hitSlop={8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selectedIds.has(listing.id) }}
              accessibilityLabel={`Select ${listing.title}`}
              style={{ paddingTop: 2 }}
            >
              <Ionicons
                name={selectedIds.has(listing.id) ? 'checkbox' : 'square-outline'}
                size={20}
                color={selectedIds.has(listing.id) ? colors.brandPrimary : colors.textSecondary}
              />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm }}>
                <AppText variant="body" weight="bold" style={{ flex: 1 }}>
                  {listing.title}
                </AppText>
                <Badge label={listing.category} tone="neutral" />
              </View>
              <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                {listing.price} • {listing.condition}
              </AppText>
              <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                Seller: <AppText weight="bold" variant="caption">{listing.sellerName}</AppText>
              </AppText>
              {listing.description ? (
                <AppText tone="secondary" variant="bodySmall" numberOfLines={2} style={{ marginTop: spacing.xs }}>
                  {listing.description}
                </AppText>
              ) : null}
            </View>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.sm }}>
            <AppButton
              label="Remove"
              variant="secondary"
              size="sm"
              loading={actingId === listing.id}
              onPress={() => handleDeleteConfirm(listing)}
            />
          </View>
        </SolidCard>
      ))}

      {isError ? (
        <ErrorStateView title="Could not load marketplace listings" error={error} onRetry={refetch} />
      ) : !isLoading && filtered.length === 0 ? (
        <EmptyState icon="pricetag-outline" title="No listings found" description="Active marketplace listings will appear here." />
      ) : null}
    </View>
  );
}
