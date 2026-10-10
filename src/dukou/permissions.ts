export const FEATURE_ORIGINS = {
  wechat: ['https://mp.weixin.qq.com/*', 'https://*.qpic.cn/*'],
  x: ['https://x.com/*', 'https://twitter.com/*'],
  bili: ['https://member.bilibili.com/*'],
  editor: ['https://editor.huasheng.ai/*'],
  feishu: ['https://open.feishu.cn/*', 'https://*.feishu.cn/*', 'https://*.feishucdn.com/*', 'https://*.larksuitecdn.com/*'],
  bridge: ['http://127.0.0.1/*'],
};
export type DukouFeature = keyof typeof FEATURE_ORIGINS;

const SCRIPTS: chrome.scripting.RegisteredContentScript[] = [
  { id: 'dukou-wechat', matches: ['https://mp.weixin.qq.com/s*'], js: ['dukou/wechat-extract.js'], runAt: 'document_idle' },
  { id: 'dukou-x', matches: FEATURE_ORIGINS.x, js: ['dukou/x-adapter.js', 'dukou/fill-common.js'], runAt: 'document_idle' },
  { id: 'dukou-bili', matches: FEATURE_ORIGINS.bili, js: ['dukou/bili-adapter.js', 'dukou/fill-common.js'], runAt: 'document_idle', allFrames: true },
  { id: 'dukou-editor', matches: FEATURE_ORIGINS.editor, js: ['dukou/huasheng-adapter.js', 'dukou/fill-common.js'], runAt: 'document_idle' },
];

export async function syncDukouScripts(): Promise<void> {
  if (!chrome.scripting || !await chrome.permissions.contains({ permissions: ['scripting'] })) return;
  const registered = await chrome.scripting.getRegisteredContentScripts();
  for (const script of SCRIPTS) {
    const present = registered.some((item) => item.id === script.id);
    const permitted = await chrome.permissions.contains({ origins: script.matches });
    if (permitted && !present) await chrome.scripting.registerContentScripts([script]);
    if (!permitted && present) await chrome.scripting.unregisterContentScripts({ ids: [script.id] });
  }
}

// Called directly from a click handler, before any asynchronous work, so Chrome keeps the user gesture.
export async function requestFeature(feature: DukouFeature, dest = 'none'): Promise<void> {
  const origins = [...FEATURE_ORIGINS[feature]];
  if (dest in FEATURE_ORIGINS) origins.push(...FEATURE_ORIGINS[dest as DukouFeature]);
  const needsScript = ['wechat', 'x', 'bili', 'editor'].includes(feature) || ['x', 'bili', 'editor'].includes(dest);
  const granted = await chrome.permissions.request({
    origins: [...new Set(origins)],
    permissions: needsScript ? ['scripting'] : [],
  });
  if (!granted) throw new Error('尚未授权此功能需要的网站访问');
  const response = await chrome.runtime.sendMessage({ cmd: 'dukou_sync_scripts' });
  if (!response?.ok) throw new Error(response?.error || '稿件脚本注册失败');
}
