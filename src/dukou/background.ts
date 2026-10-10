import { feishuReadArticle, feishuWriteArticle } from './feishu-api.js';
import { saveToLibrary, deleteFromLibrary } from './library';
import { articleId, destination, DEST_URLS, isDukouPage, sourceUrl, validateArticle } from './security';
import { FEATURE_ORIGINS, syncDukouScripts } from './permissions';
import type { Destination, LibraryArticle } from './types';

const BRIDGE = 'http://127.0.0.1:8787';
const BRIDGE_ALARM = 'dukou-bridge';
const EXTRACT_ALARM = 'dukou-extraction';
interface ExtractionJob {
  tabId: number;
  dest: Destination;
  deadline: number;
  url: string;
  bridgeTask?: { taskId: string; saveTo?: string };
}
type DukouMessage = Record<string, unknown> & { cmd: string };
const COMMANDS = new Set([
  'start', 'extracted', 'extract_failed', 'bridge_poll', 'send_to_dest', 'feishu_write',
  'feishu_read', 'dukou_sync_scripts', 'dukou_bridge_enabled', 'save_article', 'delete_article',
]);
let polling = false;
let starting = false;
let sending = false;
let bridgeWrites: Promise<unknown> = Promise.resolve();

export function setDukouStatus(text: string, error = false): void {
  void chrome.storage.local.set({ wx_status: { text, error, at: Date.now() } });
}

async function requirePermission(origins: string[]): Promise<void> {
  if (!await chrome.permissions.contains({ origins })) throw new Error('请先在稿件分发页面授权所需网站访问');
}

async function openDestination(dest: Destination, id?: string, autoFill = false): Promise<void> {
  const url = DEST_URLS[dest];
  if (!url) return;
  await requirePermission(FEATURE_ORIGINS[dest as 'x' | 'bili' | 'editor']);
  await syncDukouScripts();
  if (id && autoFill) await chrome.storage.local.set({ wx_autofill: { id, dest, at: Date.now() } });
  await chrome.tabs.create({ url, active: true });
}

async function currentJob(): Promise<ExtractionJob | undefined> {
  return (await chrome.storage.local.get<{ dukou_job?: ExtractionJob }>('dukou_job')).dukou_job;
}

async function finishExtraction(article?: LibraryArticle, error?: string, skippedImages = 0): Promise<void> {
  const job = await currentJob();
  if (!job) return;
  await chrome.storage.local.remove('dukou_job');
  await chrome.alarms.clear(EXTRACT_ALARM);
  // Only close the background-owned worker; user-opened WeChat tabs never reach this handler.
  await chrome.tabs.remove(job.tabId).catch(() => {});
  const reported = job.bridgeTask ? await postBridgeResult(job.bridgeTask.taskId, {
    ok: !!article && !error, article, error, saveTo: job.bridgeTask.saveTo,
  }) : true;
  if (error) { setDukouStatus(error, true); return; }
  if (article) {
    setDukouStatus(`抓取完成：《${article.title}》，已存入文章库。${skippedImages ? `有 ${skippedImages} 张图片下载失败，请对照原文补充。` : ''}${reported ? '' : '本地桥结果回传失败，已保存并将在下次同步重试。'}`, skippedImages > 0 || !reported);
    await openDestination(job.dest);
  }
}

