import { pageNotice } from './page-notice';
let dismiss: (() => void) | undefined;
export function closeExportMenu(): void { dismiss?.(); }

// Keep session/video access in extension origin, as in the old popup.
export async function openExportMenu(anchor: HTMLElement, url: string, _card?: Element, download = false): Promise<void> {
  dismiss?.();
  if (dismiss) return; // The existing menu still owns an in-flight temporary tab.
  const frame = document.createElement('iframe');
  frame.title = '导出当前内容';
  frame.allow = 'clipboard-write';
  frame.dataset.xclipperExportMenu = '1';
  frame.src = chrome.runtime.getURL('page-export.html') + '#' + new URLSearchParams({ url, ...(download ? { download: '1' } : {}) });
  frame.style.cssText = 'position:fixed;z-index:2147483646;box-sizing:border-box;width:min(320px,calc(100vw - 24px));height:min(276px,calc(100vh - 24px));border:1px solid light-dark(#dce3ed,#424957);border-radius:16px;background:Canvas;color-scheme:light dark;box-shadow:0 8px 32px #15294426;';
  let busy = false;
  let contentHeight = 276;
  const position = () => {
    if (!anchor.isConnected && !busy) { close(); return; }
    const rect = anchor.getBoundingClientRect();
    frame.style.height = Math.min(contentHeight, Math.max(1, innerHeight - 24)) + 'px';
    frame.style.left = Math.max(12, Math.min(rect.right - frame.offsetWidth, innerWidth - frame.offsetWidth - 12)) + 'px';
    frame.style.top = Math.max(12, Math.min(rect.top - frame.offsetHeight - 8, innerHeight - frame.offsetHeight - 12)) + 'px';
  };
  const outside = (event: Event) => {
    if (!busy && event.target !== frame && !anchor.contains(event.target as Node)) close();
  };
  const keyboard = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) close(); };
  const message = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== new URL(chrome.runtime.getURL('/')).origin) return;
    if (event.data?.type === 'xclipper-export-size' && Number.isFinite(event.data.height)) {
      contentHeight = Math.max(160, Math.min(640, event.data.height)); position();
    }
    if (event.data?.type === 'xclipper-export-busy') busy = event.data.busy === true;
    if (event.data?.type === 'xclipper-export-close' && !busy) close();
    // Manual export already shows its result inside the open panel. Only the
    // direct-download flow needs a page notice after its frame closes.
    if (download && event.data?.type === 'xclipper-export-result' && typeof event.data.text === 'string') pageNotice(event.data.text, event.data.error === true);
  };
  function close() {
    if (busy) return;
    frame.remove(); anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', keyboard);
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position, true);
    window.removeEventListener('message', message);
    if (dismiss === close) dismiss = undefined;
    if (anchor.isConnected) anchor.focus();
  }
  dismiss = close;
  anchor.setAttribute('aria-expanded', 'true');
  document.body.append(frame); position(); frame.focus();
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', keyboard);
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);
  window.addEventListener('message', message);
}
