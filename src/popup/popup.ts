// The popup owns preferences and connections; content actions live on X.
import { applyI18n } from './i18n';
import { initSettingsForm } from './settings-form';
import { initModeTabs } from './mode';
import { initFastBatchUi, setStandardJobActive } from './fast-batch-ui';
import { initLensSettings } from './lens-settings';
import { loadSettings } from '../shared/settings';
import { vaultConnection, openObsidianConnection } from '../shared/obsidian-files';

applyI18n();
initFastBatchUi();
initSettingsForm();
initModeTabs();
void initLensSettings();
document.getElementById('footer-version')!.textContent = 'v' + chrome.runtime.getManifest().version;
document.getElementById('btn-connect-obsidian')!.onclick = openObsidianConnection;
if (location.hash === '#lens') {
  const section = document.getElementById('lens-settings') as HTMLDetailsElement;
  section.open = true; section.scrollIntoView({ block: 'start' });
}
const refreshButton = document.getElementById('btn-refresh-page-tools') as HTMLButtonElement;
const refreshWarning = document.getElementById('page-refresh-warning')!;
refreshButton.onclick = async () => {
  const state = document.getElementById('page-tools-status')!;
  refreshButton.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith('https://x.com/')) throw new Error('请先切换到需要更新的 X 页面。');
    await chrome.tabs.reload(tab.id);
    refreshButton.hidden = refreshWarning.hidden = true;
    state.textContent = 'X 页面正在刷新，加载完成后即可使用新的位置和下载设置。';
  } catch (err) { state.textContent = '刷新失败：' + String(err); }
  finally { refreshButton.disabled = false; }
};
async function refreshStatus() {
  const state = document.getElementById('page-tools-status')!;
  let needsRefresh = false;
  try {
    const settings = await loadSettings();
    if (!settings.showInlineButton) state.textContent = '页面工具已关闭，可在下方重新开启。';
    else {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url?.startsWith('https://x.com/')) state.textContent = '设置已保存；打开 X 页面即可使用页面工具。';
      else {
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'XCLIPPER_PAGE_TOOLS_STATUS' }, { frameId: 0 });
          needsRefresh = response?.controlsVersion !== 2;
          if (needsRefresh) state.textContent = '当前 X 页面仍在使用旧版控件。位置与默认格式已保存，刷新后生效。';
          else state.textContent = response?.enabled
            ? `页面工具已启用，当前位于${response.side === 'left' ? '左侧' : '右侧'}。`
            : '页面工具正在同步设置。';
        } catch {
          needsRefresh = true;
          state.textContent = '当前 X 页面未连接新版工具。位置与默认格式已保存，请刷新页面后使用。';
        }
      }
    }
    const [standard, fast] = await Promise.all([
      chrome.runtime.sendMessage({ action: 'BATCH_STATUS' }),
      chrome.runtime.sendMessage({ action: 'FAST_BATCH_STATUS' }),
    ]);
    const running = ['running', 'paused'].includes(standard?.job?.status) || fast?.progress?.status === 'running';
    setStandardJobActive(running);
    if (running) state.textContent += ' 批量任务进行中，请在页面采集工具查看。';
  } catch (err) { state.textContent = '无法读取状态：' + String(err); }
  refreshButton.hidden = refreshWarning.hidden = !needsRefresh;
  const vault = document.getElementById('vault-status')!;
  try {
    const connection = await vaultConnection();
    if (!connection) vault.textContent = 'Obsidian：未连接，请在下方连接仓库。';
    else {
      const granted = await connection.handle.queryPermission({ mode: 'readwrite' });
      vault.textContent = 'Obsidian：' + connection.handle.name + (granted === 'granted' ? ' · 已获得写入权限' : ' · 请重新授权');
    }
  } catch { vault.textContent = 'Obsidian：连接状态无法读取，请重新连接。'; }
}
void refreshStatus();
chrome.storage.onChanged.addListener(() => { void refreshStatus(); });
