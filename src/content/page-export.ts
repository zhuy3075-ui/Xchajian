import type { DownloadRequest, ExtractedContent } from '../types/messages';
import { buildFilename, postProcess, markdownOptions } from '../shared/post-process';
import { buildFormatExport } from '../shared/export-formats';
import { loadSettings, type BatchFormat } from '../shared/settings';
import { resolveLocalVideo } from '../shared/local-video';
import { renderMarkdown } from '../ast/render-markdown';
import { recordExport } from '../shared/review-prompt';
import { captureExpandedObsidianCard, obsidianCardUrl } from './obsidian-card';
import { normalizeStatusUrl } from './status-url';
import { isArticlePage, delay } from './dom';
import { extractArticle } from './article';
import { extractTweetAsync } from './tweet';
import { exportPdf } from './pdf-export';
import { pageNotice } from './page-notice';

export type PageFormat = BatchFormat | 'pdf';
export const PAGE_FORMATS: PageFormat[] = ['md', 'txt', 'html', 'json', 'csv', 'pdf'];
type ExportMode = 'download' | 'copy';


export async function exportCaptured(data: ExtractedContent, format: PageFormat, mode: ExportMode, report: (text: string) => void = pageNotice): Promise<void> {
  const settings = await loadSettings();
  const filename = buildFilename(data, settings.filenameTemplate.trim());
  let warning = '';
  if (format === 'pdf') {
    if (mode === 'copy') throw new Error('PDF 不支持复制，请选择下载。');
    if (!data.body) throw new Error('未获得可打印的正文。');
    await exportPdf(data.body, filename.replace(/\.md$/i, ''), { includeEngagement: settings.inlineStats });
    report('已打开 PDF 打印预览，请选择“另存为 PDF”。');
    return;
  }
  let request: DownloadRequest;
  if (format === 'md') {
    let videoAttachments;
    if (mode === 'download' && settings.saveVideos && settings.downloadImages && data.body) {
      const result = await resolveLocalVideo(data.body, data.tweetId, async tweetId => {
        const response = await chrome.runtime.sendMessage({ action: 'RESOLVE_VIDEO_URLS', tweetId });
        return response?.urls ?? [];
      });
      if (result.status === 'unresolved') warning = '；视频保留链接，请重新加载原帖后再试';
      if (result.status === 'resolved') videoAttachments = result.attachments;
      data.markdown = renderMarkdown(data.body, { includeVideoLinks: true });
    }
    const result = postProcess(data, { ...markdownOptions(settings, mode), videoAttachments });
    request = { action: 'DOWNLOAD_MD', content: result.markdown, filename: result.filename,
      images: result.images.length ? result.images : undefined, zip: settings.batchZip && result.images.length > 0 };
  } else {
    const result = buildFormatExport(format, data, {
      includeEngagement: settings.inlineStats, obsidianFriendly: settings.obsidianFriendly,
      frontmatterFields: settings.obsidianFriendly ? settings.frontmatterFieldsObsidian : settings.frontmatterFields,
      obsidianTagsTemplate: settings.obsidianTagsTemplate.trim(), includeMetadata: settings.includeMetadata,
    });
    request = { action: 'DOWNLOAD_MD', content: result.content,
      filename: filename.replace(/\.md$/i, '.' + result.ext), mime: result.mime };
  }
  if (mode === 'copy') {
    if (!document.hasFocus()) throw new Error('页面未聚焦，请返回此页重新点击复制。');
    try {
      await navigator.clipboard.writeText(request.content);
    } catch (error) {
      // Extension clipboardWrite also permits execCommand when the embedding
      // site's Permissions Policy blocks the async Clipboard API.
      if (!document.hasFocus()) throw error;
      const input = document.createElement('textarea');
      input.value = request.content;
      input.style.cssText = 'position:fixed;left:0;top:0;opacity:0;';
      document.body.append(input); input.select();
      try { if (!document.execCommand('copy')) throw error; }
      finally { input.remove(); }
    }
    report('已复制为 ' + format.toUpperCase());
  } else {
    const response = await chrome.runtime.sendMessage(request);
    if (!response?.success) throw new Error(response?.error || '下载未启动，请刷新页面后重试。');
    report('已发起下载：' + request.filename + warning);
  }
  void recordExport();
}

async function extractDetail(url: string, single: boolean): Promise<ExtractedContent> {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (normalizeStatusUrl(location.href) !== url) throw new Error('页面已切换，请重新选择内容。');
    const card = Array.from(document.querySelectorAll('article')).find(a => obsidianCardUrl(a) === url);
    if (isArticlePage()) return extractArticle();
    if (card) {
      if (single) return await captureExpandedObsidianCard(card, () => normalizeStatusUrl(location.href) === url);
      const data = await extractTweetAsync({ singleTweet: false });
      if (normalizeStatusUrl(location.href) !== url) throw new Error('页面已切换，已取消导出。');
      return data;
    }
    await delay(250);
  }
  throw new Error('等待正文超时，请确认已登录且帖子可见。');
}

export async function capturePageExport(url: string, single: boolean): Promise<ExtractedContent | null> {
  const target = normalizeStatusUrl(url);
  if (!target) throw new Error('无效的帖子链接');
  const card = Array.from(document.querySelectorAll('article')).find(a => obsidianCardUrl(a) === target);
  const current = normalizeStatusUrl(location.href) === target;
  if (!current && (!single || !card || card.querySelector('[data-testid="tweet-text-show-more-link"], [data-testid="article-cover-image"]'))) return null;
  const data = current ? await extractDetail(target, single)
    : await captureExpandedObsidianCard(card!, () => card!.isConnected && obsidianCardUrl(card!) === target);
  if (single && normalizeStatusUrl(data.sourceUrl) !== target) throw new Error('卡片内容已切换，请重试');
  return data;
}
