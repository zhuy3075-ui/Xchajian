import { SETTINGS_KEY, HISTORY_KEY, mergeSettings } from './model';
import { tags, fmt, tier } from './parse';
let settings = mergeSettings();
const status = document.getElementById('save-status');
let queue = Promise.resolve();
function paint() {
  document.querySelectorAll('[data-key]').forEach(el => {
    const value = settings[el.dataset.key];
    if (el.type === 'checkbox') el.checked = value; else el.value = String(value);
  });
  document.querySelectorAll('[data-tag]').forEach(el => { el.checked = settings.tags[el.dataset.tag]; });
  document.getElementById('lens-controls').disabled = !settings.enabled;
  document.getElementById('enabled-state').textContent = settings.enabled ? '已开启 · 刷新已打开的 X 页面即可开始使用' : '已关闭 · 页面徽标与历史采样均已停止';
  const preview = document.getElementById('badge-preview'); preview.replaceChildren();
  if (!settings.enabled) { preview.textContent = '浏览增强已关闭'; return; }
  const user = { followers: 12600, following: 420, followedBy: true, iFollow: true, createdAt: '2015-01-01' };
  const badge = document.createElement('span'); badge.className = 'xcl-lens-badge';
  const count = document.createElement('span'); count.className = 'xcl-lens-main' + (settings.tierColors ? ' t' + tier(user.followers) : ''); count.textContent = fmt(user.followers) + ' 粉丝'; badge.append(count);
  if (settings.showRatio) { const ratio = document.createElement('span'); ratio.className = 'xcl-lens-ratio'; ratio.textContent = '比 30'; badge.append(ratio); }
  for (const tag of tags(user, { views: 12000, interactions: 440 }, Date.now(), settings).slice(0, settings.maxTags)) {
    const el = document.createElement('span'); el.className = 'xcl-lens-tag ' + tag.cls; el.textContent = tag.text; badge.append(el);
  }
  preview.append(badge);
  document.getElementById('preview-caption').textContent = '当前布局：' + ({ auto: '自动适应空间', inline: '与名字同行', below: '独立一行' }[settings.layout]) + '。此处为示例，实际位置随 X 页面空间调整。';
}
async function historyCount() {
  const stored = await chrome.storage.local.get(HISTORY_KEY);
  const count = Object.keys(stored[HISTORY_KEY] || {}).length;
  document.getElementById('history-count').textContent = `本机已记录 ${count} 个账号`;
  document.getElementById('clear-history').disabled = count === 0;
}
document.addEventListener('change', event => {
  const el = event.target;
  if (!el.dataset.key && !el.dataset.tag) return;
  const key = el.dataset.key, tag = el.dataset.tag;
  const value = el.type === 'checkbox' ? el.checked : key === 'maxTags' ? Number(el.value) : el.value;
  status.textContent = '正在保存…';
  queue = queue.then(async () => {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    settings = mergeSettings(stored[SETTINGS_KEY]);
    if (tag) settings.tags[tag] = value; else settings[key] = value;
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    paint(); status.textContent = '已保存 · 已打开的 X 页面会同步更新';
  }).catch(error => { status.textContent = '保存失败：' + error.message; });
});
document.getElementById('clear-history').addEventListener('click', async () => {
  if (!confirm('清空所有本地粉丝历史？此操作不可撤销。开启记录时，后续浏览会重新采样。')) return;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'LENS_CLEAR' });
    if (!result?.ok) throw new Error(result?.error || '清空失败');
    await historyCount(); status.textContent = '已清空历史记录';
  } catch (error) { status.textContent = error.message; }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[SETTINGS_KEY]) { settings = mergeSettings(changes[SETTINGS_KEY].newValue); paint(); }
  if (changes[HISTORY_KEY]) void historyCount().catch(error => { status.textContent = error.message; });
});
async function init() {
  document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  settings = mergeSettings(stored[SETTINGS_KEY]); paint(); await historyCount();
  status.textContent = '设置自动保存在当前浏览器';
}
void init().catch(error => { status.textContent = '加载失败：' + error.message; });
