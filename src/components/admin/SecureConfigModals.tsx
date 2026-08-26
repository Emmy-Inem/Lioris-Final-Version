import React from'react';
import { SecureCredentialCard } from'@/components/SecureCredentialCard';

export function PaymentGatewayModalContent() {
 return (
 <>
 <SecureCredentialCard
 label="Public key"description="Paystack/Flutterwave publishable key (safe for client use, but still managed centrally for rotation control)."configured
 lastRotated="32 days ago"
 />
 <SecureCredentialCard
 label="Secret key"description="Server-side payment secret. Never enterable or viewable from a mobile client."configured
 lastRotated="32 days ago"
 />
 </>
 );
}

export function WebrtcKeysModalContent() {
 return (
 <SecureCredentialCard
 label="Video SDK credentials"description="AppID and ServerSecret for the WebRTC video provider (e.g. ZegoCloud/Agora)."configured={false}
 />
 );
}

export function AiKeysModalContent() {
 return (
 <SecureCredentialCard
 label="AI service key"description="Routing key for AI-assisted moderation and summaries (e.g. Gemini/OpenAI)."configured
 lastRotated="6 days ago"
 />
 );
}
