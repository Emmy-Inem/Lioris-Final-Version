import { api } from'./client';
import { AlumniDirectoryEntry } from'./types';
import { mockDirectory } from'./mockData';
import { withMockFallback } from'./withMockFallback';
import { isMockDataVisible } from'./mockDataSettings';

// Entries created/edited via the admin Manage Directory modal this session.
// Always shown, regardless of the mock-data toggle.
let locallyCreatedEntries: AlumniDirectoryEntry[] = [];
const deletedSeedIds = new Set<string>();

function getSeedDirectory(): AlumniDirectoryEntry[] {
 if (!isMockDataVisible()) return [];
 return mockDirectory.filter((d) => !deletedSeedIds.has(d.id));
}

function getPool(): AlumniDirectoryEntry[] {
 return [...locallyCreatedEntries, ...getSeedDirectory()];
}

export interface DirectoryQuery {
 q?: string;
 industry?: string;
 graduationYear?: number;
}

export async function listDirectory(query: DirectoryQuery = {}): Promise<AlumniDirectoryEntry[]> {
 return withMockFallback(async () => {
 const { data } = await api.get<{ items: AlumniDirectoryEntry[] }>('/alumni/directory', { params: query });
 return data.items;
 }, getPool());
}

export async function createDirectoryEntry(payload: Omit<AlumniDirectoryEntry, 'id' | 'connectionStatus'>): Promise<AlumniDirectoryEntry> {
 const newEntry: AlumniDirectoryEntry = {
 id: `alumni-${Date.now()}`,
 connectionStatus: 'none',
 ...payload,
 };
 locallyCreatedEntries = [newEntry, ...locallyCreatedEntries];
 return newEntry;
}

export async function updateDirectoryEntry(id: string, payload: Partial<AlumniDirectoryEntry>): Promise<AlumniDirectoryEntry> {
 let updated: AlumniDirectoryEntry | undefined;
 locallyCreatedEntries = locallyCreatedEntries.map((d) => {
 if (d.id === id) {
 updated = { ...d, ...payload };
 return updated;
 }
 return d;
 });
 if (!updated) {
 // Editing a seed/demo entry that isn't in the local cache yet - promote
 // it into the local cache so the edit sticks even if mock data is later
 // hidden.
 const seedMatch = getSeedDirectory().find((d) => d.id === id);
 if (seedMatch) {
 updated = { ...seedMatch, ...payload };
 locallyCreatedEntries = [updated, ...locallyCreatedEntries];
 }
 }
 if (!updated) throw new Error('Directory entry not found');
 return updated;
}

export async function deleteDirectoryEntry(id: string): Promise<boolean> {
 locallyCreatedEntries = locallyCreatedEntries.filter((d) => d.id !== id);
 deletedSeedIds.add(id);
 return true;
}
