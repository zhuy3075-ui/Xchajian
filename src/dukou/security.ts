import type { Destination, LibraryArticle } from './types';

export const DEST_URLS: Record<Destination, string | null> = {
  x: 'https://x.com/compose/articles',
  bili: 'https://member.bilibili.com/platform/upload/text/new-edit',
  editor: 'https://editor.huasheng.ai/',
  none: null,
};

export function destination(value: unknown): Destination {
  if (typeof value !== 'string' || !Object.hasOwn(DEST_URLS, value)) {
    throw new Error(`不支持的稿件去向：${String(value)}`);
  }
  return value as Destination;
}

export function sourceUrl(raw: unknown): { url: string; kind: 'wechat' | 'feishu' } {
  if (typeof raw !== 'string') throw new Error('文章链接必须为字符串');
  const url = new URL(raw.trim());
  if (url.username || url.password) throw new Error('文章链接不能包含账号密码');
  if (url.protocol === 'http:' && url.hostname === 'mp.weixin.qq.com') url.protocol = 'https:';
  if (url.protocol !== 'https:') throw new Error('仅支持 HTTPS 文章链接');
  if (url.hostname === 'mp.weixin.qq.com' && /^\/s(?:\/|$)/.test(url.pathname)) {
    return { url: url.href, kind: 'wechat' };
  }
  const isFeishu = ['feishu.cn', 'larksuite.com'].some(
    (host) => url.hostname === host || url.hostname.endsWith('.' + host)
  );
  if (isFeishu && /^\/(docx|wiki)\/[A-Za-z0-9]+\/?$/.test(url.pathname)) {
    return { url: url.href, kind: 'feishu' };
  }
  throw new Error(`不支持的文章链接：${url.hostname}${url.pathname}`);
}

export function isDukouPage(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;
  const root = chrome.runtime.getURL('');
  return sender.url.startsWith(root) && ['popup.html', 'dukou/popup.html', 'dukou/import.html'].includes(
    sender.url.slice(root.length).split(/[?#]/)[0]
  );
}

export function articleId(value: unknown): string {
  if (typeof value !== 'string' || !/^[\w=.-]{1,180}$/.test(value)) {
    throw new Error(`文章 ID 不合法：${String(value)}`);
  }
  return value;
}

export function validateArticle(value: unknown): asserts value is LibraryArticle {
  if (!value || typeof value !== 'object') throw new Error('文章数据缺失');
  const article = value as LibraryArticle;
  articleId(article.id);
  if (typeof article.title !== 'string' || !article.title.trim()) throw new Error('文章标题不能为空');
  if (typeof article.author !== 'string' || typeof article.sourceUrl !== 'string' ||
      !Number.isFinite(article.extractedAt) || !Array.isArray(article.blocks)) {
    throw new Error('文章元数据或正文格式不正确');
  }
  if (article.blocks.length === 0) throw new Error('文章正文不能为空');
  if (article.markdown !== undefined && typeof article.markdown !== 'string') throw new Error('Markdown 必须为文本');
  const image = /^data:image\/(?:png|jpeg|gif|webp|avif|bmp);base64,[A-Za-z0-9+/=\s]+$/;
  if (typeof article.coverDataUrl !== 'string' || (article.coverDataUrl && !image.test(article.coverDataUrl))) {
    throw new Error('文章封面必须为图片 data URL');
  }
  for (const block of article.blocks) {
    if (block.type === 'html' && typeof block.html === 'string') {
      // Only the simplified markup emitted by dukou is accepted from the bridge/content script.
      if (/<\s*(script|iframe|object|embed|svg|style|img)\b|<[^>]+\s+on\w+\s*=|\bhref\s*=\s*["']\s*(?:javascript|data|file):/i.test(block.html)) {
        throw new Error('文章包含不支持的活动 HTML 内容');
      }
    } else if (block.type !== 'image' || typeof block.dataUrl !== 'string' || !image.test(block.dataUrl)) {
      throw new Error('文章内容块必须为简化 HTML 或图片 data URL');
    }
  }
}
