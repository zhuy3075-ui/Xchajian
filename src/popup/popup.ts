// The popup owns preferences and connections; content actions live on X.
import { applyI18n } from './i18n';
import { initSettingsForm } from './settings-form';
import { initModeTabs } from './mode';
import { initFastBatchUi, setStandardJobActive } from './fast-batch-ui';
import { initLensSettings } from './lens-settings';
import { initSettingsNavigation } from './navigation';
import { openObsidianConnection } from '../shared/obsidian-files';

applyI18n();
initFastBatchUi();
initSettingsForm();
initModeTabs();
initSettingsNavigation();
void initLensSettings();
document.getElementById('footer-version')!.textContent = 'v' + chrome.runtime.getManifest().version;
document.getElementById('btn-connect-obsidian')!.onclick = openObsidianConnection;
async function refreshJobState() {
  try {
    const [standard, fast] = await Promise.all([
      chrome.runtime.sendMessage({ action: 'BATCH_STATUS' }),
      chrome.runtime.sendMessage({ action: 'FAST_BATCH_STATUS' }),
    ]);
    setStandardJobActive(['running', 'paused'].includes(standard?.job?.status) || fast?.progress?.status === 'running');
  } catch { setStandardJobActive(true); } // Keep engine changes locked while status is unavailable.
}
void refreshJobState();
chrome.storage.onChanged.addListener(() => { void refreshJobState(); });
