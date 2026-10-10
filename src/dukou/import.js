import { buildFileIndex, lookupFile } from './local-files.js';
import { parseFrontmatter, mdToBlocks } from './markdown.js';
// 本地 md 导入：选 md(+图片) 或 整个文件夹 或 拖拽 → 解析 → 解析图片(图床抓取/本地匹配) → 入文库
// 浏览器铁律：只能读用户显式选中的文件，拿不到任意磁盘路径。所以本地图必须随 md 一起被选中
//（多选文件 或 选所在文件夹），否则无从读取——这种情况会明确列出未解析的图，不静默丢。

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const dirInput = document.getElementById('dir-input');
const logEl = document.getElementById('log');
const resultEl = document.getElementById('result');
const pickerEl = document.getElementById('md-picker');

document.getElementById('pick-files').addEventListener('click', () => fileInput.click());
document.getElementById('pick-dir').addEventListener('click', () => dirInput.click());
fileInput.addEventListener('change', () => handleFiles([...fileInput.files]));
dirInput.addEventListener('change', () => handleFiles([...dirInput.files]));

['dragenter', 'dragover'].forEach((ev) => dropzone.addEventListener(ev, (e) => {
  e.preventDefault(); dropzone.classList.add('over');
}));
['dragleave', 'drop'].forEach((ev) => dropzone.addEventListener(ev, (e) => {
  e.preventDefault(); dropzone.classList.remove('over');
}));
dropzone.addEventListener('drop', (e) => handleFiles([...e.dataTransfer.files]));

function log(text, cls = '') {
  const d = document.createElement('div');
  d.className = 'line ' + cls;
  d.textContent = text;
  logEl.appendChild(d);
  logEl.scrollTop = logEl.scrollHeight;
}

// ---------- 主流程 ----------

async function handleFiles(files) {
  logEl.innerHTML = '';
  resultEl.style.display = 'none';
  pickerEl.style.display = 'none';
  pickerEl.innerHTML = '';
  if (!files.length) return;

  const mdFiles = files.filter((f) => /\.(md|markdown)$/i.test(f.name));
  if (mdFiles.length === 0) { log('没找到 .md / .markdown 文件', 'err'); return; }

  const imageFiles = files.filter((f) => !/\.(md|markdown)$/i.test(f.name));
  const idx = buildFileIndex(imageFiles);

  // 只有一个 md：直接导。多个 md（常见于丢整个文件夹）：让用户勾选，别一股脑全导
  if (mdFiles.length === 1) {
    log(`选中 1 个 md、${imageFiles.length} 个图片素材`);
    await importMany(mdFiles, idx);
  } else {
    showMdPicker(mdFiles, imageFiles.length, idx);
  }
}

// 多 md 勾选：文件夹里常有 brief/调研/草稿 等多份，让用户挑要导哪些
function showMdPicker(mdFiles, imgCount, idx) {
  pickerEl.style.display = 'block';
  const rows = mdFiles.map((f, i) => {
    const label = (f.webkitRelativePath || f.name).replace(/\\/g, '/');
    const kb = Math.max(1, Math.round(f.size / 1024));
    // 默认勾选「草稿/初稿/稿」类，调研/审/brief 类默认不勾（多半不是要发的正文）
    const checked = /草稿|初稿|定稿|终稿|正文|文章/.test(label) ? ' checked' : '';
    return `<label class="md-row"><input type="checkbox" data-i="${i}"${checked}>`
      + `<span class="p">${escapeText(label)}</span><span class="s">${kb}KB</span></label>`;
  }).join('');
  pickerEl.innerHTML = `
    <div class="pk-head">这个文件夹里有 <b>${mdFiles.length}</b> 个 md，勾选要导入文库的（${imgCount} 个图片素材所有选中文章共用）</div>
    <div class="pk-list">${rows}</div>
    <div class="pk-actions">
      <button id="pk-all" class="ghost">全选</button>
      <button id="pk-none" class="ghost">清空</button>
      <button id="pk-go" class="primary">导入选中</button>
    </div>`;
  const boxes = [...pickerEl.querySelectorAll('input[type=checkbox]')];
  pickerEl.querySelector('#pk-all').onclick = () => boxes.forEach((b) => { b.checked = true; });
  pickerEl.querySelector('#pk-none').onclick = () => boxes.forEach((b) => { b.checked = false; });
  pickerEl.querySelector('#pk-go').onclick = async () => {
    const chosen = boxes.filter((b) => b.checked).map((b) => mdFiles[+b.dataset.i]);
    if (!chosen.length) { log('一篇都没勾，没导入', 'warn'); return; }
    pickerEl.style.display = 'none';
    log(`导入选中的 ${chosen.length} 篇…`);
    await importMany(chosen, idx);
  };
}

async function importMany(mdFiles, idx) {
  const done = [];
  for (const mf of mdFiles) {
    try { const r = await importOne(mf, idx); if (r) done.push(r); }
    catch (e) { log(`《${mf.name}》导入失败：${e.message}`, 'err'); }
  }
  if (done.length) showResultSummary(done);
}

