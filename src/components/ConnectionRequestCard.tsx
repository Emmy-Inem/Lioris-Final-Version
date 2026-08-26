import React, { useState } from'react';
import { View } from'react-native';
import { SolidCard } from'./SolidCard';
import { AppText } from'./AppText';
import { AppButton } from'./AppButton';
import { Avatar } from'./Avatar';
import { useTheme } from'@/theme/ThemeProvider';
import { IncomingConnectionRequest } from'@/api/types';
import { respondToConnectionRequest } from'@/api/connections';

interface ConnectionRequestCardProps {
 request: IncomingConnectionRequest;
 onHandled: () => void;
}

export function ConnectionRequestCard({ request, onHandled }: ConnectionRequestCardProps) {
 const { spacing } = useTheme();
 const [submitting, setSubmitting] = useState<'accept' | 'decline' | null>(null);

 async function respond(action: 'accept' | 'decline') {
 setSubmitting(action);
 try {
 await respondToConnectionRequest(request.id, action);
 onHandled();
 } finally {
 setSubmitting(null);
 }
 }

 return (
 <SolidCard style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
 <Avatar name={request.requesterName} uri={request.requesterAvatarUrl} size={52} />
 <View style={{ flex: 1 }}>
 <AppText variant="h3"weight="bold">
 {request.requesterName}
 </AppText>
 {request.requesterHeadline ? (
 <AppText tone="secondary"variant="bodySmall">
 {request.requesterHeadline}
 </AppText>
 ) : null}
 </View>
 </View>
 <View style={{ flexDirection: 'row', gap: spacing.sm }}>
 <AppButton label="Accept"onPress={() => respond('accept')} loading={submitting === 'accept'} />
 <AppButton
 label="Decline"variant="secondary"onPress={() => respond('decline')}
 loading={submitting === 'decline'}
 />
 </View>
 </SolidCard>
 );
}
