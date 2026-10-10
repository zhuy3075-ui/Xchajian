export interface SelectedFile { name: string; webkitRelativePath?: string }
export function buildFileIndex<T extends SelectedFile>(files: T[]): { byRel: Map<string, T> };
export function lookupFile<T extends SelectedFile>(index: { byRel: Map<string, T> }, ref: string, markdownPath?: string): T | null;