async function importOne(mdFile, idx) {
  const raw = await readText(mdFile);
  const { meta, body } = parseFrontmatter(raw);
  const { title: h1Title, blocks } = mdToBlocks(body);
  const title = meta.title || h1Title || mdFile.name.replace(/\.(md|markdown)$/i, '');
  log(`\n开始导入《${title}》…`);

  // 解析所有图片块：图床→抓取，本地→从选中文件读，data→直用
  const { resolved, unresolved, localRewrites } = await resolveImages(blocks, idx, mdFile.webkitRelativePath || mdFile.name);

  // 头图（frontmatter cover）
  let coverDataUrl = '';
  if (meta.cover) {
    const c = await resolveOne(meta.cover, idx, mdFile.webkitRelativePath || mdFile.name);
    if (c.dataUrl) coverDataUrl = c.dataUrl;
    else log(`头图未解析：${meta.cover}`, 'warn');
  }

  // 排版器用的 markdown：把本地图引用替换成 dataURL（远程图保留URL，轻量且能预览）
  let markdown = body;
  for (const [ref, dataUrl] of localRewrites) markdown = markdown.split('](' + ref + ')').join('](' + dataUrl + ')');

  const article = {
    id: 'lc_' + hash(mdFile.webkitRelativePath || mdFile.name),
    title,
    author: meta.author || '本地导入',
    coverDataUrl,
    blocks: resolved,
    markdown,
    sourceUrl: 'local',
    extractedAt: Date.now(),
  };
  await saveToLibrary(article);

  const imgN = resolved.filter((b) => b.type === 'image').length;
  log(`✓《${title}》已入文库：${resolved.filter((b) => b.type === 'html').length} 段 + ${imgN} 张图${coverDataUrl ? ' + 头图' : ''}`, 'ok');
  if (unresolved.length) {
    log(`⚠ ${unresolved.length} 张图没解析（本地图请连同 md 一起选中，或改用图床链接）：`, 'warn');
    unresolved.forEach((u) => log('   · ' + u, 'warn'));
  }
  return { title, imgN, unresolvedN: unresolved.length };
}

function showResultSummary(items) {
  resultEl.style.display = 'block';
  const totalUnres = items.reduce((s, x) => s + x.unresolvedN, 0);
  const list = items.map((x) => `《${escapeText(x.title)}》(${x.imgN}图${x.unresolvedN ? `，${x.unresolvedN}未解析` : ''})`).join('、');
  resultEl.innerHTML = `已导入 <b>${items.length}</b> 篇：${list}。`
    + `${totalUnres ? `共 ${totalUnres} 张图未解析（本地图需连同 md 一起选中）。` : ''}`
    + `回到渡口插件「文库」，用「渡到 X / B站 / 排版器」按钮即可发出。`;
}

// ---------- 图片解析 ----------

async function resolveImages(blocks, idx, markdownPath) {
  const resolved = [];
  const unresolved = [];
  const localRewrites = []; // [原始ref, dataUrl]，用于重写排版器markdown
  for (const b of blocks) {
    if (b.type !== 'image') { resolved.push(b); continue; }
    const r = await resolveOne(b.ref, idx, markdownPath);
    if (r.dataUrl) {
      resolved.push({ type: 'image', dataUrl: r.dataUrl });
      if (r.local) localRewrites.push([b.ref, r.dataUrl]);
    } else {
      unresolved.push(b.ref + (r.error ? `（${r.error}）` : ''));
    }
  }
  return { resolved, unresolved, localRewrites };
}

// 单个图片引用 → {dataUrl, local?, error?}
async function resolveOne(ref, idx, markdownPath) {
  try {
    if (/^data:/i.test(ref)) return { dataUrl: ref };
    if (/^https?:\/\//i.test(ref)) {
      log(`抓取图床图：${shorten(ref)}`);
      return { dataUrl: await fetchToDataUrl(ref) };
    }
    const f = lookupFile(idx, ref, markdownPath);
    if (f) { log(`读取本地图：${ref}`); return { dataUrl: await readDataUrl(f), local: true }; }
    return { error: '本地文件未选中' };
  } catch (e) {
    return { error: e.message };
  }
}

async function fetchToDataUrl(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob = await resp.blob();
    if (!/^image\//.test(blob.type)) throw new Error('非图片：' + (blob.type || '未知'));
    return await blobToDataUrl(blob);
  } finally { clearTimeout(timer); }
}

// ---------- 选中文件索引 / 路径匹配 ----------

// ---------- 入库（与 background.saveToLibrary 同形） ----------

async function saveToLibrary(article) {
  const response = await chrome.runtime.sendMessage({ cmd: 'save_article', article });
  if (!response?.ok) throw new Error(response?.error || '文章入库失败');
}

// ---------- md 解析（与 CLI dukou.js 同一词汇表，图片只记ref不在此解析） ----------

// ---------- 工具 ----------

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function readText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error('读取失败'));
    r.readAsText(file);
  });
}

function readDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error('读取失败'));
    r.readAsDataURL(file);
  });
}

function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error('转码失败'));
    r.readAsDataURL(blob);
  });
}

function shorten(url) { return url.length > 60 ? url.slice(0, 57) + '…' : url; }

function escapeText(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

document.getElementById('grant-images').addEventListener('click', async () => {
  try {
    const url = new URL(document.getElementById('image-host').value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.hostname === 'localhost' ||
        /^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^\[/.test(url.hostname)) {
      throw new Error('请输入公网 HTTPS 图片域名');
    }
    const ok = await chrome.permissions.request({ origins: [url.origin + '/*'] });
    log(ok ? '已授权图片域名：' + url.origin : '未授权图片域名', ok ? 'ok' : 'warn');
  } catch (error) { log(error.message, 'err'); }
});
