import { supabase } from './supabase';
import { getFriendlyErrorMessage } from '../utils/errors';

export interface GivingCampaign {
  id: string;
  creatorId: string;
  campusCode: string;
  title: string;
  description: string | null;
  goalAmount: number | null;
  currency: string;
  givingUrl: string;
  coverImageUrl: string | null;
  confirmedTotal: number;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  reviewNote: string | null;
  isClosed: boolean;
  createdAt: string;
  creatorName?: string;
}

function mapCampaign(row: any): GivingCampaign {
  return {
    id: row.id,
    creatorId: row.creator_id,
    campusCode: row.campus_code,
    title: row.title,
    description: row.description ?? null,
    goalAmount: row.goal_amount === null || row.goal_amount === undefined ? null : Number(row.goal_amount),
    currency: row.currency,
    givingUrl: row.giving_url,
    coverImageUrl: row.cover_image_url ?? null,
    confirmedTotal: Number(row.confirmed_total ?? 0),
    reviewStatus: row.review_status,
    reviewNote: row.review_note ?? null,
    isClosed: !!row.is_closed,
    createdAt: row.created_at,
    creatorName: row.creator?.full_name,
  };
}

/** Approved, open campaigns anyone can browse and give to. */
export async function listGivingCampaigns(): Promise<GivingCampaign[]> {
  const { data, error } = await supabase
    .from('giving_campaigns')
    .select('*, creator:profiles(full_name)')
    .eq('review_status', 'approved')
    .eq('is_closed', false)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[Donations] listGivingCampaigns error:', error.message);
    return [];
  }
  return (data ?? []).map(mapCampaign);
}

/** The signed-in user's own campaigns, any review status. */
export async function listMyGivingCampaigns(): Promise<GivingCampaign[]> {
  const { data: authData } = await supabase.auth.getUser();
  const uid = authData?.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('giving_campaigns')
    .select('*')
    .eq('creator_id', uid)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map(mapCampaign);
}

export interface CreateGivingCampaignPayload {
  title: string;
  description?: string;
  goalAmount?: number;
  givingUrl: string;
  coverImageUrl?: string;
}

export async function createGivingCampaign(payload: CreateGivingCampaignPayload): Promise<GivingCampaign> {
  const { data: authData } = await supabase.auth.getUser();
  const uid = authData?.user?.id;
  if (!uid) throw new Error('You need to be signed in to start a campaign.');

  const { data, error } = await supabase
    .from('giving_campaigns')
    .insert({
      creator_id: uid,
      title: payload.title.trim(),
      description: payload.description?.trim() || null,
      goal_amount: payload.goalAmount || null,
      giving_url: payload.givingUrl.trim(),
      cover_image_url: payload.coverImageUrl || null,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(getFriendlyErrorMessage(error, 'Could not start this campaign. Please check your giving link and try again.'));
  }
  return mapCampaign(data);
}

/** Opens the campaign's external giving page (records a referral click) and returns its URL. */
export async function openGivingPage(campaignId: string): Promise<string> {
  const { data, error } = await supabase.rpc('open_giving_page', { p_campaign: campaignId });
  if (error) {
    throw new Error(getFriendlyErrorMessage(error, 'Could not open the giving page. Please try again.'));
  }
  return data as string;
}

// --- Admin moderation (via the admin-review-giving-campaign edge function) ---

export async function listPendingGivingCampaigns(): Promise<GivingCampaign[]> {
  const { data, error } = await supabase
    .from('giving_campaigns')
    .select('*, creator:profiles(full_name)')
    .eq('review_status', 'pending')
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []).map(mapCampaign);
}

export async function reviewGivingCampaign(campaignId: string, decision: 'approve' | 'reject', note?: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-review-giving-campaign', {
    body: { action: 'review', campaignId, decision, note },
  });
  if (error || (data as any)?.error) {
    throw new Error((data as any)?.message || getFriendlyErrorMessage(error, 'Could not review this campaign.'));
  }
}

export async function updateGivingCampaignTotal(campaignId: string, confirmedTotal: number): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-review-giving-campaign', {
    body: { action: 'update_total', campaignId, confirmedTotal },
  });
  if (error || (data as any)?.error) {
    throw new Error((data as any)?.message || getFriendlyErrorMessage(error, 'Could not update the confirmed total.'));
  }
}
