import { exportCaptured, PAGE_FORMATS, type PageFormat } from '../content/page-export';
import { loadSettings, SETTINGS_KEY } from '../shared/settings';
import { normalizeStatusUrl } from '../content/status-url';
const format = document.getElementById('format') as HTMLSelectElement;
const scope = document.getElementById('scope') as HTMLSelectElement;
const copy = document.getElementById('copy') as HTMLButtonElement;
const download = document.getElementById('download') as HTMLButtonElement;
const close = document.getElementById('close') as HTMLButtonElement;
const status = document.getElementById('status')!;
const params = new URLSearchParams(location.hash.slice(1));
const url = normalizeStatusUrl(params.get('url') || '');
let busy = false, revision = 0;
let tabId: number | undefined;
const tell = (type: string, extra = {}) => parent.postMessage({ type, ...extra }, 'https://x.com');
const dismiss = () => { if (!busy) tell('xclipper-export-close'); };
close.onclick = dismiss;
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') dismiss();
  if (event.key === 'Tab') {
    const controls = [format, scope, download, copy, close].filter(el => !el.hidden && !el.disabled);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});
function sync() { copy.hidden = format.value === 'pdf'; download.textContent = copy.hidden ? '导出 PDF' : '下载文件'; }
format.onchange = () => {
  revision++; sync();
  void chrome.storage.local.get(SETTINGS_KEY).then(raw => chrome.storage.local.set({
    [SETTINGS_KEY]: { ...(raw[SETTINGS_KEY] as object || {}), pageExportFormat: format.value,
      ...(format.value !== 'pdf' ? { singleFormat: format.value } : {}) },
  })).catch(err => { status.textContent = '格式偏好未保存：' + String(err); });
};
async function capture(id: number, single: boolean) {
  const result = await chrome.tabs.sendMessage(id, { action: 'XCLIPPER_CAPTURE_PAGE', url, single }, { frameId: 0 });
  if (!result?.success) throw new Error(result?.error || '请刷新 X 页面后重试。');
  return result.data;
}
async function run(mode: 'copy' | 'download') {
  if (busy || !url || tabId === undefined) return;
  busy = true; tell('xclipper-export-busy', { busy: true });
  const selected = format.value as PageFormat, single = scope.value === 'single';
  for (const control of [format, scope, copy, download, close]) control.disabled = true;
  let temporary: number | undefined;
  let owner: chrome.runtime.Port | undefined;
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  status.textContent = '正在采集…';
  try {
    let data = await capture(tabId, single);
    if (!data) {
      owner = chrome.runtime.connect({ name: 'xclipper-page-export' });
      temporary = await new Promise<number>((resolve, reject) => {
        owner!.onMessage.addListener(msg => msg.error ? reject(new Error(msg.error)) : typeof msg.tabId === 'number' && resolve(msg.tabId));
        owner!.onDisconnect.addListener(() => reject(new Error('临时采集连接中断，请重试。')));
        owner!.postMessage({ type: 'create', url });
      });
      keepAlive = setInterval(() => { try { owner?.postMessage({ type: 'keepalive' }); } catch { /* capture reports disconnect */ } }, 20000);
      if (temporary === undefined) throw new Error('无法打开临时详情页。');
      status.textContent = '正在补全详情，完成后自动关闭临时页面…';
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try { ready = !!await chrome.tabs.sendMessage(temporary, { action: 'XCLIPPER_PAGE_TOOLS_STATUS' }, { frameId: 0 }); } catch { /* navigation in progress */ }
        if (ready) break;
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      if (!ready) throw new Error('详情页加载超时，请检查登录状态后重试。');
      data = await capture(temporary, single);
    }
    if (!data) throw new Error('未采集到正文。');
    await exportCaptured(data, selected, mode, text => {
      status.textContent = text; tell('xclipper-export-result', { text });
    });
    return true;
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    status.textContent = text; tell('xclipper-export-result', { text, error: true });
    return false;
  } finally {
    if (keepAlive) clearInterval(keepAlive);
    owner?.disconnect();
    busy = false; tell('xclipper-export-busy', { busy: false });
    for (const control of [format, scope, copy, download, close]) control.disabled = false;
  }
}
download.onclick = () => { void run('download'); };
copy.onclick = () => { void run('copy'); };
async function init() {
  const initial = revision;
  const [settings, tab] = await Promise.all([loadSettings(), chrome.tabs.getCurrent()]);
  tabId = tab?.id;
  const value = settings.pageExportFormat ?? settings.singleFormat;
  if (revision === initial) format.value = PAGE_FORMATS.includes(value) ? value : 'md';
  sync(); format.focus();
  copy.disabled = download.disabled = !url || tabId === undefined;
  if (!url || tabId === undefined) throw new Error('请从 X 帖子下方打开导出菜单。');
  // A direct click waits for persisted preferences before starting exactly once.
  if (params.get('download') === '1' && await run('download')) dismiss();
}
void init().catch(err => { status.textContent = String(err.message || err); });
