import { supabase } from './supabase';
import { JobApplication, JobApplicationStatus, JobQuestion } from './types';
import { uploadMediaFile } from './storage';
import { getFriendlyErrorMessage } from '../utils/errors';

function mapQuestion(row: any): JobQuestion {
  return {
    id: row.id,
    jobId: row.job_id,
    questionText: row.question_text,
    questionType: row.question_type,
    isRequired: row.is_required,
    orderIndex: row.order_index,
  };
}

function mapApplication(row: any): JobApplication {
  return {
    id: row.id,
    jobId: row.job_id,
    applicantId: row.applicant_id,
    status: row.status as JobApplicationStatus,
    resumeUrl: row.resume_url ?? null,
    coverNote: row.cover_note ?? null,
    portfolioUrl: row.portfolio_url ?? null,
    answers: row.answers ?? {},
    matchScore: row.match_score === null || row.match_score === undefined ? null : Number(row.match_score),
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at ?? null,
    jobTitle: row.job?.title,
    company: row.job?.company,
    applicantName: row.applicant?.full_name,
    applicantAvatarUrl: row.applicant?.avatar_url,
    applicantDepartment: row.applicant?.department,
  };
}

/** Whether the signed-in user has already applied to this job (for the "Apply" button's state). */
export async function hasAppliedToJob(jobId: string): Promise<boolean> {
  const { data: authData } = await supabase.auth.getUser();
  const applicantId = authData?.user?.id;
  if (!applicantId) return false;
  const { data, error } = await supabase
    .from('job_applications')
    .select('id')
    .eq('job_id', jobId)
    .eq('applicant_id', applicantId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

/** Screening questions a poster attached to a job, in display order. Readable by anyone. */
export async function listJobQuestions(jobId: string): Promise<JobQuestion[]> {
  const { data, error } = await supabase
    .from('job_questions')
    .select('*')
    .eq('job_id', jobId)
    .order('order_index', { ascending: true });
  if (error) {
    console.warn('[JobApplications] listJobQuestions error:', error.message);
    return [];
  }
  return (data ?? []).map(mapQuestion);
}

/** Uploads a résumé/CV file to the caller's own folder in the private `resumes` bucket. Returns the storage path. */
export async function uploadResume(fileUriOrBlob: string | Blob): Promise<string> {
  return uploadMediaFile('resumes', fileUriOrBlob, 'resume');
}

export interface ApplyToJobPayload {
  /** Storage path in the `resumes` bucket. Pass the applicant's saved profile résumé, or a freshly uploaded one. */
  resumeUrl?: string;
  coverNote?: string;
  portfolioUrl?: string;
  /** Keyed by JobQuestion.id. */
  answers?: Record<string, string>;
}

/**
 * Submits an in-app application. Throws with a friendly message on failure -
 * including the expected case where the job doesn't accept in-app
 * applications, or the caller already applied (RLS/unique-constraint reject
 * both server-side, this just translates the error).
 */
export async function applyToJob(jobId: string, payload: ApplyToJobPayload = {}): Promise<JobApplication> {
  const { data: authData } = await supabase.auth.getUser();
  const applicantId = authData?.user?.id;
  if (!applicantId) {
    throw new Error('You need to be signed in to apply.');
  }

  const { data, error } = await supabase
    .from('job_applications')
    .insert({
      job_id: jobId,
      applicant_id: applicantId,
      resume_url: payload.resumeUrl || null,
      cover_note: payload.coverNote?.trim() || null,
      portfolio_url: payload.portfolioUrl?.trim() || null,
      answers: payload.answers ?? {},
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505' || /duplicate|unique/i.test(error.message)) {
      throw new Error('You have already applied to this job.');
    }
    throw new Error(getFriendlyErrorMessage(error, 'Could not submit your application. Please try again.'));
  }

  return mapApplication(data);
}

/** The signed-in student's own application history, newest first. */
export async function listMyApplications(): Promise<JobApplication[]> {
  const { data: authData } = await supabase.auth.getUser();
  const applicantId = authData?.user?.id;
  if (!applicantId) return [];

  const { data, error } = await supabase
    .from('job_applications')
    .select('*, job:jobs(title, company)')
    .eq('applicant_id', applicantId)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[JobApplications] listMyApplications error:', error.message);
    return [];
  }
  return (data ?? []).map(mapApplication);
}

/**
 * A job's applicants, ranked by automatic match score (highest first). Only
 * returns rows for jobs the caller posted (or for admins) - enforced by RLS,
 * this is just an empty list otherwise.
 */
export async function listJobApplicants(jobId: string): Promise<JobApplication[]> {
  const { data, error } = await supabase
    .from('job_applications')
    .select('*, applicant:profiles!job_applications_applicant_id_fkey(full_name, avatar_url, department)')
    .eq('job_id', jobId)
    .order('match_score', { ascending: false, nullsFirst: false });
  if (error) {
    console.warn('[JobApplications] listJobApplicants error:', error.message);
    return [];
  }
  return (data ?? []).map(mapApplication);
}

/** Moves an application through its pipeline. Only the job's poster or an admin can do this (RLS-enforced). */
export async function updateApplicationStatus(applicationId: string, status: JobApplicationStatus): Promise<void> {
  const { error } = await supabase.from('job_applications').update({ status }).eq('id', applicationId);
  if (error) {
    throw new Error(getFriendlyErrorMessage(error, 'Could not update this application. Please try again.'));
  }
}

/** Withdraws the caller's own application. Only allowed while it is still unreviewed (RLS-enforced). */
export async function withdrawApplication(applicationId: string): Promise<void> {
  const { error, count } = await supabase.from('job_applications').delete({ count: 'exact' }).eq('id', applicationId);
  if (error) {
    throw new Error(getFriendlyErrorMessage(error, 'Could not withdraw your application. Please try again.'));
  }
  if (!count) {
    throw new Error('This application can no longer be withdrawn - the poster has already reviewed it.');
  }
}
