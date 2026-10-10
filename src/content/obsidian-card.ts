import { articleToTweetNode } from './dom-to-ast/tweet-node';
import { docToExtracted } from '../shared/extracted-content';
import { normalizeStatusUrl } from './status-url';

// Only the clicked card's own timestamp identifies a comment. A link to the
// root post or a quoted post must never redirect its author/file attribution.
function belongsToCard(element: Element, article: Element): boolean {
  const quote = element.closest('div[role="link"]');
  return element.closest('article') === article && !(quote && article.contains(quote));
}

function cardTimestamp(article: Element): HTMLTimeElement | null {
  for (const time of article.querySelectorAll('time')) {
    if (!belongsToCard(time, article)) continue;
    const link = time.closest('a');
    if (link?.href && normalizeStatusUrl(link.href)) return time;
  }
  return null;
}

export function obsidianCardUrl(article: Element): string | null {
  const href = cardTimestamp(article)?.closest('a')?.href;
  return href ? normalizeStatusUrl(href) : null;
}

// Expand only the selected card. Recheck its identity because X can replace
// or recycle articles while expansion is loading.
export function captureExpandedObsidianCard(article: Element, isCurrent: () => boolean) {
  const expanded = expandObsidianCard(article, isCurrent);
  return expanded instanceof Promise ? expanded.then(captureObsidianCard) : captureObsidianCard(expanded);
}

export function expandObsidianCard(article: Element, isCurrent: () => boolean): Element | Promise<Element> {
  const more = Array.from(article.querySelectorAll<HTMLElement>('[data-testid="tweet-text-show-more-link"]'))
    .find(el => belongsToCard(el, article));
  if (!more) return article;
  const sourceUrl = cardTimestamp(article)?.closest('a')?.href;
  if (!sourceUrl) throw new Error('找不到这条评论自身的链接，请刷新后重试');
  if (more.closest('a[href]')) throw new Error('这条内容需要进入详情页才能展开，请打开后再采集。');
  const pageUrl = window.location.href;
  const originalText = Array.from(article.querySelectorAll('[data-testid="tweetText"]'))
    .find(el => belongsToCard(el, article))?.textContent;
  more.click();
  return new Promise<Element>((resolve, reject) => {
    const started = Date.now();
    let lastText = originalText;
    let stableSince = started;
    const timer = window.setInterval(() => {
      try {
        if (!isCurrent() || window.location.href !== pageUrl) throw new Error('操作已取消或页面已切换，请重试');
        if (!article.isConnected) {
          const replacement = Array.from(document.querySelectorAll('article')).find(el => cardTimestamp(el)?.closest('a')?.href === sourceUrl);
          if (replacement) article = replacement;
        }
        if (article.isConnected && cardTimestamp(article)?.closest('a')?.href !== sourceUrl) throw new Error('卡片内容已切换，请重试');
        const text = Array.from(article.querySelectorAll('[data-testid="tweetText"]')).find(el => belongsToCard(el, article))?.textContent;
        if (text !== lastText) { lastText = text; stableSince = Date.now(); }
        if (article.isConnected && text?.trim() && text !== originalText &&
            text.trim().length >= (originalText?.trim().length || 0) && Date.now() - stableSince >= 300 &&
            !Array.from(article.querySelectorAll('[data-testid="tweet-text-show-more-link"]')).some(el => belongsToCard(el, article))) {
          window.clearInterval(timer);
          resolve(article);
        } else if (Date.now() - started >= 4000) throw new Error('自动展开未完成，请点击正文的“Show more / 显示更多”后重试；未使用截断内容。');
      } catch (err) { window.clearInterval(timer); reject(err); }
    }, 100);
  });
}

export function captureObsidianCard(article: Element) {
  const time = cardTimestamp(article);
  const sourceUrl = time && normalizeStatusUrl(time.closest('a')!.href);
  if (!sourceUrl) throw new Error('找不到这条评论自身的链接，请刷新后重试');
  if (article.querySelector('[data-testid="tweet-text-show-more-link"], [data-testid="article-cover-image"]')) {
    throw new Error('这条内容尚未完整显示，请先展开正文；完整长文请使用文章页的采集入口。');
  }
  // Snapshot before any asynchronous settings/clipboard work: X can recycle
  // this DOM card as soon as the user scrolls.
  const snapshot = article.cloneNode(true) as Element;
  const header = Array.from(snapshot.querySelectorAll('[data-testid="User-Name"]')).find(el => belongsToCard(el, snapshot));
  if (!header) throw new Error('这条评论的作者尚未加载，请稍后重试');
  // Media-only quotes also need a text slot for the shared quote parser.
  const quote = Array.from(snapshot.querySelectorAll('div[role="link"]')).find(el => el.querySelector('[data-testid="User-Name"]'));
  if (quote && !quote.querySelector('[data-testid="tweetText"]')) {
    const quoteText = document.createElement('div');
    quoteText.dataset.testid = 'tweetText';
    quote.append(quoteText);
  }
  const textElements = Array.from(snapshot.querySelectorAll('[data-testid="tweetText"]'));
  const ownText = textElements.find(el => belongsToCard(el, snapshot));
  if (ownText) snapshot.prepend(ownText);
  else if (textElements.length) {
    // The shared AST parser expects own text before quoted text. An empty
    // own slot preserves attribution for a quote-only card as well.
    const emptyText = document.createElement('div');
    emptyText.dataset.testid = 'tweetText';
    snapshot.prepend(emptyText);
  }
  snapshot.prepend(header);
  const node = articleToTweetNode(snapshot);
  node.date = time!.getAttribute('datetime') || time!.textContent?.trim() || '';
  node.tweetId = sourceUrl.match(/\/status\/(\d+)/)![1];
  if (!node.text.length && !node.media.length && !node.quotedTweet && !node.poll && !node.linkCard) {
    throw new Error('这条评论没有可采集的正文或媒体，请等待加载后重试');
  }
  return docToExtracted({ version: 1, metadata: {
    type: 'tweet', sourceUrl, tweetId: node.tweetId,
    author: node.author, date: node.date, engagement: node.engagement,
  }, body: node });
}
