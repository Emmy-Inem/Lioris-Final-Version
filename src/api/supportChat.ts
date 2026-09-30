import { supabase } from './supabase';
import { getFriendlyErrorMessage } from '../utils/errors';

export interface SupportChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface SupportChatResult {
  content: string;
  /** True when the AI assistant could not resolve this itself - offer to open a support ticket. */
  needsHuman: boolean;
}

/**
 * Sends one message to the customer-care AI assistant (support-ai-chat edge
 * function). Stateless server-side - nothing is persisted unless the caller
 * later escalates the conversation into a ticket (see escalateChatToTicket).
 */
export async function sendSupportChatMessage(message: string, history: SupportChatTurn[]): Promise<SupportChatResult> {
  const { data, error } = await supabase.functions.invoke('support-ai-chat', {
    body: { message, history: history.slice(-12) },
  });

  if (error || (data as any)?.error) {
    const serverError = (data as any)?.error;
    if (serverError === 'not_configured') {
      throw new Error('The AI assistant is not available right now. Please open a support ticket instead.');
    }
    throw new Error(getFriendlyErrorMessage(error, (data as any)?.message || 'The AI assistant could not respond. Please try again.'));
  }

  const content = typeof (data as any)?.content === 'string' ? (data as any).content : '';
  if (!content) {
    throw new Error('The AI assistant could not respond. Please try again.');
  }
  return { content, needsHuman: !!(data as any)?.needsHuman };
}

/** Renders a chat transcript as plain text, embedded verbatim into an escalated ticket. */
export function formatChatTranscript(history: SupportChatTurn[]): string {
  return history
    .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`)
    .join('\n\n')
    .slice(0, 12000);
}
