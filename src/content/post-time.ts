const pad = (value: number): string => String(value).padStart(2, '0');

export function formatPostTime(value: string, now = new Date()): { label: string; full: string } | null {
  // Require the source's explicit timezone; never infer dates from "20h" or
  // parse an ambiguous local date as though it were the published instant.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const [year, month, dayOfMonth] = value.slice(0, 10).split('-').map(Number);
  if (dayOfMonth > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  const day = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const full = `${date.getFullYear()}-${day} ${clock}:${pad(date.getSeconds())}`;
  return { label: `${date.getFullYear() === now.getFullYear() ? '' : `${date.getFullYear()}-`}${day} ${clock}`, full };
}

export function displayPostTimes(): void {
  const now = new Date();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  for (const time of document.querySelectorAll<HTMLTimeElement>('article time[datetime]')) {
    const link = time.closest('a');
    if (!link || !/^https?:\/\/x\.com\/[^/]+\/status\/\d+(?:[/?#]|$)/.test(link.href)) continue;
    const formatted = formatPostTime(time.dateTime, now);
    if (!formatted) continue;
    // Preserve React's text node where possible. Equality checks make our own
    // mutations settle after one pass instead of retriggering a render loop.
    if (time.textContent !== formatted.label) {
      if (time.childNodes.length === 1 && time.firstChild?.nodeType === Node.TEXT_NODE) {
        time.firstChild.nodeValue = formatted.label;
      } else time.textContent = formatted.label;
    }
    const title = `${formatted.full}（本地时区：${zone}）`;
    if (time.title !== title) time.title = title;
    if (time.getAttribute('aria-label') !== title) time.setAttribute('aria-label', title);
  }
}
