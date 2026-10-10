import { vaultConnection, type VaultDirectory } from '../shared/obsidian-files';
import { resolveObsidianTarget } from '../shared/obsidian';

const path = document.querySelector<HTMLInputElement>('#vault-path')!;
const status = document.querySelector<HTMLElement>('#status')!;
const connect = document.querySelector<HTMLButtonElement>('#connect')!;
const picker = (window as unknown as { showDirectoryPicker?: (options: { mode: 'readwrite'; id: string }) => Promise<VaultDirectory> }).showDirectoryPicker;
if (!picker) {
  connect.disabled = true;
  status.textContent = '当前浏览器不支持目录授权。请使用 Chrome 或 Edge；不会自动唤起 Obsidian。';
} else {
  void vaultConnection().then(value => { if (value) { path.value = value.rootPath; status.textContent = `已连接：${value.rootPath}。如授权过期，请重新选择同一目录。`; } }).catch(err => { status.textContent = String(err); });
}
connect.addEventListener('click', async () => {
  connect.disabled = true;
  try {
    const target = resolveObsidianTarget('check.md', { obsidianFolder: path.value, obsidianVault: '', obsidianGroupByAuthor: false }, '');
    if (!target.absolute) throw new Error('请填写仓库的完整路径');
    const rootPath = target.path.slice(0, -'/check.md'.length);
    const handle = await picker!.call(window, { mode: 'readwrite', id: 'xclipper-obsidian-vault' });
    if (handle.name !== rootPath.split('/').at(-1)) throw new Error('所选文件夹名称与路径不一致，请选择仓库根目录');
    // Validate that this is an initialized vault without reading its files.
    await handle.getDirectoryHandle('.obsidian');
    if (await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('尚未获得目录写入授权');
    await vaultConnection({ rootPath, handle });
    status.textContent = '连接成功。返回 X 页面，重新点击保存即可。后续保存不打开 Obsidian、不使用剪贴板。';
  } catch (err) {
    status.textContent = err instanceof DOMException && err.name === 'AbortError'
      ? '已取消选择，原有连接保持不变。'
      : `连接失败：${err instanceof Error ? err.message : String(err)}`;
  } finally { connect.disabled = false; }
});
