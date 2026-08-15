import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { useTheme } from '@/theme/ThemeProvider';
import { MarketplaceListing } from '@/api/types';
import { isWishlisted, toggleWishlist } from '@/api/marketplace';
import { getOrCreateConversationWithUser } from '@/api/messaging';
import { haptics } from '@/utils/haptics';

function trustLabel(level: number) {
  if (level >= 10) return { icon: 'trophy' as const, color: '#FFD700' };
  if (level >= 5) return { icon: 'star' as const, color: '#C0C0C0' };
  if (level >= 3) return { icon: 'star-outline' as const, color: '#CD7F32' };
  return null;
}

export function MarketplaceItemCard({ item }: { item: MarketplaceListing }) {
  const { colors, spacing, radius } = useTheme();
  const segments = useSegments();
  const roleGroup = segments[0];
  const [saved, setSaved] = useState(isWishlisted(item.id));
  const [messaging, setMessaging] = useState(false);
  const trust = trustLabel(item.sellerTrustLevel);
  const isOwnListing = item.sellerId === 'me';

  async function handleToggleWishlist() {
    haptics.light();
    const next = await toggleWishlist(item.id);
    setSaved(next);
  }

  async function handleMessageSeller() {
    haptics.light();
    setMessaging(true);
    try {
      const conversation = await getOrCreateConversationWithUser(item.sellerId, item.sellerName, item.sellerAvatarUrl);
      router.push(`/${roleGroup}/messages/${conversation.id}` as any);
    } catch {
      Alert.alert('Couldn\u2019t start conversation', 'Please try again.');
    } finally {
      setMessaging(false);
    }
  }

  return (
    <SolidCard radius={18} padded={false} style={{ flex: 1 }}>
      <View style={{ height: 100, backgroundColor: colors.divider, borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: 6, left: 6 }}>
          <View style={{ backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
            <AppText variant="caption" weight="bold" tone="inverse" style={{ fontSize: 8 }}>
              {item.condition}
            </AppText>
          </View>
        </View>
        <Pressable
          onPress={handleToggleWishlist}
          accessibilityRole="button"
          accessibilityState={{ selected: saved }}
          accessibilityLabel={saved ? 'Remove from wishlist' : 'Add to wishlist'}
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={saved ? 'heart' : 'heart-outline'} size={13} color={saved ? '#EF4444' : '#FFFFFF'} />
        </Pressable>
      </View>

      <View style={{ padding: spacing.sm }}>
        <AppText variant="bodySmall" weight="bold" numberOfLines={2} style={{ marginBottom: 2 }}>
          {item.title}
        </AppText>
        <AppText weight="bold" tone="brand" style={{ marginBottom: spacing.xs }}>
          {item.price}
        </AppText>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
            <Avatar name={item.sellerName} uri={item.sellerAvatarUrl} size={14} />
            <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ maxWidth: 60 }}>
              {item.sellerName}
            </AppText>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 2,
              backgroundColor: `${colors.brandPrimary}14`,
              borderRadius: 4,
              paddingHorizontal: 4,
              paddingVertical: 2,
            }}
          >
            {trust ? <Ionicons name={trust.icon} size={10} color={trust.color} /> : null}
            <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 7 }}>
              Verified
            </AppText>
          </View>
        </View>

        {!isOwnListing ? (
          <Pressable
            onPress={handleMessageSeller}
            disabled={messaging}
            accessibilityRole="button"
            accessibilityLabel={`Message ${item.sellerName}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              marginTop: spacing.xs,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.sm,
              paddingVertical: 5,
              opacity: messaging ? 0.6 : 1,
            }}
          >
            <Ionicons name="chatbubble-outline" size={11} color={colors.brandPrimary} />
            <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 10 }}>
              Message
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </SolidCard>
  );
}
