import { loadSettings } from '../shared/settings';
import { buildObsidianTargetUrl, resolveObsidianTarget } from '../shared/obsidian';
import { recordExport } from '../shared/review-prompt';
import { normalizeStatusUrl } from './status-url';
import { captureObsidianCard } from './obsidian-card';
import { postProcess, markdownOptions } from '../shared/post-process';
import { writeFocusedClipboard } from '../shared/focused-clipboard';

export type ObsidianCapture = { markdown: string; filename: string; handle: string; sourceUrl: string };
const MARKER = /^#xclipper-obsidian=([\w-]{20,80})(?:&single=(1))?$/;

export function initInlineObsidian(): void {
  let pending: string | null = null;
  let receiving: string | null = null;
  let panel: HTMLElement | null = null;

  function notice(text: string): HTMLElement {
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
    const target = resolveObsidianTarget(result.filename, isComment ? { ...settings, obsidianGroupByAuthor: false } : settings, result.handle);
    if (isComment) target.path = target.path.slice(0, -result.filename.length) + `评论/${result.filename}`;
    const fullUrl = buildObsidianTargetUrl(result.markdown, target);
    const useClipboard = fullUrl.length > 1800;
    const url = useClipboard ? buildObsidianTargetUrl(null, target) : fullUrl;
    if (url.length > 1800) throw new Error('Obsidian 保存路径过长，请在插件设置中缩短目录或文件名');
    const card = notice('采集完成，正在自动发送到 Obsidian…');
    const status = card.querySelector('p')!;
    const destination = document.createElement('div');
    destination.textContent = target.absolute ? target.path : `${target.vault || '当前仓库'} / ${target.path}`;
    card.append(destination);
    if (useClipboard) {
      const hint = document.createElement('div');
      hint.textContent = '长文通过剪贴板交接，会替换剪贴板内容；笔记出现前请勿复制其他内容。';
      card.append(hint);
    }
    let launching = false;
    const controller = new AbortController();
    const launch = async (): Promise<void> => {
      if (launching) return;
      launching = true;
      retry.hidden = true;
      retry.disabled = true;
      try {
        if (useClipboard) await writeFocusedClipboard(result.markdown, controller.signal, () => {
          status.textContent = '内容已采集，切回此页面后将自动保存，无需再次点击。';
        });
        if (panel !== card || !card.isConnected) return;
        // Run the protocol on the original page, which remains alive for the
        // browser's confirmation. A URI launch is not a filesystem-save ack.
        window.location.href = url;
        status.textContent = '已自动发送到 Obsidian。';
        void recordExport();
        setTimeout(() => { if (panel === card) card.remove(); }, 3000);
      } catch (err) {
        status.textContent = `自动发送失败，正文已保留：${err instanceof Error ? err.message : String(err)}`;
        retry.hidden = false;
      } finally {
        launching = false;
        retry.disabled = false;
      }
    };
    const retry = button(card, '重试自动保存', () => { void launch(); });
    retry.hidden = true;
    button(card, '关闭提示', () => { controller.abort(); card.remove(); });
    // The original page owns the complete result before it acknowledges the
    // worker. A blocked clipboard/protocol launch leaves a real-click retry.
    await launch();
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
        const captured = captureObsidianCard(detail.article);
        const isComment = discussionUrl !== null && captured.sourceUrl !== discussionUrl;
        const settings = await loadSettings();
        if (pending !== token) return;
        const options = markdownOptions(settings, 'obsidian');
        if (isComment) options.filenameTemplate = '{handle}-{id}';
        const result = postProcess(captured, options);
        const context = `\n\n---\n内容作者：${captured.author.name} (${captured.author.handle})\n\n发布时间：${captured.date || '未提供'}\n\n原文链接：${captured.sourceUrl}${discussionUrl && discussionUrl !== captured.sourceUrl ? `\n\n采集时的讨论页：${discussionUrl}` : ''}\n`;
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
