export function parseFrontmatter(raw) {
  raw = raw.replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+)\s*:\s*(.+)$/);
    if (kv) meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { meta, body: raw.slice(m[0].length) };
}

export function mdToBlocks(md) {
  const blocks = [];
  let title = '';
  const lines = md.split(/\r?\n/);
  let i = 0;
  const para = [];
  const flushPara = () => {
    if (!para.length) return;
    blocks.push({ type: 'html', html: `<p>${para.map(inlineToHtml).join('<br>')}</p>` });
    para.length = 0;
  };
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { flushPara(); i++; continue; }
    if (line.startsWith('```')) {
      flushPara(); const code = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++;
      if (code.join('').trim()) blocks.push({ type: 'html', html: `<pre>${escapeHtml(code.join('\n'))}</pre>` });
      continue;
    }
    const img = line.match(/^!\[[^\]]*\]\(([^)]+)\)\s*$/);
    if (img) { flushPara(); blocks.push({ type: 'image', ref: img[1] }); i++; continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      if (h[1] === '#' && !title) title = h[2].trim();
      else blocks.push({ type: 'html', html: `<h2>${inlineToHtml(h[2])}</h2>` });
      i++; continue;
    }
    if (/^>\s?/.test(line)) {
      flushPara(); const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push({ type: 'html', html: `<blockquote>${quote.map(inlineToHtml).join('<br>')}</blockquote>` });
      continue;
    }
    const isUl = (l) => /^[-*]\s+/.test(l);
    const isOl = (l) => /^\d+\.\s+/.test(l);
    if (isUl(line) || isOl(line)) {
      flushPara();
      const tag = isUl(line) ? 'ul' : 'ol';
      const test = isUl(line) ? isUl : isOl;
      const items = [];
      while (i < lines.length && test(lines[i])) items.push(lines[i++].replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''));
      blocks.push({ type: 'html', html: `<${tag}>${items.map((t) => `<li>${inlineToHtml(t)}</li>`).join('')}</${tag}>` });
      continue;
    }
    if (/^(---+|\*\*\*+)\s*$/.test(line)) { flushPara(); i++; continue; }
    para.push(line); i++;
  }
  flushPara();
  return { title, blocks };
}

function inlineToHtml(s) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

