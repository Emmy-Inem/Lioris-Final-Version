// Cost / abuse guard shared by the Gemini-backed edge functions (gemini-proxy, support-ai-chat).
//
//   1. Kill switch. AI is off when EITHER
//        * the secret AI_DISABLED is 'true' (or '1'), or
//        * public.platform_settings has a row key = 'ai_disabled' whose value is JSON `true`
//          or an object `{ "disabled": true }` (an admin can flip it with no redeploy).
//      A missing platform_settings table / row / read error means "not disabled" (the env var is the
//      hard switch); it never blocks the request.
//   2. Global daily request cap across ALL users and BOTH functions, one fixed rate-limit key
//      ('ai-global-daily', 24 h window). Default 3000 requests/day, override with the AI_DAILY_CAP
//      secret. This bounds the worst-case Gemini bill if per-user limits are bypassed with many
//      accounts. Fails CLOSED like the per-user limiters.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';
import { consumeRateLimit } from './ratelimit.ts';

export type AiGuardVerdict = 'ok' | 'disabled' | 'error';

const DEFAULT_DAILY_CAP = 3000;
const DAY_SECONDS = 24 * 60 * 60;

export function aiKillSwitchFromEnv(): boolean {
  const v = (Deno.env.get('AI_DISABLED') ?? '').trim().toLowerCase();
  return v === 'true' || v === '1';
}

async function aiKillSwitchFromSettings(admin: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from('platform_settings')
      .select('value')
      .eq('key', 'ai_disabled')
      .maybeSingle();
    if (error || !data) return false; // table missing / no row / read error: not disabled
    const v = data.value as unknown;
    if (v === true) return true;
    if (v && typeof v === 'object' && (v as { disabled?: unknown }).disabled === true) return true;
    return false;
  } catch {
    return false;
  }
}

/** Cheap check, safe to call before any rate-limit counter is consumed. */
export async function isAiDisabled(admin: SupabaseClient): Promise<boolean> {
  if (aiKillSwitchFromEnv()) return true;
  return await aiKillSwitchFromSettings(admin);
}

/**
 * Consume one unit of the global daily AI budget. Call this LAST (after the per-user limits), so a
 * request that a per-user limit refuses never spends the shared budget.
 * 'ok' = within budget, 'disabled' = daily cap reached, 'error' = limiter unavailable (fail closed).
 */
export async function consumeGlobalAiBudget(admin: SupabaseClient): Promise<AiGuardVerdict> {
  const cap = Number(Deno.env.get('AI_DAILY_CAP'));
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : DEFAULT_DAILY_CAP;
  const verdict = await consumeRateLimit(admin, 'ai-global-daily', limit, DAY_SECONDS);
  if (verdict === 'allowed') return 'ok';
  return verdict === 'limited' ? 'disabled' : 'error';
}
