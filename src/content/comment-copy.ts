import { expandObsidianCard, obsidianCardUrl } from './obsidian-card';

let copying = false;
let notice: HTMLElement | null = null;

function showCopyNotice(message: string): void {
  notice?.remove();
  const panel = document.createElement('div');
  panel.id = 'xclipper-copy-status';
  panel.setAttribute('role', 'status');
  panel.textContent = message;
  panel.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;max-width:min(360px,calc(100vw - 40px));padding:12px 16px;border:1px solid #d9e1ee;border-radius:12px;background:#fff;color:#172b4d;box-shadow:0 8px 28px #172b4d26;font:14px/1.6 system-ui;pointer-events:none;';
  document.body.append(panel);
  notice = panel;
  window.setTimeout(() => panel.remove(), 5000);
}

function ownElements(article: Element, selector: string): Element[] {
  return Array.from(article.querySelectorAll(selector)).filter(el =>
    el.closest('article') === article && !el.closest('div[role="link"]'));
}

export async function copyComment(article: Element, button: HTMLElement): Promise<void> {
  if (copying) return;
  copying = true;
  button.setAttribute('aria-busy', 'true');
  const pageUrl = window.location.href;
  const sourceUrl = obsidianCardUrl(article);
  try {
    if (!sourceUrl || !article.isConnected) throw new Error('卡片已失效，请刷新后重试。');
    showCopyNotice('正在复制正文…');
    const expanded = expandObsidianCard(article, () => window.location.href === pageUrl);
    const card = expanded instanceof Promise ? await expanded : expanded;
    if (window.location.href !== pageUrl || !card.isConnected || obsidianCardUrl(card) !== sourceUrl) {
      throw new Error('页面或卡片已切换，请重新点击复制。');
    }
    if (ownElements(card, '[data-testid="tweet-text-show-more-link"], [data-testid="article-cover-image"]').length) {
      throw new Error('正文尚未完整显示，请先展开正文或进入详情页后复制。');
    }
    const textElement = ownElements(card, '[data-testid="tweetText"]')[0];
    if (!textElement) throw new Error('这条内容没有可复制的文字。');
    const snapshot = textElement.cloneNode(true) as Element;
    snapshot.querySelectorAll('div[role="link"], article').forEach(el => el.remove());
    snapshot.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
    snapshot.querySelectorAll('img').forEach(el => el.replaceWith(el.getAttribute('alt') || ''));
    const text = snapshot.textContent?.trim();
    if (!text) throw new Error('这条内容没有可复制的文字。');
    if (!document.hasFocus()) throw new Error('页面未聚焦，请返回此页重新点击复制。');
    await navigator.clipboard.writeText(text);
    showCopyNotice('正文已复制');
  } catch (error) {
    showCopyNotice(`复制失败：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    copying = false;
    button.removeAttribute('aria-busy');
  }
}
