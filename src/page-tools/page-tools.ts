import { loadSettings, SETTINGS_KEY, type BatchFormat } from '../shared/settings';
import type { BatchStatusResponse, FastBatchStatusResponse, HarvestResponse } from '../types/messages';
import { EXPORTED_LEDGER_KEY, INCOMPLETE_LEDGER_KEY, RESUME_CURSOR_KEY, DATE_CURSOR_KEY, statusIdOf } from '../background/batch-state';
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const start = el<HTMLButtonElement>('start'), format = el<HTMLSelectElement>('format'), scope = el<HTMLSelectElement>('scope');
const pause = el<HTMLButtonElement>('pause'), stop = el<HTMLButtonElement>('stop');
const error = el('error'), progress = el('progress');
let tabId: number | undefined;
let active = false, fastActive = false, paused = false, polling = false, starting = false;
let harvest: HarvestResponse = { source: null, urls: [] };
let latestEngine = 'manual';
let shownFast = false;
let revision = 0;
const names = { bookmarks: '书签', likes: '喜欢', profile: '主页帖子', timeline: '时间线' };
function fail(err: unknown): void { error.hidden = false; error.textContent = err instanceof Error ? err.message : String(err); }
async function send(action: string, extra = {}) {
  const result = await chrome.runtime.sendMessage({ action, ...extra });
  if (result?.success === false) throw new Error(result.error || '操作失败');
  return result;
}
async function page(action: string, extra = {}) {
  if (tabId === undefined) throw new Error('无法识别所在页面，请关闭后重新打开采集工具。');
  const response = await chrome.tabs.sendMessage(tabId, { action, ...extra }, { frameId: 0 });
  if (!response) throw new Error('请刷新 X 页面后重试。');
  return response;
}
async function poll(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    const [standard, fast, context, saved] = await Promise.all([
      send('BATCH_STATUS') as Promise<BatchStatusResponse>,
      send('FAST_BATCH_STATUS') as Promise<FastBatchStatusResponse>,
      page('XCLIPPER_HARVEST') as Promise<HarvestResponse>,
      chrome.storage.local.get(['batchMode', 'fastPaginateMode', 'fastDateFrom', 'fastDateTo', EXPORTED_LEDGER_KEY]),
    ]);
    harvest = context;
    latestEngine = typeof saved.batchMode === 'string' ? saved.batchMode : 'manual';
    const job = standard.job, fastJob = fast.progress;
    fastActive = fastJob?.status === 'running';
    paused = job?.status === 'paused';
    active = fastActive || paused || job?.status === 'running';
    if (fastActive) shownFast = true;
    else if (active) shownFast = false;
    const ledger = new Set(Array.isArray(saved[EXPORTED_LEDGER_KEY]) ? saved[EXPORTED_LEDGER_KEY] as string[] : []);
    const fresh = context.urls.filter(url => !ledger.has(statusIdOf(url) || ''));
    el('source').textContent = context.source ? names[context.source] + (context.handle ? ' @' + context.handle : '') + ' · 已加载 ' + context.urls.length + ' 条，未导出 ' + fresh.length + ' 条' : '当前页面不支持列表采集，可使用“选择多条”。';
    const automatic = scope.value === 'automatic';
    const supported = context.source && context.source !== 'timeline' && latestEngine !== 'manual';
    el('strategy').textContent = automatic
      ? supported ? (latestEngine === 'super' ? '快速采集单帖，不补全线程' : '自动采集并补全线程') + '；范围：' + ({ recent: '最近新增', resume: '从上次位置继续', dateRange: '指定日期' }[saved.fastPaginateMode as string] || '最近新增') + (saved.fastPaginateMode === 'dateRange' ? ' ' + (saved.fastDateFrom || '不限') + ' 至 ' + (saved.fastDateTo || '不限') : '') + '。按插件设置输出文件，可能产生多次下载。'
      : '自动翻页仅支持书签、喜欢和主页；请先在插件设置中启用自动或快速采集。'
      : '仅处理本页已经加载过的条目，不自动翻页；每条使用现有完整线程采集方式。';
    start.disabled = starting || active || !(automatic ? supported : context.source && fresh.length);
    format.disabled = active || starting;
    scope.disabled = active || starting;
    el<HTMLButtonElement>('select').disabled = active || starting;
    for (const id of ['reset-history', 'reset-queue']) el<HTMLButtonElement>(id).disabled = active || starting;
    pause.hidden = !active || fastActive;
    stop.hidden = !active;
    pause.textContent = paused ? '继续' : '暂停';
    if (fastJob && (shownFast || fastActive || (automatic && fastJob.status !== 'idle' && !active))) {
      progress.textContent = '自动采集 · ' + (fastJob.handle ? '@' + fastJob.handle + ' · ' : '') + fastJob.phase + ' · 已处理 ' + fastJob.done + ' / ' + (fastJob.total || '待确定') + '，导出 ' + fastJob.exported + '，跳过 ' + fastJob.skipped + (fastJob.error ? ' · ' + fastJob.error : '') + (fastJob.rateLimited ? ' · 已限流，请稍后继续' : '');
    } else if (job) {
      progress.textContent = (names[job.origin as keyof typeof names] || '手动选择') + (job.handle ? ' @' + job.handle : '') + ' · ' + ({ running: '正在导出', paused: '已暂停', done: '处理结束', cancelled: '已停止' }[job.status]) + ' · 成功 ' + job.completed + ' / ' + job.total + '，失败 ' + job.failed + (job.pauseReason ? ' · ' + job.pauseReason : '');
    }
  } catch (err) { start.disabled = true; fail(err); }
  finally { polling = false; }
}
function on(id: string, action: () => Promise<unknown>): void {
  el(id).onclick = () => { error.hidden = true; void action().then(() => poll()).catch(fail); };
}
on('select', () => page('XCLIPPER_SELECTION', { enable: true }));
on('cancel-selection', () => page('XCLIPPER_SELECTION', { enable: false }));
on('reset-queue', () => page('XCLIPPER_HARVEST_RESET'));
on('reset-history', async () => {
  if (!confirm('清除批量导出的去重与续传记录？已有文件不会删除，再次采集可能重复下载。')) return;
  await chrome.storage.local.remove([EXPORTED_LEDGER_KEY, INCOMPLETE_LEDGER_KEY, RESUME_CURSOR_KEY, DATE_CURSOR_KEY]);
});
on('pause', () => send('BATCH_CONTROL', { control: paused ? 'resume' : 'pause' }));
on('stop', () => fastActive ? send('FAST_BATCH_CANCEL') : send('BATCH_CONTROL', { control: 'cancel' }));
on('start', async () => {
  if (starting || active) return;
  starting = true; start.disabled = true;
  const sourceAtClick = harvest.source, handleAtClick = harvest.handle;
  const selectedScope = scope.value, selectedFormat = format.value as BatchFormat;
  try {
    const current = await page('XCLIPPER_HARVEST') as HarvestResponse;
    if (current.source !== sourceAtClick || current.handle !== handleAtClick) throw new Error('页面来源已切换，请核对范围后重新开始。');
    const settings = await loadSettings();
    if (selectedScope === 'automatic') {
      const saved = await chrome.storage.local.get(['batchMode', 'fastPaginateMode', 'fastDateFrom', 'fastDateTo']);
      if (!current.source || current.source === 'timeline' || !['auto', 'super'].includes(String(saved.batchMode))) throw new Error('此页面或采集方式不支持自动翻页。');
      if (saved.batchMode !== latestEngine) throw new Error('采集设置已更改，请核对后重试。');
      // Fast engine snapshots the existing format setting at start.
      const raw = await chrome.storage.local.get(SETTINGS_KEY);
      await chrome.storage.local.set({ [SETTINGS_KEY]: { ...(raw[SETTINGS_KEY] as object || {}), batchFormat: selectedFormat } });
      await send('FAST_BATCH_START', { source: current.source, handle: current.handle,
        expandThreads: saved.batchMode !== 'super', paginate: saved.fastPaginateMode || 'recent',
        fromDate: saved.fastDateFrom || undefined, toDate: saved.fastDateTo || undefined });
    } else {
      if (!current.source || !current.urls.length) throw new Error('本页尚未加载可导出的条目。');
      await send('BATCH_START', { urls: current.urls, origin: current.source, handle: current.handle,
        format: selectedFormat, output: selectedFormat === 'csv' ? 'combined' : settings.batchOutput });
    }
    active = true;
  } finally { starting = false; }
});
format.onchange = () => {
  revision++;
  void chrome.storage.local.get(SETTINGS_KEY).then(raw => chrome.storage.local.set({
    [SETTINGS_KEY]: { ...(raw[SETTINGS_KEY] as object || {}), batchFormat: format.value },
  })).catch(fail);
};
scope.onchange = () => { void poll(); };
async function init(): Promise<void> {
  // Unlike active-tab queries, getCurrent binds this iframe to its own X tab.
  const tab = await chrome.tabs.getCurrent();
  tabId = tab?.id;
  const initial = revision;
  const settings = await loadSettings();
  if (revision === initial) format.value = settings.batchFormat;
  await poll();
  window.setInterval(() => { if (!document.hidden) void poll(); }, 1000);
}
void init().catch(fail);
