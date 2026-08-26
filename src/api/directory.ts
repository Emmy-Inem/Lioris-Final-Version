import { api } from'./client';
import { AlumniDirectoryEntry } from'./types';
import { mockDirectory } from'./mockData';
import { withMockFallback } from'./withMockFallback';

let directoryState = [...mockDirectory];

export interface DirectoryQuery {
 q?: string;
 industry?: string;
 graduationYear?: number;
}

export async function listDirectory(query: DirectoryQuery = {}): Promise<AlumniDirectoryEntry[]> {
 return withMockFallback(async () => {
 const { data } = await api.get<{ items: AlumniDirectoryEntry[] }>('/alumni/directory', { params: query });
 return data.items;
 }, directoryState);
}

export async function createDirectoryEntry(payload: Omit<AlumniDirectoryEntry, 'id' | 'connectionStatus'>): Promise<AlumniDirectoryEntry> {
 const newEntry: AlumniDirectoryEntry = {
 id: `alumni-${Date.now()}`,
 connectionStatus: 'none',
 ...payload,
 };
 directoryState = [newEntry, ...directoryState];
 return newEntry;
}

export async function updateDirectoryEntry(id: string, payload: Partial<AlumniDirectoryEntry>): Promise<AlumniDirectoryEntry> {
 let updated: AlumniDirectoryEntry | undefined;
 directoryState = directoryState.map((d) => {
 if (d.id === id) {
 updated = { ...d, ...payload };
 return updated;
 }
 return d;
 });
 if (!updated) throw new Error('Directory entry not found');
 return updated;
}

export async function deleteDirectoryEntry(id: string): Promise<boolean> {
 directoryState = directoryState.filter((d) => d.id !== id);
 return true;
}
