import { SETTINGS_KEY, HISTORY_KEY, mergeSettings } from '../lens/model';

// The embedded form keeps the original lens keys; export settings never write them.
export async function initLensSettings(): Promise<void> {
  const section = document.getElementById('lens-settings')!;
  const form = section.querySelector<HTMLFieldSetElement>('#lens-form')!;
  const controls = section.querySelector<HTMLFieldSetElement>('#lens-controls')!;
  const status = section.querySelector<HTMLElement>('#lens-save-status')!;
  const clearButton = section.querySelector<HTMLButtonElement>('#lens-clear-history')!;
  const inputs = section.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-lens-key]');
  const tags = section.querySelectorAll<HTMLInputElement>('[data-lens-tag]');
  let settings = mergeSettings();
  let queue = Promise.resolve();
  let clearing = false;

  function paint(): void {
    for (const input of inputs) {
      const value = settings[input.dataset.lensKey as keyof typeof settings];
      if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = value === true;
      else input.value = String(value);
    }
    for (const input of tags) input.checked = settings.tags[input.dataset.lensTag as keyof typeof settings.tags];
    controls.disabled = !settings.enabled;
    section.querySelector('#lens-enabled-state')!.textContent = settings.enabled
      ? '已开启 · 已打开的 X 页面会同步更新'
      : '已关闭 · 页面徽标与历史采样均已停止';
  }

  async function historyCount(): Promise<void> {
    const stored = await chrome.storage.local.get(HISTORY_KEY);
    const count = Object.keys(stored[HISTORY_KEY] || {}).length;
    section.querySelector('#lens-history-count')!.textContent = `本机已记录 ${count} 个账号`;
    clearButton.disabled = clearing || count === 0;
  }

  section.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) return;
    const key = input.dataset.lensKey, tag = input.dataset.lensTag;
    if (!key && !tag) return;
    const value = input instanceof HTMLInputElement && input.type === 'checkbox'
      ? input.checked : key === 'maxTags' ? Number(input.value) : input.value;
    status.textContent = '正在保存…';
    queue = queue.then(async () => {
      const stored = await chrome.storage.local.get(SETTINGS_KEY);
      const current = mergeSettings(stored[SETTINGS_KEY]);
      const next = mergeSettings(tag
        ? { ...current, tags: { ...current.tags, [tag]: value } }
        : { ...current, [key!]: value });
      await chrome.storage.local.set({ [SETTINGS_KEY]: next });
      settings = next;
      paint();
      status.textContent = '已保存 · 已打开的 X 页面会同步更新';
    }).catch((error: unknown) => {
      paint();
      status.textContent = `保存失败：${String(error)}`;
    });
  });

  clearButton.addEventListener('click', async () => {
    if (clearing || !confirm('清空所有本地粉丝历史？此操作不可撤销。开启记录时，后续浏览会重新采样。')) return;
    clearing = true;
    clearButton.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({ type: 'LENS_CLEAR' });
      if (!result?.ok) throw new Error(result?.error || '清空失败');
      status.textContent = '已清空历史记录';
    } catch (error) { status.textContent = `清空失败：${String(error)}`; }
    finally {
      clearing = false;
      await historyCount().catch(error => { status.textContent = `读取历史失败：${String(error)}`; });
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[SETTINGS_KEY]) { settings = mergeSettings(changes[SETTINGS_KEY].newValue); paint(); }
    if (changes[HISTORY_KEY]) void historyCount().catch(error => { status.textContent = `读取历史失败：${String(error)}`; });
  });
  try {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    settings = mergeSettings(stored[SETTINGS_KEY]);
    paint();
    await historyCount();
    form.disabled = false;
    status.textContent = '设置自动保存在当前浏览器';
  } catch (error) { status.textContent = `加载失败：${String(error)}`; }
}
