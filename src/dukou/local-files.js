// Resolve only explicitly selected files. No disk access or absolute-path reads.
function normalizePath(value) {
  const parts = [];
  for (const part of value.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

export function buildFileIndex(files) {
  const byRel = new Map();
  for (const file of files) byRel.set(normalizePath(file.webkitRelativePath || file.name), file);
  return { byRel };
}

export function lookupFile(index, raw, markdownPath = '') {
  let ref = raw;
  try { ref = decodeURIComponent(ref); } catch { /* Use the literal selected filename. */ }
  ref = ref.replace(/\\/g, '/');
  const parent = markdownPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
  const relative = normalizePath(parent + '/' + ref);
  if (index.byRel.has(relative)) return index.byRel.get(relative);
  const direct = normalizePath(ref);
  if (index.byRel.has(direct)) return index.byRel.get(direct);
  const matches = [...index.byRel.entries()].filter(([path]) => path.endsWith('/' + direct) || path.split('/').pop() === direct.split('/').pop());
  if (matches.length > 1) throw new Error(`图片路径有多个匹配，请选择包含 Markdown 的文件夹：${raw}`);
  return matches[0]?.[1] || null;
}