async function sendExtract(): Promise<void> {
  if (sending) return;
  sending = true;
  try {
    for (let attempt = 0; attempt < 15; attempt++) {
      const job = await currentJob();
      if (!job) return;
      if (job.deadline <= Date.now()) { await finishExtraction(undefined, '抓取超时，请重新复制链接后重试。'); return; }
      try {
        const response = await chrome.tabs.sendMessage(job.tabId, { cmd: 'extract' });
        if (response?.ok) return;
      } catch { /* Navigation may not have installed the content script yet. */ }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await finishExtraction(undefined, '无法连接文章页，请确认已授权访问并重新抓取。');
  } finally { sending = false; }
}

async function startExtraction(raw: unknown, dest: Destination, bridgeTask?: ExtractionJob['bridgeTask']): Promise<void> {
  const source = sourceUrl(raw);
  if (source.kind !== 'wechat') throw new Error('此抓取入口仅支持微信文章');
  if (starting || await currentJob()) throw new Error('已有微信抓取任务，请等待完成后再试');
  starting = true;
  try {
    await requirePermission(FEATURE_ORIGINS.wechat);
    if (dest !== 'none') await requirePermission(FEATURE_ORIGINS[dest]);
    await syncDukouScripts();
    setDukouStatus('正在打开文章页…');
    const tab = await chrome.tabs.create({ url: source.url, active: false });
    if (tab.id === undefined) throw new Error('无法创建抓取页面');
    await chrome.storage.local.set({ dukou_job: {
      tabId: tab.id, url: source.url, dest, deadline: Date.now() + 180_000, bridgeTask,
    } satisfies ExtractionJob });
    await chrome.alarms.create(EXTRACT_ALARM, { when: Date.now() + 180_000 });
    void sendExtract().catch((error: Error) => setDukouStatus(error.message, true));
  } finally { starting = false; }
}

async function isExtractionSender(sender: chrome.runtime.MessageSender): Promise<boolean> {
  const job = await currentJob();
  if (!job || sender.id !== chrome.runtime.id || sender.tab?.id !== job.tabId || sender.frameId !== 0) return false;
  try { return sourceUrl(sender.url).kind === 'wechat'; } catch { return false; }
}

export async function handleDukouMessage(msg: DukouMessage, sender: chrome.runtime.MessageSender): Promise<{ ok: boolean; error?: string }> {
  try {
    if (['extracted', 'extract_failed'].includes(msg.cmd)) {
      if (!await isExtractionSender(sender)) throw new Error('拒绝非当前抓取页面的回传');
      if (msg.cmd === 'extract_failed') {
        await finishExtraction(undefined, '抓取失败：' + String(msg.reason));
      } else {
        validateArticle(msg.article);
        await saveToLibrary(msg.article);
        await finishExtraction(msg.article, undefined, typeof msg.skippedImages === 'number' ? msg.skippedImages : 0);
      }
      return { ok: true };
    }
    if (!isDukouPage(sender)) throw new Error('拒绝非插件页面的稿件操作');
    switch (msg.cmd) {
      case 'dukou_sync_scripts': await syncDukouScripts(); break;
      case 'start': await startExtraction(msg.url, destination(msg.dest ?? 'none')); break;
      case 'save_article': validateArticle(msg.article); await saveToLibrary(msg.article); break;
      case 'delete_article': await deleteFromLibrary(articleId(msg.id)); break;
      case 'send_to_dest': {
        const id = articleId(msg.id);
        const article = (await chrome.storage.local.get('art_' + id))['art_' + id];
        validateArticle(article);
        await openDestination(destination(msg.dest), id, true);
        setDukouStatus(`正在打开编辑页面：《${article.title}》，填入后请检查草稿。`);
        break;
      }
      case 'feishu_read': {
        const source = sourceUrl(msg.url);
        if (source.kind !== 'feishu') throw new Error('仅支持飞书 docx/wiki 链接');
        const dest = destination(msg.dest ?? 'none');
        await requirePermission(FEATURE_ORIGINS.feishu);
        if (dest !== 'none') await requirePermission(FEATURE_ORIGINS[dest]);
        const article = await feishuReadArticle(source.url, setDukouStatus);
        await saveToLibrary(article);
        setDukouStatus(`已抓取飞书文档：《${article.title}》`);
        await openDestination(dest);
        break;
      }
      case 'feishu_write': {
        await requirePermission(FEATURE_ORIGINS.feishu);
        const id = articleId(msg.id);
        const article = (await chrome.storage.local.get('art_' + id))['art_' + id];
        validateArticle(article);
        if (!Array.isArray(msg.blocksSpec)) throw new Error('飞书内容块格式不正确');
        const url = await feishuWriteArticle(article, msg.blocksSpec, setDukouStatus);
        setDukouStatus(`已写入飞书：《${article.title}》\n${url}`);
        await chrome.tabs.create({ url, active: true });
        break;
      }
      case 'dukou_bridge_enabled': {
        if (typeof msg.enabled !== 'boolean') throw new Error('桥开关必须为布尔值');
        if (msg.enabled) await requirePermission(FEATURE_ORIGINS.bridge);
        await chrome.storage.local.set({ dukou_bridge_enabled: msg.enabled });
        await syncBridgeAlarm();
        if (msg.enabled) await pollBridge();
        break;
      }
      case 'bridge_poll': await pollBridge(); break;
      default: throw new Error(`未知稿件命令：${msg.cmd}`);
    }
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // An untrusted page must not be able to overwrite the user's status either.
    if (isDukouPage(sender) || await isExtractionSender(sender)) setDukouStatus(reason, true);
    return { ok: false, error: reason };
  }
}

async function syncBridgeAlarm(): Promise<void> {
  const { dukou_bridge_enabled } = await chrome.storage.local.get('dukou_bridge_enabled');
  const permitted = await chrome.permissions.contains({ origins: FEATURE_ORIGINS.bridge });
  if (dukou_bridge_enabled === true && permitted) await chrome.alarms.create(BRIDGE_ALARM, { periodInMinutes: 0.5 });
  else await chrome.alarms.clear(BRIDGE_ALARM);
}

interface PendingBridgeResult { taskId: string; result: Record<string, unknown> }
function serializeBridge<T>(write: () => Promise<T>): Promise<T> {
  const next = bridgeWrites.then(write);
  bridgeWrites = next.catch(() => {});
  return next;
}

async function flushBridgeResults(): Promise<boolean> {
  const { dukou_bridge_outbox = [] } = await chrome.storage.local.get<{ dukou_bridge_outbox?: PendingBridgeResult[] }>('dukou_bridge_outbox');
  let lostTask = false;
  for (let index = 0; index < dukou_bridge_outbox.length; index++) {
    const pending = dukou_bridge_outbox[index];
    try {
      const response = await fetch(BRIDGE + '/results', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: pending.taskId, ...pending.result }), signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        // A response can be lost after the server committed it. Avoid writing twice.
        const state = await (await fetch(BRIDGE + '/result?id=' + encodeURIComponent(pending.taskId), { signal: AbortSignal.timeout(5000) })).json();
        if (state.state === 'unknown') {
          lostTask = true;
          await chrome.storage.local.set({ dukou_bridge_outbox: dukou_bridge_outbox.slice(index + 1) });
          setDukouStatus(`本地桥已丢失任务 ${pending.taskId}（可能重启过），文章仍在文库，请重新提交 CLI 命令。`, true);
          continue;
        }
        if (!['done', 'error'].includes(state.state)) throw new Error(`HTTP ${response.status}`);
      }
      await chrome.storage.local.set({ dukou_bridge_outbox: dukou_bridge_outbox.slice(index + 1) });
    } catch (error) {
      setDukouStatus('本地桥结果回传失败，已保存待重试：' + (error instanceof Error ? error.message : String(error)), true);
      return false;
    }
  }
  if (dukou_bridge_outbox.length && !lostTask) setDukouStatus('已完成本地桥结果回传。');
  return true;
}

