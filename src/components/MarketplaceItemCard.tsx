import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useSegments } from 'expo-router';
import { Ionicons } from'@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { SolidCard } from'./SolidCard';
import { AppText } from'./AppText';
import { AppButton } from'./AppButton';
import { Avatar } from'./Avatar';
import { Badge } from './Badge';
import { SellItemModal } from './SellItemModal';
import { useTheme } from'@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { heroTextShadowStyle } from '@/theme/heroTextShadow';
import { MarketplaceListing } from'@/api/types';
import { isWishlisted, toggleWishlist, markListingSold, deleteListing } from '@/api/marketplace';
import { SAVED_ITEMS_KEY, subscribeSavedItems } from '@/api/bookmarks';
import { useSignedUrl } from '@/api/signedUrls';
import { submitReport } from '@/api/moderation';
import { getOrCreateConversationWithUser, sendMessage } from '@/api/messaging';
import { useAuth } from '@/auth/AuthContext';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { formatConvertedPrice } from '@/api/currency';
import { haptics } from '@/utils/haptics';

interface MarketplaceItemOverrides {
  title?: string;
  price?: string;
  condition?: MarketplaceListing['condition'];
  imageUrl?: string | null;
  isSold?: boolean;
}

function trustLabel(level: number) {
 if (level >= 10) return { icon: 'trophy'as const, color: '#FFD700' };
 if (level >= 5) return { icon: 'star'as const, color: '#C0C0C0' };
 if (level >= 3) return { icon: 'star-outline'as const, color: '#CD7F32' };
 return null;
}

