import { SETTINGS_KEY, HISTORY_KEY, EPOCH_KEY, mergeSettings, recordSamples } from './model';

export function trustedLensSender(sender: chrome.runtime.MessageSender, clear: boolean): boolean {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;
  if (clear) return sender.url === chrome.runtime.getURL('lens/popup.html');
  try { return new URL(sender.url).origin === 'https://x.com' && sender.tab?.id !== undefined && (sender.frameId ?? 0) === 0; }
  catch { return false; }
}

// All tabs write through one queue. An epoch invalidates batches queued before clear.
export function createHistoryQueue(storage: Pick<chrome.storage.StorageArea, 'get' | 'set'>) {
  let queue: Promise<unknown> = Promise.resolve();
  return (message: { type: string; epoch?: unknown; samples?: unknown }) => {
    const result = queue.then(async () => {
      const stored = await storage.get([SETTINGS_KEY, HISTORY_KEY, EPOCH_KEY]);
      const epoch = Number.isSafeInteger(stored[EPOCH_KEY]) ? Number(stored[EPOCH_KEY]) : 0;
      if (message.type === 'LENS_CLEAR') {
        await storage.set({ [HISTORY_KEY]: {}, [EPOCH_KEY]: epoch + 1 });
        return { ok: true };
      }
      const settings = mergeSettings(stored[SETTINGS_KEY]);
      if (!settings.enabled || !settings.trackHistory || message.epoch !== epoch) return { ok: true, ignored: true };
      const history = recordSamples(stored[HISTORY_KEY], message.samples, Date.now());
      await storage.set({ [HISTORY_KEY]: history });
      return { ok: true };
    });
    queue = result.catch(() => undefined);
    return result;
  };
}

export function initLens(): void {
  const enqueue = createHistoryQueue(chrome.storage.local);
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!message || !['LENS_RECORD', 'LENS_CLEAR'].includes(message.type)) return;
    if (!trustedLensSender(sender, message.type === 'LENS_CLEAR')) {
      respond({ ok: false, error: '不允许的粉丝透镜请求来源' });
      return;
    }
    void enqueue(message).then(respond, (error: unknown) => respond({ ok: false, error: String(error) }));
    return true;
  });
}
