import type { LibraryArticle, LibraryEntry } from './types';
import { articleId, validateArticle } from './security';

let writes: Promise<unknown> = Promise.resolve();
function serialize<T>(write: () => Promise<T>): Promise<T> {
  const result = writes.then(write);
  writes = result.catch(() => {});
  return result;
}

export function saveToLibrary(article: LibraryArticle): Promise<void> {
  validateArticle(article);
  return serialize(async () => {
    const { wx_index = [] } = await chrome.storage.local.get<{ wx_index?: LibraryEntry[] }>('wx_index');
    const entry: LibraryEntry = {
      id: article.id, title: article.title, author: article.author,
      extractedAt: article.extractedAt,
      imgCount: article.blocks.filter((block) => block.type === 'image').length,
      blockCount: article.blocks.length,
    };
    await chrome.storage.local.set({
      ['art_' + article.id]: article,
      wx_index: [entry, ...wx_index.filter((item: LibraryEntry) => item.id !== article.id)],
      wx_current: article.id,
    });
  });
}

export function deleteFromLibrary(id: string): Promise<void> {
  articleId(id);
  return serialize(async () => {
    const { wx_index = [], wx_current } = await chrome.storage.local.get<{ wx_index?: LibraryEntry[]; wx_current?: string }>(['wx_index', 'wx_current']);
    const remaining = wx_index.filter((entry: LibraryEntry) => entry.id !== id);
    await chrome.storage.local.set({
      wx_index: remaining,
      ...(wx_current === id ? { wx_current: remaining[0]?.id || '' } : {}),
    });
    await chrome.storage.local.remove('art_' + id);
  });
}
