export type Destination = 'x' | 'bili' | 'editor' | 'none';
export type ArticleBlock = { type: 'html'; html: string } | { type: 'image'; dataUrl: string };
export interface LibraryArticle {
  id: string;
  title: string;
  author: string;
  coverDataUrl: string;
  blocks: ArticleBlock[];
  markdown?: string;
  sourceUrl: string;
  extractedAt: number;
}
export interface LibraryEntry {
  id: string;
  title: string;
  author: string;
  extractedAt: number;
  imgCount: number;
  blockCount: number;
}
