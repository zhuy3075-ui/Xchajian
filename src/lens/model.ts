export const SETTINGS_KEY = 'xchajian_lens_settings';
export const HISTORY_KEY = 'xchajian_lens_history';
export const EPOCH_KEY = 'xchajian_lens_epoch';
export const DEFAULTS = {
  enabled: true, showRatio: false, tierColors: true, hoverCard: true,
  trackHistory: false, dimLowQuality: false, layout: 'auto', maxTags: 2, debug: false,
  tags: { relation: true, bigV: true, farm: true, newAcct: true, oldAcct: true, engaged: true, lowActive: true },
};
export type Settings = typeof DEFAULTS;
export function mergeSettings(saved?: unknown): Settings {
  const out = structuredClone(DEFAULTS);
  if (!saved || typeof saved !== 'object') return out;
  const raw = saved as Record<string, unknown>;
  for (const key of ['enabled', 'showRatio', 'tierColors', 'hoverCard', 'trackHistory', 'dimLowQuality', 'debug'] as const) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  }
  if (['auto', 'inline', 'below'].includes(String(raw.layout))) out.layout = String(raw.layout);
  if (Number.isInteger(raw.maxTags) && Number(raw.maxTags) >= 0 && Number(raw.maxTags) <= 3) out.maxTags = Number(raw.maxTags);
  if (raw.tags && typeof raw.tags === 'object') {
    for (const key of Object.keys(out.tags) as (keyof Settings['tags'])[]) {
      const value = (raw.tags as Record<string, unknown>)[key];
      if (typeof value === 'boolean') out.tags[key] = value;
    }
  }
  return out;
}

export type History = Record<string, [number, number][]>;
export const validHandle = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_]{1,15}$/.test(v);
export const validCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

export function cleanHistory(raw: unknown, now: number): History {
  const history: History = Object.create(null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return history;
  for (const [handle, points] of Object.entries(raw)) {
    if (!validHandle(handle) || !Array.isArray(points)) continue;
    const valid: [number, number][] = points.filter((p): p is [number, number] =>
      Array.isArray(p) && p.length === 2 && validCount(p[0]) && p[0] <= now && validCount(p[1]));
    if (valid.length) history[handle.toLowerCase()] = valid.sort((a, b) => a[0] - b[0]).slice(-40);
  }
  return trimHistory(history);
}

function trimHistory(history: History): History {
  const handles = Object.keys(history).sort((a, b) => history[b].at(-1)![0] - history[a].at(-1)![0]);
  for (const handle of handles.slice(3000)) delete history[handle];
  return history;
}

export function recordSamples(raw: unknown, samples: unknown, now: number): History {
  const history = cleanHistory(raw, now);
  if (!Array.isArray(samples)) throw new Error('粉丝记录必须是数组');
  for (const sample of samples.slice(0, 500)) {
    if (!sample || !validHandle(sample.handle) || !validCount(sample.followers)) continue;
    const handle = sample.handle.toLowerCase();
    const points = history[handle] || [];
    if (points.length && now - points.at(-1)![0] < 6 * 3600e3) continue;
    history[handle] = [...points, [now, sample.followers] as [number, number]].slice(-40);
  }
  return trimHistory(history);
}
