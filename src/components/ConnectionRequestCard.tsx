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
 <SolidCard style={{ marginBottom: 0 }}>
  <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
    <Avatar name={request.requesterName} uri={request.requesterAvatarUrl} size={46} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <AppText weight="bold" style={{ fontSize: 15, lineHeight: 20 }}>
       {request.requesterName}
      </AppText>
      {request.requesterHeadline ? (
       <AppText tone="secondary" variant="caption" style={{ fontSize: 11.5, marginTop: 2, lineHeight: 16 }}>
        {request.requesterHeadline}
       </AppText>
      ) : null}
    </View>
  </View>
  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
   <View style={{ flex: 1 }}>
    <AppButton label="Accept" fullWidth onPress={() => respond('accept')} loading={submitting === 'accept'} />
   </View>
   <View style={{ flex: 1 }}>
    <AppButton
     label="Decline"
     variant="secondary"
     fullWidth
     onPress={() => respond('decline')}
     loading={submitting === 'decline'}
    />
   </View>
  </View>
 </SolidCard>
 );
}
