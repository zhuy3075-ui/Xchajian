import type { ExtractResponse } from '../types/messages';
import type { LibraryArticle, ArticleBlock } from '../dukou/types';
import { mdToBlocks } from '../dukou/markdown.js';
import { isAllowedImageUrl } from '../shared/media';

export function initDukouEntry(): void {
  const open = document.getElementById('btn-dukou');
  const capture = document.getElementById('btn-dukou-capture') as HTMLButtonElement | null;
  const status = document.getElementById('dukou-entry-status');
  open?.addEventListener('click', () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('dukou/popup.html') });
  });
  capture?.addEventListener('click', async () => {
    capture.disabled = true;
    if (status) status.textContent = '正在读取当前 X 内容…';
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url || new URL(tab.url).hostname !== 'x.com' || !tab.url.includes('/status/')) {
        throw new Error('请先打开 X 上的具体推文、线程或文章页面');
      }
      const response: ExtractResponse = await chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT', includeMetadata: false });
      if (!response?.success || !response.data) throw new Error(response?.error || '未读到内容，请刷新 X 页面后重试');
      const data = response.data;
      const parsed = mdToBlocks(data.markdown);
      const blocks: ArticleBlock[] = [];
      const missing: string[] = [];
      for (const block of parsed.blocks) {
        if (block.type === 'html') { blocks.push(block); continue; }
        try {
          if (!isAllowedImageUrl(block.ref)) throw new Error('不支持的图片来源');
          const response = await fetch(block.ref, { signal: AbortSignal.timeout(15_000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          if (!/^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(blob.type)) throw new Error('不支持的图片格式');
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error('图片读取失败'));
            reader.readAsDataURL(blob);
          });
          blocks.push({ type: 'image', dataUrl });
        } catch { missing.push(block.ref); }
      }
      const article: LibraryArticle = {
        id: 'XC_' + data.tweetId,
        title: data.title || parsed.title || `${data.author.name} · ${data.type}`,
        author: `${data.author.name} (@${data.author.handle.replace(/^@/, '')})`,
        sourceUrl: data.sourceUrl,
        extractedAt: Date.now(),
        coverDataUrl: blocks.find((block) => block.type === 'image')?.dataUrl || '',
        blocks,
        markdown: data.markdown,
      };
      const saved = await chrome.runtime.sendMessage({ cmd: 'save_article', article });
      if (!saved?.ok) throw new Error(saved?.error || '稿件入库失败');
      await chrome.storage.local.set({ wx_status: {
        text: `已从 XClipper 入库：《${article.title}》${missing.length ? `；${missing.length} 张图片未能下载，原链接保留在 Markdown 中。` : ''}`,
        error: missing.length > 0, at: Date.now(),
      } });
      await chrome.tabs.create({ url: chrome.runtime.getURL('dukou/popup.html') });
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : String(error);
    } finally { capture.disabled = false; }
  });
}
