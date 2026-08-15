import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { router, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
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
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'card' | 'transfer'>('wallet');
  const [processingOrder, setProcessingOrder] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);

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
      Alert.alert('Conversation Initiated', `Opening chat thread with ${item.sellerName}`);
    } finally {
      setMessaging(false);
    }
  }

  async function handleConfirmEscrowOrder() {
    setProcessingOrder(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setProcessingOrder(false);
    setOrderComplete(true);
    setTimeout(() => {
      setOrderComplete(false);
      setCheckoutModalOpen(false);
      Alert.alert(
        'Escrow Order Placed 🛡️',
        `Funds for "${item.title}" are locked in Lioris Campus Escrow. Meet ${item.sellerName} at Student Union Center to inspect and release payment.`,
      );
    }, 1200);
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
          <View style={{ flexDirection: 'row', gap: 4, marginTop: spacing.xs }}>
            <Pressable
              onPress={() => setCheckoutModalOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Buy ${item.title} with Escrow`}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                backgroundColor: colors.brandPrimary,
                borderRadius: radius.sm,
                paddingVertical: 5,
              }}
            >
              <Ionicons name="shield-checkmark" size={10} color="#FFFFFF" />
              <AppText variant="caption" weight="bold" tone="inverse" style={{ fontSize: 9 }}>
                Buy 🛡️
              </AppText>
            </Pressable>

            <Pressable
              onPress={handleMessageSeller}
              disabled={messaging}
              accessibilityRole="button"
              accessibilityLabel={`Message ${item.sellerName}`}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radius.sm,
                paddingVertical: 5,
                opacity: messaging ? 0.6 : 1,
              }}
            >
              <Ionicons name="chatbubble-outline" size={10} color={colors.brandPrimary} />
              <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 9 }}>
                Chat
              </AppText>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* Escrow Checkout Modal */}
      <Modal visible={checkoutModalOpen} transparent animationType="fade" onRequestClose={() => setCheckoutModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <SolidCard style={{ width: '100%', maxWidth: 440 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Ionicons name="shield-checkmark" size={20} color={colors.brandPrimary} />
                <AppText variant="h3" weight="bold">
                  Campus Escrow Checkout
                </AppText>
              </View>
              <Pressable onPress={() => setCheckoutModalOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
              Your money is protected. The seller is only paid after you inspect the item in person.
            </AppText>

            <View style={{ backgroundColor: colors.divider, padding: spacing.sm, borderRadius: radius.md, marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <AppText weight="bold" variant="bodySmall">
                  {item.title}
                </AppText>
                <AppText weight="bold" tone="brand">
                  {item.price}
                </AppText>
              </View>
              <AppText variant="caption" tone="secondary">
                Seller: {item.sellerName} | Condition: {item.condition}
              </AppText>
              <AppText variant="caption" tone="brand" style={{ marginTop: 4 }}>
                Recommended Meetup: Student Union Building (SUB) Ground Floor
              </AppText>
            </View>

            <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.xs }}>
              Payment Method
            </AppText>
            {[
              { id: 'wallet' as const, name: 'Campus Student Wallet', icon: 'wallet-outline', desc: 'Instant 0% transaction fee' },
              { id: 'card' as const, name: 'Debit Card (Mastercard / Visa / Verve)', icon: 'card-outline', desc: 'Secure payment gateway' },
              { id: 'transfer' as const, name: 'Direct Bank Transfer', icon: 'business-outline', desc: 'Dedicated dynamic account' },
            ].map((method) => {
              const isSelected = paymentMethod === method.id;
              return (
                <Pressable
                  key={method.id}
                  onPress={() => setPaymentMethod(method.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.sm,
                    padding: spacing.sm,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.brandPrimary : colors.border,
                    backgroundColor: isSelected ? colors.pastelPrimaryBg : colors.surface,
                    marginBottom: spacing.xs,
                  }}
                >
                  <Ionicons name={method.icon as any} size={18} color={isSelected ? colors.brandPrimary : colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <AppText weight="bold" variant="caption">
                      {method.name}
                    </AppText>
                    <AppText tone="secondary" variant="caption" style={{ fontSize: 9 }}>
                      {method.desc}
                    </AppText>
                  </View>
                  {isSelected ? <Ionicons name="checkmark-circle" size={16} color={colors.brandPrimary} /> : null}
                </Pressable>
              );
            })}

            <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.md }}>
              <AppButton label="Cancel" variant="ghost" onPress={() => setCheckoutModalOpen(false)} />
              <AppButton
                label={orderComplete ? 'Order Placed! ✓' : processingOrder ? 'Securing Funds...' : `Pay ${item.price} into Escrow`}
                loading={processingOrder}
                onPress={handleConfirmEscrowOrder}
              />
            </View>
          </SolidCard>
        </View>
      </Modal>
    </SolidCard>
  );
}
