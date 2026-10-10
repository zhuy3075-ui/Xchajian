// 微信文章页内容脚本：抓取标题/头图/正文（文字块+图片块，保持顺序）
// 数据直接写入 chrome.storage.local（图片转dataURL，量大不走message）

let extracting = false;
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.cmd !== 'extract') return;
  sendResponse({ ok: true });
  if (extracting) return;
  extracting = true;
  extract().catch((e) => {
    console.error('[wx2x] 抓取失败', e);
    chrome.runtime.sendMessage({ cmd: 'extract_failed', reason: e.message });
  }).finally(() => { extracting = false; });
  return true;
});

async function extract() {
  const content = await waitFor(() => document.querySelector('#js_content'), 15000);
  if (!content) throw new Error('找不到正文 #js_content，页面可能未正常加载（链接过期/需验证）');

  const title =
    document.querySelector('#activity-name')?.textContent.trim() ||
    document.querySelector('meta[property="og:title"]')?.content ||
    document.title;

  const author =
    document.querySelector('#js_name')?.textContent.trim() ||
    document.querySelector('meta[property="og:article:author"]')?.content || '';

  const coverUrl = document.querySelector('meta[property="og:image"]')?.content || '';

  // 1. 按顺序提取内容块
  const blocks = [];
  walkBlocks(content, blocks);

  // 2. 下载所有图片转dataURL（在页面上下文fetch，referer正确不会被防盗链拦）
  const imageBlocks = blocks.filter((b) => b.type === 'image');
  let done = 0;
  for (const b of imageBlocks) {
    try {
      b.dataUrl = await fetchAsDataUrl(b.src);
    } catch (e) {
      console.warn('[wx2x] 图片下载失败，跳过:', b.src, e);
      b.failed = true;
    }
    done++;
    chrome.storage.local.set({
      wx_status: { text: `正在下载图片 ${done}/${imageBlocks.length}…`, error: false },
    });
  }

  let coverDataUrl = '';
  if (coverUrl) {
    try { coverDataUrl = await fetchAsDataUrl(coverUrl); } catch (e) { console.warn('[wx2x] 头图下载失败', e); }
  }

  // 失败的图片块剔除src（不再需要），成功的也剔除省空间
  const finalBlocks = blocks
    .filter((b) => b.type !== 'image' || (b.dataUrl && !b.failed))
    .map((b) => (b.type === 'image' ? { type: 'image', dataUrl: b.dataUrl } : b));

  if (finalBlocks.length === 0) throw new Error('正文内容为空');

  // 入库：同一篇文章（biz/mid/idx相同）只保留最新一次抓取
  const id = articleId(title);
  const article = {
    id,
    title,
    author,
    coverDataUrl,
    blocks: finalBlocks,
    sourceUrl: location.href,
    extractedAt: Date.now(),
  };
  const result = await chrome.runtime.sendMessage({ cmd: 'extracted', article, skippedImages: imageBlocks.filter((b) => b.failed).length });
  if (!result?.ok) throw new Error(result?.error || '抓取入库失败');
}

// 文章唯一ID：优先用og:url里的 biz/mid/idx（同一篇文章不同链接形态也一致），兜底用标题hash
function articleId(title) {
  const ogUrl = document.querySelector('meta[property="og:url"]')?.content || '';
  try {
    const p = new URL(ogUrl).searchParams;
    const biz = p.get('__biz'), mid = p.get('mid'), idx = p.get('idx');
    if (biz && mid) return `${biz}_${mid}_${idx || 1}`.replace(/[^\w=]/g, '');
  } catch (e) { /* og:url缺失或不合法，走标题hash */ }
  const identity = location.href || title;
  let h = 0;
  for (let i = 0; i < identity.length; i++) h = (h * 31 + identity.charCodeAt(i)) >>> 0;
  return 'T' + h.toString(36);
}

// ---------- 内容块提取 ----------

const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'UL', 'OL', 'PRE', 'SECTION', 'DIV', 'FIGURE', 'TABLE']);

