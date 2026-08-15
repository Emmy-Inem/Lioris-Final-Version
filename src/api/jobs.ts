import { api } from'./client';
import { JobListing } from'./types';
import { mockJobListings } from'./mockData';
import { withMockFallback } from'./withMockFallback';

export interface JobsQuery {
  q?: string;
  type?: JobListing['type'];
}

function filterMockJobs(query: JobsQuery): JobListing[] {
  let results = [...mockJobListings];
  if (query.type) results = results.filter((j) => j.type === query.type);
  if (query.q) {
    const q = query.q.toLowerCase();
    results = results.filter(
      (j) => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q),
    );
  }
  return results;
}

export async function listJobs(query: JobsQuery = {}): Promise<JobListing[]> {
  return withMockFallback(async () => {
    const { data } = await api.get<{ items: JobListing[] }>('/jobs', { params: query });
    return data.items;
  }, filterMockJobs(query));
}
