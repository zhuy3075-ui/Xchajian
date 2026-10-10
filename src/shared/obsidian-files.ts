import type { ObsidianTarget } from './obsidian';

export type VaultDirectory = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
};
export type VaultConnection = { rootPath: string; handle: VaultDirectory };
export const CONNECT_REQUIRED = '请先在插件设置中连接 Obsidian 仓库目录，允许写入后即可静默保存。';

export async function vaultConnection(value?: VaultConnection): Promise<VaultConnection | undefined> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('xclipper-obsidian-files', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('vault');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('vault', value ? 'readwrite' : 'readonly');
      const op = value ? tx.objectStore('vault').put(value, 'connection') : tx.objectStore('vault').get('connection');
      tx.oncomplete = () => { db.close(); resolve(value || op.result); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('无法保存目录连接')); };
    };
  });
}

export function noteSegments(target: ObsidianTarget, connection: VaultConnection): string[] {
  if (!target || typeof target.path !== 'string' || typeof target.vault !== 'string' || typeof target.absolute !== 'boolean') {
    throw new Error('无效的笔记保存路径');
  }
  let path = target.path.replace(/\\/g, '/');
  const root = connection.rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
  if (target.absolute) {
    const windows = /^[a-z]:\//i.test(root) || root.startsWith('//');
    const prefix = root + '/';
    if (!(windows ? path.toLowerCase().startsWith(prefix.toLowerCase()) : path.startsWith(prefix))) {
      throw new Error(`保存目录不在已连接的仓库内：${target.path}`);
    }
    path = path.slice(prefix.length);
  } else if (target.vault && target.vault !== connection.handle.name) {
    throw new Error(`保存仓库 ${target.vault} 与已连接仓库 ${connection.handle.name} 不一致`);
  }
  const segments = path.split('/');
  if (segments.some(s => !s || s.startsWith('.') || /[<>:"\\|?*\u0000-\u001f]/.test(s) || /[. ]$/.test(s) || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(s)) || !/\.md$/i.test(segments.at(-1)!)) {
    throw new Error(`无效的 Markdown 文件路径：${target.path}`);
  }
  return segments;
}

// Caller serializes extension writes. Keep existing notes and check for
// external changes before committing; the browser has no OS-wide file lock.
export async function writeVaultNote(connection: VaultConnection, target: ObsidianTarget, markdown: string): Promise<{ path: string; duplicate: boolean }> {
  if (typeof markdown !== 'string' || !markdown.trim() || markdown.length > 8_000_000) throw new Error('正文为空或超过 800 万字符限制');
  const segments = noteSegments(target, connection);
  if (typeof connection.handle.queryPermission !== 'function' || await connection.handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
    throw new Error(CONNECT_REQUIRED);
  }
  let directory: FileSystemDirectoryHandle = connection.handle;
  for (const segment of segments.slice(0, -1)) directory = await directory.getDirectoryHandle(segment, { create: true });
  const original = segments.at(-1)!;
  for (let n = 1; n <= 100; n++) {
    const name = n === 1 ? original : original.replace(/\.md$/i, ` (${n}).md`);
    const path = [...segments.slice(0, -1), name].join('/');
    try {
      const existing = await directory.getFileHandle(name);
      if (await (await existing.getFile()).text() === markdown) return { path, duplicate: true };
      continue;
    } catch (err) {
      if (!(err instanceof DOMException) || err.name !== 'NotFoundError') throw err;
    }
    const file = await directory.getFileHandle(name, { create: true });
    const stream = await file.createWritable({ mode: 'exclusive' } as FileSystemCreateWritableOptions);
    try {
      const before = await file.getFile();
      if (before.size) { await stream.abort(); continue; }
      await stream.write(markdown);
      const current = await file.getFile();
      if (current.size !== before.size || current.lastModified !== before.lastModified) {
        throw new Error('写入期间文件已被其他程序修改，已取消本次保存，请重试');
      }
      await stream.close();
    }
    catch (err) { await stream.abort().catch(() => {}); throw err; }
    // Reopen by name after commit: a successful close alone does not prove
    // that the expected body is readable from the destination file.
    try {
      const saved = await directory.getFileHandle(name);
      if (await (await saved.getFile()).text() !== markdown) throw new Error('文件内容与本次采集不一致');
    } catch (err) {
      throw new Error(`写入后校验失败（${path}）：${err instanceof Error ? err.message : String(err)}`);
    }
    return { path, duplicate: false };
  }
  throw new Error('同名笔记过多，请修改文件名后重试');
}

export async function saveObsidianNote(markdown: string, target: ObsidianTarget): Promise<{ path: string; duplicate: boolean }> {
  const response = await chrome.runtime.sendMessage({ action: 'XCLIPPER_OBSIDIAN_SAVE_FILE', markdown, target });
  if (!response?.ok || typeof response.path !== 'string') throw new Error(response?.error || '保存失败，未收到文件写入确认');
  return response;
}

export function openObsidianConnection(): void {
  void chrome.runtime.sendMessage({ action: 'XCLIPPER_OBSIDIAN_CONNECT' });
}
