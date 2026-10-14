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
async function refreshStatus() {
  const state = document.getElementById('page-tools-status')!;
  try {
    const settings = await loadSettings();
    if (!settings.showInlineButton) state.textContent = '页面工具已关闭，可在下方重新开启。';
    else {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url?.startsWith('https://x.com/')) state.textContent = '设置已保存；打开 X 页面即可使用页面工具。';
      else {
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'XCLIPPER_PAGE_TOOLS_STATUS' }, { frameId: 0 });
          state.textContent = response?.enabled ? '页面工具已启用。' : '请刷新 X 页面以加载页面工具。';
        } catch { state.textContent = '请刷新 X 页面以加载新版页面工具。'; }
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
