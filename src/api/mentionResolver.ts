import { resolvePostMentions, type ResolvedMentionUser } from './posts';
import { createBatchLoader } from '../utils/batchLoader';

const SEP = '|';

// Every post card with an @handle used to run its own `profiles` query. Cards of one page mount within the same
// frame, so their handles are collected for a short window and resolved with ONE query per campus; answers are
// also reused for a few minutes (a handle seen in several posts is looked up once).
const loader = createBatchLoader<ResolvedMentionUser>({
  windowMs: 30,
  ttlMs: 5 * 60_000,
  loadMany: async (keys) => {
    const byCampus = new Map<string, string[]>();
    for (const key of keys) {
      const at = key.indexOf(SEP);
      const campus = key.slice(0, at);
      const handle = key.slice(at + 1);
      byCampus.set(campus, [...(byCampus.get(campus) ?? []), handle]);
    }
    const out = new Map<string, ResolvedMentionUser>();
    await Promise.all(
      [...byCampus.entries()].map(async ([campus, handles]) => {
        const users = await resolvePostMentions(handles, campus || undefined);
        for (const u of users) out.set(`${campus}${SEP}${u.username.toLowerCase()}`, u);
      }),
    );
    return out;
  },
});

/** Same contract as resolvePostMentions(), but concurrent callers share one request. */
export async function resolvePostMentionsBatched(handles: string[], campusCode?: string): Promise<ResolvedMentionUser[]> {
  const campus = campusCode && campusCode !== 'GLOBAL' ? campusCode : '';
  const cleaned = [...new Set(handles.map((h) => h.toLowerCase()).filter(Boolean))];
  if (cleaned.length === 0) return [];
  const answers = await loader.load(cleaned.map((h) => `${campus}${SEP}${h}`));
  const found: ResolvedMentionUser[] = [];
  answers.forEach((user) => {
    if (user) found.push(user);
  });
  return found;
}
