import { isTrustedXContentSender } from './security';

const PREFIX = 'xclipper_obsidian_capture_';
type CaptureJob = { sourceTab: number; token: string; url: string; createdAt: number };

function statusUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const url = new URL(raw);
    const path = url.pathname.match(/^\/[^/]+\/status\/\d+(?:\/.*)?$/);
    return url.protocol === 'https:' && url.hostname === 'x.com' && path
      ? url.origin + url.pathname.match(/^\/[^/]+\/status\/\d+/)![0] : null;
  } catch { return null; }
}

export function initObsidianCapture(): void {
  async function stillOnTarget(tabId: number, url: string): Promise<boolean> {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url) return statusUrl(tab.url) === url;
    // Without the broad tabs permission, Chrome can omit tab.url even for
    // our worker. Ask that tab's content script instead of widening access.
    const response = await chrome.tabs.sendMessage(tabId, { action: 'XCLIPPER_OBSIDIAN_VERIFY_PAGE', url });
    return response?.ok === true;
  }
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (!msg || !['XCLIPPER_OBSIDIAN_START', 'XCLIPPER_OBSIDIAN_READY'].includes(msg.action)) return false;
    if (sender.id !== chrome.runtime.id || !isTrustedXContentSender(sender) ||
        sender.frameId !== 0 || sender.tab?.id === undefined) {
      respond({ ok: false, error: '无法确认采集页面来源' });
      return false;
    }
    const tabId = sender.tab.id;
    const run = async (): Promise<{ ok: boolean; result?: unknown }> => {
      if (msg.action === 'XCLIPPER_OBSIDIAN_START') {
        const url = statusUrl(msg.url);
        if (!url || typeof msg.token !== 'string' || !/^[\w-]{20,80}$/.test(msg.token)) {
          throw new Error('无效的推文链接或采集标识');
        }
        if (statusUrl(sender.url) === url) {
          try {
            const response = await chrome.tabs.sendMessage(tabId, { action: 'XCLIPPER_OBSIDIAN_CAPTURE_CURRENT', url, single: msg.single === true });
            if (typeof response?.ok === 'boolean') return response;
          } catch {
            // SPA navigation from /home may not have loaded content.js. Use
            // an owned worker in that case, leaving the user's page intact.
          }
        }
        // Register ownership before navigating, so even a cached page cannot
        // finish before its job exists. Session storage survives SW suspension.
        const child = await chrome.tabs.create({ url: 'about:blank', active: false, openerTabId: tabId });
        if (child.id === undefined) throw new Error('无法打开采集详情页');
        const key = PREFIX + child.id;
        try {
          const job: CaptureJob = { sourceTab: tabId, token: msg.token, url, createdAt: Date.now() };
          await chrome.storage.session.set({ [key]: job });
          await chrome.tabs.update(child.id, { url: `${url}#xclipper-obsidian=${msg.token}${msg.single === true ? '&single=1' : ''}` });
        } catch (err) {
          await chrome.storage.session.remove(key);
          await chrome.tabs.remove(child.id).catch(() => {});
          throw err;
        }
        return { ok: true };
      }

      const key = PREFIX + tabId;
      const job = (await chrome.storage.session.get(key))[key] as CaptureJob | undefined;
      if (!job || msg.token !== job.token || statusUrl(sender.url) !== job.url ||
          Date.now() - job.createdAt > 10 * 60_000) throw new Error('采集任务已失效，请从原卡片重试');
      if (!msg.error && statusUrl(msg.result?.sourceUrl) !== job.url) throw new Error('采集结果与目标推文不一致，详情页已保留');
      if (!await stillOnTarget(tabId, job.url)) throw new Error('详情页已切换，已取消自动关闭');
      const response = await chrome.tabs.sendMessage(job.sourceTab, {
        action: 'XCLIPPER_OBSIDIAN_DELIVER', token: job.token,
        result: msg.result, error: msg.error,
      });
      if (!response?.ok) throw new Error('原页面未接收内容，详情页已保留，请重试');
      // Failure remains visible in both pages. Only a received successful
      // capture may close this extension-created tab; never close sourceTab.
      if (!msg.error && msg.result) {
        if (await stillOnTarget(tabId, job.url)) await chrome.tabs.remove(tabId);
      }
      await chrome.storage.session.remove(key);
      return { ok: true };
    };
    run().then(respond, (err: unknown) => respond({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    return true;
  });
  chrome.tabs.onRemoved.addListener((tabId) => { void chrome.storage.session.remove(PREFIX + tabId); });
}
