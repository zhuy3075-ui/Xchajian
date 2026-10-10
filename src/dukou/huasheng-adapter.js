// 公众号排版器 站点适配器（editor.huasheng.ai）
// 与X/B站不同：左侧是单个 <textarea class="markdown-input">，吃 raw markdown
// 所以走 fill-common 的自定义填充旁路（ADAPTER.fill），不跑「填标题→粘正文→插图」富文本流程
// 图片策略：优先用 article.markdown（CLI送来的原始md，远程图URL原样保留，排版器预览直接显示）；
//          文库里抓取来的文章没有markdown，则用blocks重建（本地图以dataUrl内联，体积大但能预览）

window.WX2X = {
  key: 'editor',
  siteName: '公众号排版器',
  hint: '确认这是 editor.huasheng.ai 排版器页面（左侧有 Markdown 输入区），再点「填入」。',

  findTitleField() { return null; }, // 排版器无独立标题框，标题作为 # 一级标题进正文

  findBodyEditor() {
    return document.querySelector('textarea.markdown-input')
      || document.querySelector('textarea[placeholder*="Markdown"]')
      || document.querySelector('textarea[placeholder*="markdown"]')
      || document.querySelector('textarea');
  },

  // 自定义填充：把整篇markdown一次性灌进textarea，触发input让排版器右侧预览刷新
  async fill(article) {
    progress('正在定位 Markdown 输入区…');
    const ta = await waitFor(() => this.findBodyEditor(), 8000);
    if (!ta) throw new Error('没找到 Markdown 输入框。' + this.hint);

    const md = (article.markdown && article.markdown.trim())
      ? article.markdown
      : blocksToMarkdown(article);

    progress('灌入 Markdown…', 0.4);
    ta.focus();
    // React受控textarea：必须用原生setter改value再派发input，否则框架不认
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, md);
    ta.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await sleep(500);

    if (ta.value.length === 0) throw new Error('填入后内容为空，请刷新页面重试');

    const localImg = (article.blocks || []).filter((b) => b.type === 'image').length;
    const usedRaw = !!(article.markdown && article.markdown.trim());
    const imgNote = usedRaw
      ? '；图片按原文链接渲染'
      : (localImg ? `；${localImg}张本地图已内联，复制到公众号前可在排版器里重传` : '');
    progress(`已渡达：Markdown 已填入左侧，右侧预览即时更新${imgNote}。检查无误后点排版器的「复制到公众号」`, 1);
  },
};

// ---------- 没有原始markdown时，用文章库的blocks重建markdown ----------

function blocksToMarkdown(article) {
  let md = `# ${article.title}\n\n`;
  for (const b of article.blocks || []) {
    if (b.type === 'image') { md += `![](${b.dataUrl})\n\n`; continue; }
    md += htmlBlockToMd(b.html) + '\n\n';
  }
  return md.trim() + '\n';
}

// 单个简化HTML块（p/h2/blockquote/pre/ul/ol + 行内b/i/code/a/br）→ markdown
function htmlBlockToMd(html) {
  const el = new DOMParser().parseFromString(html, 'text/html').body.firstElementChild;
  if (!el) return '';
  const tag = el.tagName;
  if (tag === 'H2') return '## ' + inlineMd(el);
  if (tag === 'BLOCKQUOTE') return inlineMd(el).split('\n').map((l) => '> ' + l).join('\n');
  if (tag === 'PRE') return '```\n' + el.textContent + '\n```';
  if (tag === 'UL') return [...el.children].map((li) => '- ' + inlineMd(li)).join('\n');
  if (tag === 'OL') return [...el.children].map((li, i) => `${i + 1}. ` + inlineMd(li)).join('\n');
  return inlineMd(el);
}

function inlineMd(node) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) { out += child.textContent; continue; }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = child.tagName;
    const inner = inlineMd(child);
    if (tag === 'B' || tag === 'STRONG') out += `**${inner}**`;
    else if (tag === 'I' || tag === 'EM') out += `*${inner}*`;
    else if (tag === 'CODE') out += '`' + inner + '`';
    else if (tag === 'A') out += `[${inner}](${child.getAttribute('href') || ''})`;
    else if (tag === 'BR') out += '\n';
    else out += inner;
  }
  return out;
}
