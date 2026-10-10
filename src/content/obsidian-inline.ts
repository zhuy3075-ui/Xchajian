import { loadSettings } from '../shared/settings';
import { resolveObsidianTarget } from '../shared/obsidian';
import { recordExport } from '../shared/review-prompt';
import { normalizeStatusUrl } from './status-url';
import { captureExpandedObsidianCard, obsidianCardUrl } from './obsidian-card';
import { postProcess, markdownOptions } from '../shared/post-process';
import { saveObsidianNote, openObsidianConnection, CONNECT_REQUIRED } from '../shared/obsidian-files';

export type ObsidianCapture = { markdown: string; filename: string; handle: string; sourceUrl: string };
const MARKER = /^#xclipper-obsidian=([\w-]{20,80})(?:&single=(1))?$/;
// This local build uses the user's dedicated comment library, independently
// of the main-post export folder configured in the popup.
const COMMENT_FOLDER = 'E:/x-obsidian/X智库/09_评论';
const COMMENT_INDEX = '[[09_评论/评论索引|返回评论索引]]';

export function initInlineObsidian(): void {
  let pending: string | null = null;
  let receiving: string | null = null;
  let panel: HTMLElement | null = null;
  let resumeAfterConnection: (() => void) | null = null;
  window.addEventListener('focus', () => { resumeAfterConnection?.(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resumeAfterConnection?.();
  });

  function notice(text: string): HTMLElement {
    resumeAfterConnection = null;
    panel?.remove();
    panel = document.createElement('section');
    panel.id = 'xclipper-obsidian-status';
    panel.setAttribute('aria-label', 'Obsidian 采集');
    panel.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;max-width:min(360px,calc(100vw - 40px));padding:16px;border:1px solid #d9e1ee;border-radius:12px;background:#fff;color:#172b4d;box-shadow:0 8px 28px #172b4d26;font:14px/1.6 system-ui;overflow-wrap:anywhere;';
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.style.margin = '0 0 8px';
    status.textContent = text;
    panel.append(status);
    document.body.append(panel);
    return panel;
  }

  function button(container: HTMLElement, label: string, click: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.cssText = 'min-height:36px;padding:6px 12px;margin:8px 8px 0 0;border:1px solid #ccd7e8;border-radius:6px;background:#f5f8ff;color:#244a91;cursor:pointer;font:inherit;';
    btn.addEventListener('click', click);
    container.append(btn);
    return btn;
  }

  function errorNotice(error: unknown): void {
    const card = notice(error instanceof Error ? error.message : String(error));
    button(card, '关闭提示', () => card.remove());
  }

  async function handoff(result: ObsidianCapture, isCurrent: () => boolean, isComment = false): Promise<void> {
    if (!result || typeof result.markdown !== 'string' || !result.markdown.trim() ||
        typeof result.filename !== 'string' || typeof result.handle !== 'string') throw new Error('未采集到完整正文，请重试');
    const settings = await loadSettings();
    if (!isCurrent()) throw new Error('采集等待已取消');
    const target = resolveObsidianTarget(result.filename, isComment
      ? { ...settings, obsidianFolder: COMMENT_FOLDER, obsidianGroupByAuthor: false }
      : settings, result.handle);
    const card = notice('正在保存到 Obsidian…');
    const status = card.querySelector('p')!;
    let saving = false;
    const save = async (): Promise<void> => {
      if (saving || panel !== card || !card.isConnected) return;
      resumeAfterConnection = null;
      saving = true;
      retry.hidden = true;
      connect.hidden = true;
      dismiss.hidden = true;
      status.textContent = '正在保存到 Obsidian…';
      try {
        const saved = await saveObsidianNote(result.markdown, target);
        if (panel !== card || !card.isConnected) return;
        status.textContent = saved.duplicate ? '已保存，无需重复保存。' : '保存成功';
        status.title = saved.path;
        const location = document.createElement('p');
        location.style.cssText = 'margin:0;font-size:12px;color:#53657d;user-select:text;';
        location.textContent = `位置（仓库内）：${saved.path}`;
        card.append(location);
        void recordExport();
        setTimeout(() => { if (panel === card) card.remove(); }, 5000);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const needsConnection = message === CONNECT_REQUIRED;
        status.textContent = needsConnection
          ? '还未获得仓库写入权限，正文已保留。请点击“连接仓库目录”，选择 X智库 根文件夹并允许写入；返回此页会自动继续保存。'
          : `保存失败，正文已保留：${message}`;
        retry.hidden = needsConnection;
        connect.hidden = false;
        dismiss.hidden = false;
      } finally { saving = false; }
    };
    const retry = button(card, '重试保存', () => { void save(); });
    const connect = button(card, '连接仓库目录', () => {
      resumeAfterConnection = () => { void save(); };
      openObsidianConnection();
    });
    const dismiss = button(card, '关闭提示', () => { resumeAfterConnection = null; card.remove(); });
    retry.hidden = connect.hidden = dismiss.hidden = true;
    // Once submitted, the background owns the write. Closing this notice
    // would not cancel it, so only failed requests expose dismiss controls.
    await save();
  }

  window.addEventListener('xclipper:obsidian', (event) => {
    if (pending) return;
    const detail = (event as CustomEvent).detail;
    const url = typeof detail?.url === 'string' ? normalizeStatusUrl(detail.url) : null;
    if (!url) { errorNotice('找不到这条推文的链接，请刷新页面重试'); return; }
    const token = crypto.randomUUID();
    const inPlace = url === normalizeStatusUrl(window.location.href);
    pending = token;
    const waiting = notice(detail.article instanceof Element ? '正在保存此条内容…' : '正在采集完整内容…');
    button(waiting, '取消等待', () => {
      if (pending === token) pending = null;
      waiting.remove();
    });
    const run = async (): Promise<void> => {
      if (detail.article instanceof Element) {
        const discussionUrl = normalizeStatusUrl(window.location.href);
        if (!discussionUrl && detail.article.querySelector('[data-testid="tweet-text-show-more-link"], [data-testid="article-cover-image"]')) {
          const cardUrl = obsidianCardUrl(detail.article);
          if (!cardUrl) throw new Error('找不到这条推文自身的链接，请刷新后重试');
          waiting.querySelector('p')!.textContent = '正在通过临时详情页采集完整正文，完成后自动关闭…';
          const response = await chrome.runtime.sendMessage({ action: 'XCLIPPER_OBSIDIAN_START', url: cardUrl, token, single: true });
          if (!response?.ok) throw new Error(response?.error || '无法打开采集详情页，请刷新插件后重试');
          if (response.result && pending === token) {
            await handoff(response.result, () => pending === token);
            if (pending === token) pending = null;
          }
          return;
        }
        const captured = await captureExpandedObsidianCard(detail.article, () => pending === token);
        const isComment = discussionUrl !== null && captured.sourceUrl !== discussionUrl;
        const settings = await loadSettings();
        if (pending !== token) return;
        const options = markdownOptions(settings, 'obsidian');
        if (isComment) options.filenameTemplate = '{handle}-{id}';
        const result = postProcess(captured, options);
        const context = `\n\n---\n内容作者：${captured.author.name} (${captured.author.handle})\n\n发布时间：${captured.date || '未提供'}\n\n原文链接：${captured.sourceUrl}${discussionUrl && discussionUrl !== captured.sourceUrl ? `\n\n采集时的讨论页：${discussionUrl}` : ''}${isComment ? `\n\n采集时间：${new Date().toISOString()}\n\n采集范围：仅本条已展开评论，不代表完整评论区。\n\n${COMMENT_INDEX}` : ''}\n`;
        await handoff({ markdown: result.markdown + context, filename: result.filename, handle: captured.author.handle, sourceUrl: captured.sourceUrl }, () => pending === token, isComment);
        if (pending === token) pending = null;
        return;
      }
      const response = await chrome.runtime.sendMessage({ action: 'XCLIPPER_OBSIDIAN_START', url, token, single: detail.single === true });
      if (!response?.ok) throw new Error(response?.error || '无法打开采集详情页，请刷新插件后重试');
      if (response.result && pending === token) {
        await handoff(response.result, () => pending === token && (!inPlace || normalizeStatusUrl(window.location.href) === url));
        if (pending === token) pending = null;
      }
    };
    void run().catch((err) => { if (pending === token) { pending = null; errorNotice(err); } });
  });

  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg?.action !== 'XCLIPPER_OBSIDIAN_DELIVER') return false;
    if (sender.id !== chrome.runtime.id || !pending || msg.token !== pending || receiving === pending) {
      respond({ ok: false });
      return false;
    }
    const token = pending;
    receiving = token;
    const run = async (): Promise<void> => {
      if (msg.error) errorNotice(msg.error);
      else await handoff(msg.result, () => pending === token);
      if (pending === token) pending = null;
    };
    run().then(() => respond({ ok: true }), (err: unknown) => {
      if (pending === token) { pending = null; errorNotice(err); }
      respond({ ok: false });
    }).finally(() => { if (receiving === token) receiving = null; });
    return true;
  });
}