function walkBlocks(node, out) {
  for (const child of node.children) {
    const tag = child.tagName;

    if (tag === 'IMG') { pushImage(child, out); continue; }

    if (/^H[1-6]$/.test(tag)) {
      emitMixed(child, out, (html) => `<h2>${html}</h2>`);
      continue;
    }
    if (tag === 'BLOCKQUOTE') {
      emitMixed(child, out, (html) => `<blockquote>${html}</blockquote>`);
      continue;
    }
    if (tag === 'UL' || tag === 'OL') {
      const entries = [...child.querySelectorAll(':scope > li')];
      if (child.querySelector('img')) {
        entries.forEach((li, index) => emitMixed(li, out, (html) => tag === 'UL'
          ? `<ul><li>${html}</li></ul>` : `<p>${index + 1}. ${html}</p>`));
      } else {
        const items = entries.map((li) => `<li>${inlineHtml(li)}</li>`).join('');
        if (items) out.push({ type: 'html', html: `<${tag.toLowerCase()}>${items}</${tag.toLowerCase()}>` });
      }
      continue;
    }
    if (tag === 'PRE') {
      const code = child.textContent.replace(/ /g, ' ');
      if (code.trim()) out.push({ type: 'html', html: `<pre>${escapeHtml(code)}</pre>` });
      continue;
    }

    if (tag === 'P' || isLeafBlock(child)) {
      emitMixed(child, out, (html) => `<p>${html}</p>`);
      continue;
    }

    if (BLOCK_TAGS.has(tag)) { walkBlocks(child, out); continue; }

    // 其他行内元素直接作为段落兜底
    emitMixed(child, out, (html) => `<p>${html}</p>`);
  }
}

// 一个块里可能混着文字和图片：拆成 文字块/图片块 交替输出
function emitMixed(el, out, wrap) {
  const imgs = [...el.querySelectorAll('img')];
  if (imgs.length === 0) {
    const html = inlineHtml(el);
    // 纯空行/纯<br>的段落是微信排版的间距技巧，X里会变成多余空段，丢弃
    if (stripTags(html).trim()) out.push({ type: 'html', html: wrap(html) });
    return;
  }
  // 用占位符切分
  const MARKER = '\u0000IMG\u0000';
  const collected = [];
  const html = inlineHtml(el, null, (img) => { collected.push(img); return MARKER; });
  const parts = html.split(MARKER);
  parts.forEach((part, i) => {
    if (stripTags(part).trim()) out.push({ type: 'html', html: wrap(part) });
    if (i < collected.length) pushImage(collected[i], out);
  });
}

function pushImage(img, out) {
  const src = img.dataset.src || img.src;
  if (!src || src.startsWith('data:image/svg')) return;
  // 跳过装饰性小图（分割线、icon），宽高都小于50px的
  const w = parseInt(img.dataset.w || img.getAttribute('width') || img.naturalWidth || 0);
  if (w > 0 && w < 50) return;
  out.push({ type: 'image', src });
}

// 行内序列化：只保留 b/i/a/code/br，其他标签拆壳取内容
function inlineHtml(node, _unused, imgHandler) {
  let html = '';
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      html += escapeHtml(child.textContent);
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = child.tagName;
    if (tag === 'IMG') {
      if (imgHandler) html += imgHandler(child);
      continue;
    }
    if (tag === 'BR') { html += '<br>'; continue; }
    const inner = inlineHtml(child, null, imgHandler);
    if (tag === 'STRONG' || tag === 'B') html += `<b>${inner}</b>`;
    else if (tag === 'EM' || tag === 'I') html += `<i>${inner}</i>`;
    else if (tag === 'CODE') html += `<code>${inner}</code>`;
    else if (tag === 'A') {
      const href = child.getAttribute('href');
      html += href && href.startsWith('http') ? `<a href="${escapeHtml(href)}">${inner}</a>` : inner;
    }
    else if (tag === 'SUP' || tag === 'SUB') html += inner;
    else {
      // span等行内样式加粗：只认短强调句（≤40字符）。
      // 微信编辑器常给整段/外层容器加font-weight，照搬会导致大面积误加粗
      const fw = child.style?.fontWeight;
      const isBoldStyle = fw === 'bold' || parseInt(fw) >= 600;
      if (isBoldStyle && child.textContent.trim().length <= 40) html += `<b>${inner}</b>`;
      else html += inner;
    }
  }
  // 微信的 &nbsp; 占位转普通空格
  return html.replace(/ /g, ' ');
}

function isLeafBlock(el) {
  return !el.querySelector('p,h1,h2,h3,h4,h5,h6,blockquote,ul,ol,pre,section,div,figure,table');
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function stripTags(s) {
  return s.replace(/<br\s*\/?>/gi, '').replace(/<[^>]+>/g, '');
}

// ---------- 工具 ----------

async function fetchAsDataUrl(url) {
  const resp = await fetch(url, { credentials: 'omit' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

function waitFor(fn, timeout) {
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const result = fn();
      if (result || Date.now() - start > timeout) {
        clearInterval(timer);
        resolve(result || null);
      }
    }, 300);
  });
}
