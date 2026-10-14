// A port owns one temporary detail tab. Losing the originating iframe (refresh,
// navigation, tab close) releases that tab too; no caller supplies a tab to close.
export function initPageExportWorker(): void {
  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'xclipper-page-export' || port.sender?.id !== chrome.runtime.id ||
        port.sender.url?.split('#')[0] !== chrome.runtime.getURL('page-export.html')) return;
    let connected = true;
    let creating = false;
    let ownedTab: number | undefined;
    const cleanup = () => {
      connected = false;
      if (ownedTab !== undefined) {
        const id = ownedTab; ownedTab = undefined;
        void chrome.tabs.remove(id).catch(() => { /* already closed */ });
      }
    };
    port.onDisconnect.addListener(cleanup);
    port.onMessage.addListener(msg => {
      if (msg?.type !== 'create' || creating || ownedTab !== undefined) return;
      if (typeof msg.url !== 'string' || !/^https:\/\/x\.com\/[a-zA-Z0-9_]{1,15}\/status\/\d+$/.test(msg.url)) {
        port.postMessage({ error: '无效的详情页链接' }); return;
      }
      creating = true;
      void chrome.tabs.create({ url: 'about:blank', active: false, ...(port.sender?.tab?.id ? { openerTabId: port.sender.tab.id } : {}) }).then(async tab => {
        ownedTab = tab.id;
        if (!connected) { cleanup(); return; }
        if (ownedTab === undefined) throw new Error('无法创建临时详情页');
        await chrome.tabs.update(ownedTab, { url: msg.url });
        if (!connected) { cleanup(); return; }
        port.postMessage({ tabId: ownedTab });
      }).catch(err => { if (connected) port.postMessage({ error: String(err.message || err) }); });
    });
  });
}