export function initObsidianWorker(capture: (single: boolean) => Promise<ObsidianCapture>): void {
  const captureChecked = async (single: boolean, expectedUrl: string): Promise<ObsidianCapture> => {
    if (!expectedUrl || normalizeStatusUrl(window.location.href) !== expectedUrl) throw new Error('详情页已切换，请从当前推文重新采集');
    const result = await capture(single);
    if (normalizeStatusUrl(window.location.href) !== expectedUrl || normalizeStatusUrl(result.sourceUrl) !== expectedUrl) {
      throw new Error('采集时推文已切换，已取消交接，请重试');
    }
    return result;
  };
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg?.action === 'XCLIPPER_OBSIDIAN_VERIFY_PAGE' && sender.id === chrome.runtime.id) {
      respond({ ok: normalizeStatusUrl(window.location.href) === msg.url });
      return false;
    }
    if (msg?.action !== 'XCLIPPER_OBSIDIAN_CAPTURE_CURRENT') return false;
    if (sender.id !== chrome.runtime.id) return false;
    captureChecked(msg.single === true, msg.url).then(
      (result) => respond({ ok: true, result }),
      (err: unknown) => respond({ ok: false, error: err instanceof Error ? err.message : String(err) }),
    );
    return true;
  });
  const marker = window.location.hash.match(MARKER);
  if (marker) {
    const expectedUrl = normalizeStatusUrl(window.location.href)!;
    // Remove only our marker so refreshing cannot silently resubmit a note.
    history.replaceState(null, '', window.location.pathname + window.location.search);
    const status = document.createElement('div');
    status.setAttribute('role', 'status');
    status.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;max-width:340px;padding:16px;background:#fff;color:#172b4d;border:1px solid #ccd7e8;border-radius:10px;font:14px/1.6 system-ui;';
    status.textContent = '正在采集，完成后将自动关闭此临时详情页…';
    document.body.append(status);
    const errorNotice = (err: unknown): void => { status.textContent = err instanceof Error ? err.message : String(err); };
    void (async () => {
      let result: ObsidianCapture | undefined;
      let error: string | undefined;
      try { result = await captureChecked(marker[2] === '1', expectedUrl); }
      catch (err) { error = err instanceof Error ? err.message : String(err); }
      const response = await chrome.runtime.sendMessage({ action: 'XCLIPPER_OBSIDIAN_READY', token: marker[1], result, error });
      if (error || !response?.ok) errorNotice(error || response?.error || '原页面未接收内容，详情页已保留');
    })().catch(errorNotice);
  }
}
