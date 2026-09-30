import { supabase } from './supabase';

export interface JobAlert {
  id: string;
  keywords: string | null;
  jobType: string | null;
  remoteOnly: boolean;
  campusCode: string | null;
  isActive: boolean;
  createdAt: string;
  lastNotifiedAt: string | null;
}

export interface CreateJobAlertPayload {
  keywords?: string;
  jobType?: string;
  remoteOnly?: boolean;
  campusCode?: string;
}

function mapAlert(row: any): JobAlert {
  return {
    id: row.id,
    keywords: row.keywords,
    jobType: row.job_type,
    remoteOnly: !!row.remote_only,
    campusCode: row.campus_code,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    lastNotifiedAt: row.last_notified_at,
  };
}

export async function listMyJobAlerts(): Promise<JobAlert[]> {
  const { data, error } = await supabase.from('job_alerts').select('*').order('created_at', { ascending: false });
  if (error) {
    console.warn('[JobAlerts] listMyJobAlerts failed:', error.message);
    return [];
  }
  return (data ?? []).map(mapAlert);
}

export async function createJobAlert(payload: CreateJobAlertPayload): Promise<JobAlert> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id;
  if (!userId) throw new Error('You need to be signed in to create a job alert.');

  const { data, error } = await supabase
    .from('job_alerts')
    .insert({
      user_id: userId,
      keywords: payload.keywords?.trim() || null,
      job_type: payload.jobType || null,
      remote_only: !!payload.remoteOnly,
      campus_code: payload.campusCode || null,
    })
    .select('*')
    .single();

  if (error) {
    console.warn('[JobAlerts] createJobAlert failed:', error.message);
    throw new Error('Could not create this job alert. Please try again.');
  }
  return mapAlert(data);
}

export async function setJobAlertActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('job_alerts').update({ is_active: isActive }).eq('id', id);
  if (error) {
    console.warn('[JobAlerts] setJobAlertActive failed:', error.message);
    throw new Error('Could not update this alert. Please try again.');
  }
}

export async function deleteJobAlert(id: string): Promise<void> {
  const { error } = await supabase.from('job_alerts').delete().eq('id', id);
  if (error) {
    console.warn('[JobAlerts] deleteJobAlert failed:', error.message);
    throw new Error('Could not delete this alert. Please try again.');
  }
}
