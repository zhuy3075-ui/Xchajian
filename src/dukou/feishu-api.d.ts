import type { LibraryArticle } from './types';
export function feishuReadArticle(url: string, setStatus: (text: string, error?: boolean) => void): Promise<LibraryArticle>;
export function feishuWriteArticle(article: LibraryArticle, blocksSpec: unknown[], setStatus: (text: string, error?: boolean) => void): Promise<string>;