async function postBridgeResult(taskId: string, result: Record<string, unknown>): Promise<boolean> {
  return serializeBridge(async () => {
    const { dukou_bridge_outbox = [] } = await chrome.storage.local.get<{ dukou_bridge_outbox?: PendingBridgeResult[] }>('dukou_bridge_outbox');
    await chrome.storage.local.set({ dukou_bridge_outbox: [...dukou_bridge_outbox.filter((entry) => entry.taskId !== taskId), { taskId, result }] });
    return flushBridgeResults();
  });
}

async function handleBridgeTask(task: Record<string, unknown>): Promise<void> {
  if (typeof task.taskId !== 'string') throw new Error('桥任务缺少 taskId');
  const dest = destination(task.dest ?? 'none');
  if (task.type === 'import') {
    if (!task.article || typeof task.article !== 'object') throw new Error('桥任务缺少文章');
    const article = { ...task.article, sourceUrl: 'bridge', extractedAt: Date.now() };
    validateArticle(article);
    // Check the requested destination before consuming a task or arming autofill.
    if (dest !== 'none') await requirePermission(FEATURE_ORIGINS[dest]);
    await saveToLibrary(article);
    await openDestination(dest, article.id, task.autoFill === true);
    setDukouStatus(`渡口桥送来《${article.title}》，已入库。`);
    await postBridgeResult(task.taskId, { ok: true, note: '已入库' });
  } else if (task.type === 'export') {
    const { wx_current } = await chrome.storage.local.get('wx_current');
    const id = articleId(task.articleId || wx_current);
    const article = (await chrome.storage.local.get('art_' + id))['art_' + id];
    validateArticle(article);
    await postBridgeResult(task.taskId, { ok: true, article, saveTo: task.saveTo });
  } else if (task.type === 'fetch') {
    await startExtraction(task.url, 'none', { taskId: task.taskId, saveTo: typeof task.saveTo === 'string' ? task.saveTo : undefined });
  } else throw new Error(`未知桥任务类型：${String(task.type)}`);
}

