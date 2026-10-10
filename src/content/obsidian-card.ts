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
