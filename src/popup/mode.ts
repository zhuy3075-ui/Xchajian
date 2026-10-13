// Tier-1 export mode: Single ↔ Batch. The selection is remembered across
// popup opens, and batch-ui forces Batch when it finds a job already running
// so reopening the popup mid-job lands on the progress, not on Single.

import { syncBatchControls } from './settings-form';
import { syncFastBatchMode } from './fast-batch-ui';

const MODE_KEY = 'lastExportMode';

const tabSingle = document.getElementById('tab-mode-single');
const tabBatch = document.getElementById('tab-mode-batch');
const settingsSingle = document.getElementById('settings-mode-single');
const settingsBatch = document.getElementById('settings-mode-batch');
const panelSingle = document.getElementById('panel-single');
const panelBatch = document.getElementById('batch-section');
// Batch-only settings ride with the active export mode, even on the settings page.
const batchFormatControls = document.getElementById('batch-format-controls');
let modeRevision = 0;

export function setExportMode(single: boolean, persist = true): void {
  modeRevision++;
  tabSingle?.classList.toggle('active', single);
  tabBatch?.classList.toggle('active', !single);
  tabSingle?.setAttribute('aria-selected', String(single));
  tabBatch?.setAttribute('aria-selected', String(!single));
  settingsSingle?.classList.toggle('active', single);
  settingsBatch?.classList.toggle('active', !single);
  settingsSingle?.setAttribute('aria-pressed', String(single));
  settingsBatch?.setAttribute('aria-pressed', String(!single));
  panelSingle?.classList.toggle('hidden', !single);
  panelBatch?.classList.toggle('hidden', single);
  batchFormatControls?.classList.toggle('hidden', single);
  // Fast Batch bar + red glow ride with the mode too (batch-only).
  syncFastBatchMode(single);
  // The format-gated toggle disabling depends on mode, so re-sync after the
  // batch controls' visibility flips.
  syncBatchControls();
  if (persist) chrome.storage.local.set({ [MODE_KEY]: single ? 'single' : 'batch' });
}

export function initModeTabs(): void {
  tabSingle?.addEventListener('click', () => setExportMode(true));
  tabBatch?.addEventListener('click', () => setExportMode(false));
  settingsSingle?.addEventListener('click', () => setExportMode(true));
  settingsBatch?.addEventListener('click', () => setExportMode(false));
  const restoreRevision = modeRevision;
  chrome.storage.local.get(MODE_KEY, (res) => {
    // A running job or a user click takes precedence over a late storage read.
    if (modeRevision === restoreRevision) setExportMode(res[MODE_KEY] !== 'batch', false);
  });
}