export function MarketplaceItemCard({ item }: { item: MarketplaceListing }) {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const segments = useSegments();
  const roleGroup = segments[0];
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(() => isWishlisted(item.id));
  const [messaging, setMessaging] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'transfer' | 'cash'>('cash');
  const [processingOrder, setProcessingOrder] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);
  const [overrides, setOverrides] = useState<MarketplaceItemOverrides>({});
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [togglingSold, setTogglingSold] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  // Sync wishlist state reactively across cards and tabs
  useEffect(() => {
    setSaved(isWishlisted(item.id));
    const unsubscribe = subscribeSavedItems(() => {
      setSaved(isWishlisted(item.id));
    });
    return unsubscribe;
  }, [item.id]);

  // Fresh data from the list wins over a locally-applied edit/sold-toggle -
  // the overrides only bridge the gap until the next refetch.
  useEffect(() => {
    setOverrides({});
  }, [item]);

  const displayTitle = overrides.title ?? item.title;
  const displayPrice = overrides.price ?? item.price;
  const displayCondition = overrides.condition ?? item.condition;
  const displayImageUrl = overrides.imageUrl !== undefined ? overrides.imageUrl : item.imageUrl;
  // displayImageUrl is a bare storage path in the private `campus-media`
  // bucket (or, for a legacy/external row, a plain http(s) URL) - never
  // renderable directly. Resolve it to a real, short-lived signed URL here,
  // the same useSignedUrl pattern ChatThread.tsx/PodSpace.tsx use for their
  // own private media; resolveMediaUrl passes a plain http(s) value straight
  // through unchanged, so this is correct either way.
  const { url: resolvedImageUrl, loading: imageResolving } = useSignedUrl('campus-media', displayImageUrl);
  const isSold = overrides.isSold ?? !!(item as any).isSold;

  const trust = trustLabel(item.sellerTrustLevel);
  const isOwnListing = item.sellerId === 'me' || (!!user?.id && item.sellerId === user.id);
  const { isFeatureEnabled } = useFeatureFlags();
  const showConverter = isFeatureEnabled('currency_converter');
  const numericPrice = parseFloat(String(displayPrice ?? '').replace(/[^0-9.]/g, '')) || 0;

 async function handleToggleWishlist() {
 haptics.light();
 const next = await toggleWishlist(item.id, { title: displayTitle, subtitle: displayPrice, imageUrl: displayImageUrl });
 setSaved(next);
 void queryClient.invalidateQueries({ queryKey: SAVED_ITEMS_KEY() });
 void queryClient.invalidateQueries({ queryKey: SAVED_ITEMS_KEY('marketplace') });
 void queryClient.invalidateQueries({ queryKey: ['marketplace'] });
 }

 function handleReport() {
 haptics.light();
 const doReport = async (reason?: string) => {
 try {
 await submitReport({
 targetType: 'marketplace_listing',
 targetId: item.id,
 institutionCode: (item as any).campusCode,
 reason: reason?.trim() || 'Reported from the marketplace',
 });
 Alert.alert('Reported', 'Thanks - campus moderators will review this listing.');
 } catch (err: any) {
 Alert.alert('Report Failed', err?.message || 'Could not submit your report. Please try again.');
 }
 };
 if (Alert.prompt) {
 Alert.prompt(
 'Report this listing',
 'What is wrong with it?',
 [
 { text: 'Cancel', style: 'cancel' },
 { text: 'Report', style: 'destructive', onPress: (reason?: string) => doReport(reason) },
 ],
 'plain-text',
 );
 } else {
 Alert.alert('Report this listing?', 'Campus moderators will review it.', [
 { text: 'Cancel', style: 'cancel' },
 { text: 'Report', style: 'destructive', onPress: () => doReport() },
 ]);
 }
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

 async function handleSendMeetupRequest() {
 setProcessingOrder(true);
 try {
 const conversation = await getOrCreateConversationWithUser(item.sellerId, item.sellerName, item.sellerAvatarUrl);
 await sendMessage(
 conversation.id,
 `Hi ${item.sellerName}, I would like to reserve "${displayTitle}" (${displayPrice}) for campus pickup. Let's coordinate a safe in-person meetup (e.g. Student Union Building or Library foyer).`,
 );
 setProcessingOrder(false);
 setOrderComplete(true);
 setTimeout(() => {
 setOrderComplete(false);
 setCheckoutModalOpen(false);
 Alert.alert(
 'Meetup Request Sent ',
 `Your reservation for "${displayTitle}" was delivered to ${item.sellerName}. A chat thread has been opened to coordinate handover.`,
 [
 {
 text: 'Open Chat',
 onPress: () => router.push(`/${roleGroup}/messages/${conversation.id}` as any),
 },
 { text: 'Done', style: 'cancel' },
 ],
 );
 }, 600);
 } catch {
 setProcessingOrder(false);
 Alert.alert(
 'Request Not Sent',
 'We could not message the seller. Check your connection and try again. No payment has been taken.',
 );
 }
 }

 async function handleToggleSold() {
 haptics.light();
 const next = !isSold;
 setTogglingSold(true);
 try {
 await markListingSold(item.id, next);
 setOverrides((prev) => ({ ...prev, isSold: next }));
 queryClient.invalidateQueries({ queryKey: ['marketplace'] });
 } catch (err: any) {
 haptics.error();
 Alert.alert(
 next ? 'Could Not Mark Sold' : 'Could Not Mark Available',
 err?.message || 'Please try again.',
 );
 } finally {
 setTogglingSold(false);
 }
 }

 async function handleDelete() {
 setDeleting(true);
 try {
 await deleteListing(item.id);
 haptics.medium();
 queryClient.invalidateQueries({ queryKey: ['marketplace'] });
 setDeleted(true);
 } catch (err: any) {
 haptics.error();
 Alert.alert('Delete Failed', err?.message || 'The listing could not be removed. Please try again.');
 } finally {
 setDeleting(false);
 }
 }

 function confirmDelete() {
 haptics.light();
 Alert.alert(
 'Delete Your Listing',
 'Are you sure you want to remove this listing from the marketplace? This cannot be undone.',
 [
 { text: 'Cancel', style: 'cancel' },
 { text: 'Delete Listing', style: 'destructive', onPress: () => { handleDelete(); } },
 ],
 );
 }

 if (deleted) return null;

  return (
    <SolidCard radius={18} padded={false} style={{ flex: 1 }}>
      <View style={{ height: 100, backgroundColor: colors.divider, borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden', opacity: isSold ? 0.5 : 1 }}>
        {resolvedImageUrl ? (
          <Image
            source={{ uri: resolvedImageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
          />
        ) : imageResolving ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.divider }}>
            <ActivityIndicator size="small" color={colors.textSecondary} />
          </View>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.divider }}>
            <Ionicons name="pricetag-outline" size={28} color={colors.textSecondary} />
          </View>
        )}
        <View style={{ position: 'absolute', top: 6, left: 6, zIndex: 2 }}>
          {resolvedImageUrl ? (
            <AppText variant="caption" weight="bold" tone="inverse" style={[{ fontSize: 11 }, heroTextShadowStyle]}>
              {displayCondition}
            </AppText>
          ) : (
            // No photo backdrop - falls back to the neutral placeholder
            // background, where white shadow-text is illegible.
            <AppText variant="caption" weight="bold" tone="secondary" style={{ fontSize: 11 }}>
              {displayCondition}
            </AppText>
          )}
        </View>
 <View style={{ position: 'absolute', top: 4, right: 4, flexDirection: 'row', gap: 4 }}>
 {!isOwnListing ? (
 <Pressable
 onPress={handleReport}
 accessibilityRole="button"
 accessibilityLabel="Report this listing"
 style={{
 width: 24,
 height: 24,
 borderRadius: 12,
 backgroundColor: 'rgba(0,0,0,0.45)',
 alignItems: 'center',
 justifyContent: 'center',
 }}
 >
 <Ionicons name="flag-outline" size={12} color="#FFFFFF" />
 </Pressable>
 ) : null}
 <Pressable
 onPress={handleToggleWishlist}
 accessibilityRole="button"accessibilityState={{ selected: saved }}
 accessibilityLabel={saved ? 'Remove from wishlist' : 'Add to wishlist'}
 style={{
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
 </View>

 <View style={{ padding: spacing.sm }}>
 {isSold ? (
 <View style={{ marginBottom: 2 }}>
 <Badge label="Sold" tone="critical" />
 </View>
 ) : null}
 <AppText variant="bodySmall"weight="bold" style={{ marginBottom: 2 }}>
 {displayTitle}
 </AppText>
 <View style={{ marginBottom: spacing.xs }}>
    <AppText weight="bold">
      {displayPrice}
    </AppText>
    {showConverter && numericPrice > 0 ? (
      <AppText variant="caption" tone="secondary" style={{ fontSize: 11, marginTop: 1 }}>
        ≈ {formatConvertedPrice(numericPrice, 'USD')} • {formatConvertedPrice(numericPrice, 'EUR')}
      </AppText>
    ) : null}
  </View>

 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
 <Avatar name={item.sellerName} uri={item.sellerAvatarUrl} size={14} />
 <AppText variant="caption"tone="secondary" style={{ flex: 1, minWidth: 0 }}>
 {item.sellerName}
 </AppText>
 </View>
 {item.sellerVerified ? (
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
 {trust ? <Ionicons name={trust.icon} size={10} color={trust.color} /> : null}
 <AppText variant="caption"weight="bold"tone="secondary"style={{ fontSize: 11, letterSpacing: 0.2 }}>
 Verified
 </AppText>
 </View>
 ) : null}
 </View>

 {!isOwnListing ? (
 isSold ? (
 <AppText variant="caption" tone="secondary" style={{ fontSize: 11, marginTop: spacing.xs }}>
 This item has been sold.
 </AppText>
 ) : (
 <View style={{ flexDirection: 'row', gap: 4, marginTop: spacing.xs }}>
 <Pressable
 onPress={() => setCheckoutModalOpen(true)}
 accessibilityRole="button"accessibilityLabel={`Request a meetup for ${displayTitle}`}
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
 <Ionicons name="people"size={10} color="#FFFFFF" />
 <AppText variant="caption"weight="bold"tone="inverse"style={{ fontSize: 11 }}>
 Meetup
 </AppText>
 </Pressable>

  {isFeatureEnabled('e2ee_messaging') && (
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
      <Ionicons name="chatbubble-outline" size={10} color={colors.textPrimary} />
      <AppText variant="caption" weight="bold" style={{ fontSize: 11 }}>
        Chat
      </AppText>
    </Pressable>
  )}
  </View>
  )
  ) : (
  <View style={{ gap: 4, marginTop: spacing.xs }}>
    <View style={{ flexDirection: 'row', gap: 4 }}>
      <Pressable
        onPress={() => setEditModalOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${displayTitle}`}
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
        }}
      >
        <Ionicons name="create-outline" size={10} color={colors.textPrimary} />
        <AppText variant="caption" weight="bold" style={{ fontSize: 11 }}>
          Edit
        </AppText>
      </Pressable>

      <Pressable
        onPress={handleToggleSold}
        disabled={togglingSold}
        accessibilityRole="button"
        accessibilityLabel={isSold ? `Mark ${displayTitle} as available` : `Mark ${displayTitle} as sold`}
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          backgroundColor: isSold ? colors.divider : colors.brandPrimary,
          borderRadius: radius.sm,
          paddingVertical: 5,
          opacity: togglingSold ? 0.6 : 1,
        }}
      >
        <Ionicons name={isSold ? 'refresh' : 'checkmark-circle-outline'} size={10} color={isSold ? colors.textPrimary : '#FFFFFF'} />
        <AppText variant="caption" weight="bold" tone={isSold ? undefined : 'inverse'} style={{ fontSize: 11 }}>
          {isSold ? 'Available' : 'Mark Sold'}
        </AppText>
      </Pressable>
    </View>

    <Pressable
      onPress={confirmDelete}
      disabled={deleting}
      accessibilityRole="button"
      accessibilityLabel={`Delete ${displayTitle}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        borderWidth: 1,
        borderColor: colors.critical,
        borderRadius: radius.sm,
        paddingVertical: 5,
        opacity: deleting ? 0.6 : 1,
      }}
    >
      <Ionicons name="trash-outline" size={10} color={colors.critical} />
      <AppText variant="caption" weight="bold" tone="critical" style={{ fontSize: 11 }}>
        Delete
      </AppText>
    </Pressable>
  </View>
  )}
 </View>

      {/* Peer-to-peer meetup request modal. Lioris does not process payment. */}
      <Modal visible={checkoutModalOpen} transparent animationType="fade" onRequestClose={() => setCheckoutModalOpen(false)}>
        <View accessibilityViewIsModal
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: isDesktop ? spacing.lg : spacing.md,
            paddingBottom: Math.max(insets.bottom, 16),
          }}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCheckoutModalOpen(false)} />
          <SolidCard style={{ width: '100%', maxWidth: 460, maxHeight: '90%' }}>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Ionicons name="people" size={20} color={colors.textSecondary} />
                  <AppText variant="h3" weight="bold">
                    Campus Pickup & Handover
                  </AppText>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setCheckoutModalOpen(false)} hitSlop={8} style={{ padding: 4 }}>
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </Pressable>
              </View>

              <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
                Arrange a safe in-person campus meetup with the seller. Inspect your item thoroughly before completing payment.
              </AppText>

              <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.warning, padding: spacing.sm, borderRadius: radius.md, marginBottom: spacing.md }}>
                <AppText weight="bold" variant="bodySmall" style={{ color: colors.warning, marginBottom: 4 }}>
                  Peer-to-peer sale: no Lioris payment protection
                </AppText>
                <AppText variant="caption" tone="secondary">
                  Lioris does not process or hold payment, provide escrow, inspect this item, or guarantee the seller. Avoid advance transfers, verify the item and seller, and pay only after a safe handover.
                </AppText>
              </View>

              <View style={{ backgroundColor: colors.divider, padding: spacing.sm, borderRadius: radius.md, marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <AppText weight="bold" variant="bodySmall">
                    {displayTitle}
                  </AppText>
                  <AppText weight="bold" tone="brand">
                    {displayPrice}
                  </AppText>
                </View>
                <AppText variant="caption" tone="secondary">
                  Seller: {item.sellerName} | Condition: {displayCondition}
                </AppText>
                <AppText variant="caption" tone="brand" style={{ marginTop: 4 }}>
                  Recommended Meetup: Student Union Building (SUB) or Main Library Foyer
                </AppText>
              </View>

              <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.xs }}>
                Preferred Payment on Pickup
              </AppText>
              {[
                { id: 'transfer' as const, name: 'Bank / Mobile Transfer on Handover', icon: 'phone-portrait-outline', desc: 'Transfer directly to the seller only after inspection' },
                { id: 'cash' as const, name: 'Cash on Handover', icon: 'cash-outline', desc: 'Pay the seller directly after in-person inspection' },
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
                      <AppText tone="secondary" variant="caption" style={{ fontSize: 11 }}>
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
                  label={orderComplete ? 'Request Sent' : processingOrder ? 'Sending Request...' : 'Reserve & Request Meetup'}
                  loading={processingOrder}
                  onPress={handleSendMeetupRequest}
                />
              </View>
            </ScrollView>
          </SolidCard>
        </View>
      </Modal>

      {isOwnListing ? (
        <SellItemModal
          visible={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          listing={item}
          onUpdated={(updated) => {
            setOverrides((prev) => ({
              ...prev,
              title: updated.title,
              price: updated.price,
              condition: updated.condition,
              imageUrl: updated.imageUrl,
            }));
            queryClient.invalidateQueries({ queryKey: ['marketplace'] });
          }}
        />
      ) : null}
 </SolidCard>
 );
}
