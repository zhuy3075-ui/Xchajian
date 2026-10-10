import { isExtensionPageSender, isTrustedXContentSender } from './security';
import { CONNECT_REQUIRED, vaultConnection, writeVaultNote } from '../shared/obsidian-files';

export function initObsidianFiles(): void {
  let writes = Promise.resolve();
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (!['XCLIPPER_OBSIDIAN_SAVE_FILE', 'XCLIPPER_OBSIDIAN_CONNECT'].includes(msg?.action)) return false;
    if (sender.id !== chrome.runtime.id || !(isExtensionPageSender(sender, chrome.runtime.id) ||
        (sender.frameId === 0 && isTrustedXContentSender(sender)))) {
      respond({ ok: false, error: '无法确认保存请求来源' });
      return false;
    }
    if (msg.action === 'XCLIPPER_OBSIDIAN_CONNECT') {
      chrome.tabs.create({ url: chrome.runtime.getURL('obsidian-connect.html') }).then(
        () => respond({ ok: true }), err => respond({ ok: false, error: String(err) }),
      );
      return true;
    }
    const run = async (): Promise<void> => {
      try {
        const connection = await vaultConnection();
        if (!connection) throw new Error(CONNECT_REQUIRED);
        const result = await writeVaultNote(connection, msg.target, msg.markdown);
        respond({ ok: true, ...result });
      } catch (err) { respond({ ok: false, error: err instanceof Error ? err.message : String(err) }); }
    };
    writes = writes.then(run, run);
    return true;
  });
}
