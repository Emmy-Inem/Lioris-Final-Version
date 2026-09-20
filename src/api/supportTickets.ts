import { supabase } from './supabase';
import { recordAuditLogEntry } from './auditLog';
import { createNotification } from './notifications';

export type SupportTicketCategory =
  | 'account_issue'
  | 'matric_id_correction'
  | 'campus_transfer'
  | 'verification_appeal'
  | 'content_issue'
  | 'bug_report'
  | 'general';

export type SupportTicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type SupportTicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userEmail?: string;
  userRole?: string;
  userCampus?: string;
  userMatric?: string;
  category: SupportTicketCategory;
  title: string;
  description: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  adminNotes?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupportTicketPayload {
  category: SupportTicketCategory;
  title: string;
  description: string;
  priority?: SupportTicketPriority;
}

export async function createSupportTicket(payload: CreateSupportTicketPayload): Promise<SupportTicket> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id;
  if (!userId) {
    throw new Error('You must be signed in to submit a support ticket.');
  }

  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: userId,
      category: payload.category,
      title: payload.title.trim(),
      description: payload.description.trim(),
      priority: payload.priority || 'medium',
      status: 'open',
    })
    .select('*, profiles:user_id(full_name, email, role, campus_code, student_id_number)')
    .single();

  if (error) {
    console.error('[SupportTickets] create failed:', error);
    throw new Error('Could not submit support ticket. Please try again.');
  }

  const profile = (data as any).profiles;
  return {
    id: data.id,
    userId: data.user_id,
    userName: profile?.full_name || 'Campus User',
    userEmail: profile?.email,
    userRole: profile?.role,
    userCampus: profile?.campus_code,
    userMatric: profile?.student_id_number,
    category: data.category as SupportTicketCategory,
    title: data.title,
    description: data.description,
    status: data.status as SupportTicketStatus,
    priority: data.priority as SupportTicketPriority,
    adminNotes: data.admin_notes,
    resolvedBy: data.resolved_by,
    resolvedAt: data.resolved_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function getUserSupportTickets(): Promise<SupportTicket[]> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('support_tickets')
    .select('*, profiles:user_id(full_name, email, role, campus_code, student_id_number)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[SupportTickets] getUserSupportTickets error:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.profiles?.full_name || 'Campus User',
    userEmail: row.profiles?.email,
    userRole: row.profiles?.role,
    userCampus: row.profiles?.campus_code,
    userMatric: row.profiles?.student_id_number,
    category: row.category,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    adminNotes: row.admin_notes,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getAllSupportTickets(query?: {
  status?: string;
  category?: string;
  priority?: string;
  q?: string;
}): Promise<SupportTicket[]> {
  let builder = supabase
    .from('support_tickets')
    .select('*, profiles:user_id(full_name, email, role, campus_code, student_id_number)')
    .order('created_at', { ascending: false });

  if (query?.status && query.status !== 'all') {
    builder = builder.eq('status', query.status);
  }
  if (query?.category && query.category !== 'all') {
    builder = builder.eq('category', query.category);
  }
  if (query?.priority && query.priority !== 'all') {
    builder = builder.eq('priority', query.priority);
  }

  const { data, error } = await builder;
  if (error) {
    console.warn('[SupportTickets] getAllSupportTickets error:', error);
    return [];
  }

  let results: SupportTicket[] = (data || []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.profiles?.full_name || 'Campus User',
    userEmail: row.profiles?.email,
    userRole: row.profiles?.role,
    userCampus: row.profiles?.campus_code,
    userMatric: row.profiles?.student_id_number,
    category: row.category,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    adminNotes: row.admin_notes,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  if (query?.q) {
    const q = query.q.toLowerCase();
    results = results.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.userName.toLowerCase().includes(q) ||
        (t.userMatric && t.userMatric.toLowerCase().includes(q)) ||
        (t.userEmail && t.userEmail.toLowerCase().includes(q)),
    );
  }

  return results;
}

export async function updateSupportTicket(
  ticketId: string,
  updates: { status?: SupportTicketStatus; priority?: SupportTicketPriority; adminNotes?: string },
): Promise<boolean> {
  const { data: authData } = await supabase.auth.getUser();
  const currentUserId = authData?.user?.id;

  const dbUpdates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.status) {
    dbUpdates.status = updates.status;
    if (updates.status === 'resolved' || updates.status === 'closed') {
      dbUpdates.resolved_at = new Date().toISOString();
      dbUpdates.resolved_by = currentUserId;
    }
  }
  if (updates.priority) dbUpdates.priority = updates.priority;
  if (updates.adminNotes !== undefined) dbUpdates.admin_notes = updates.adminNotes;

  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .update(dbUpdates)
    .eq('id', ticketId)
    .select('*, profiles:user_id(full_name, email)')
    .single();

  if (error) {
    console.error('[SupportTickets] update failed:', error);
    return false;
  }

  if (ticket) {
    await recordAuditLogEntry({
      action: 'policy_updated',
      summary: "Admin updated support ticket " + ticketId + " (Status: " + ticket.status + ")",
      targetType: 'user',
      targetId: ticket.user_id,
      reason: updates.adminNotes,
    });

    if (updates.status === 'resolved') {
      await createNotification({
        recipientId: ticket.user_id,
        type: 'system',
        title: 'Support Ticket Resolved',
        body: 'Your support ticket "' + ticket.title + '" has been reviewed and resolved by administration.',
        deepLinkPath: '/settings',
      });
    }
  }

  return true;
}

export async function deleteSupportTicket(ticketId: string): Promise<boolean> {
  const { error } = await supabase.from('support_tickets').delete().eq('id', ticketId);
  if (error) {
    console.error('[SupportTickets] delete failed:', error);
    return false;
  }

  await recordAuditLogEntry({
    action: 'item_moderated',
    summary: "Admin deleted support ticket " + ticketId,
    targetType: 'user',
    targetId: ticketId,
  });

  return true;
}