export async function pollBridge(): Promise<void> {
  if (polling) return;
  const { dukou_bridge_enabled } = await chrome.storage.local.get('dukou_bridge_enabled');
  if (dukou_bridge_enabled !== true || !await chrome.permissions.contains({ origins: FEATURE_ORIGINS.bridge })) return;
  polling = true;
  try {
    await serializeBridge(flushBridgeResults);
    const response = await fetch(BRIDGE + '/tasks', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`渡口桥 HTTP ${response.status}`);
    const { tasks } = await response.json();
    if (!Array.isArray(tasks)) throw new Error('渡口桥任务响应格式不正确');
    for (const task of tasks) {
      try { await handleBridgeTask(task); }
      catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        setDukouStatus('桥任务失败：' + reason, true);
        if (typeof task.taskId === 'string') await postBridgeResult(task.taskId, { ok: false, error: reason });
      }
    }
  } catch (error) {
    setDukouStatus('渡口桥暂不可用：' + (error instanceof Error ? error.message : String(error)), true);
  } finally { polling = false; }
}

export function initDukou(): void {
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (!msg || typeof msg.cmd !== 'string' || !COMMANDS.has(msg.cmd)) return;
    void handleDukouMessage(msg, sender).then(respond);
    return true;
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === BRIDGE_ALARM) void pollBridge();
    if (alarm.name === EXTRACT_ALARM) void finishExtraction(undefined, '抓取超时（3分钟），请重新复制链接后重试。');
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    void currentJob().then((job) => {
      if (job?.tabId === tabId) return finishExtraction(undefined, '抓取页面已关闭，任务已取消。');
    });
  });
  const restore = async (): Promise<void> => {
    await syncDukouScripts();
    await syncBridgeAlarm();
    const job = await currentJob();
    if (job) {
      if (job.deadline <= Date.now()) await finishExtraction(undefined, '抓取任务已超时，请重试。');
      else { await chrome.alarms.create(EXTRACT_ALARM, { when: job.deadline }); void sendExtract(); }
    }
  };
  const refresh = (): void => { void restore().catch((error: Error) => setDukouStatus(error.message, true)); };
  chrome.runtime.onInstalled.addListener(refresh);
  chrome.runtime.onStartup.addListener(refresh);
  chrome.permissions.onRemoved.addListener(refresh);
  refresh();
}
