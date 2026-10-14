// Page actions use the selected side and export in the configured default format.

import { normalizeStatusUrl } from './status-url';
import { decorateSelection, enterSelection, exitSelection } from './selection';
import { pageSourceOfPath, type XPage } from '../shared/x-routes';
import { initInlineObsidian } from './obsidian-inline';
import { copyComment } from './comment-copy';
import { displayPostTimes } from './post-time';
import { openExportMenu, closeExportMenu } from './export-menu';
import { obsidianCardUrl as getStatusUrl } from './obsidian-card';
import { capturePageExport } from './page-export';
import { syncPageTools, showPageTools } from './page-tools-host';

initInlineObsidian();

const BUTTON_ATTR = 'data-xclipper-injected';

let showInlineButton = false;
let controlsSide: 'left' | 'right' = 'right';
let includeReposts = false; // profile batch: keep reposts too (default off)

function removeAllInjectedButtons(): void {
  removeControls(document);
  closeExportMenu();
}

function removeControls(scope: ParentNode): void {
  scope.querySelectorAll(`[${BUTTON_ATTR}]`).forEach(btn => {
    const container = btn.closest('[data-xclipper-controls]');
    if (container) container.remove();
    else btn.remove();
  });
}

function hasControls(scope: Element, withCopy = false): boolean {
  return !!scope.querySelector(`[${BUTTON_ATTR}][aria-label="添加到 Obsidian"]`) &&
    !!scope.querySelector(`[${BUTTON_ATTR}][aria-label="下载"]`) &&
    !!scope.querySelector(`[${BUTTON_ATTR}][aria-label="导出选项"]`) &&
    (!withCopy || !!scope.querySelector(`[${BUTTON_ATTR}][aria-label="复制正文"]`));
}

// True until the extension is disabled/reloaded. After that, chrome.* calls
// from this orphaned content script throw "Extension context invalidated".
function extensionAlive(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

function loadInlineMode(): void {
  if (!extensionAlive()) return;
  try {
    chrome.storage.local.get('xclipper_settings', (result) => {
      if (chrome.runtime.lastError) return;
      const s = (result['xclipper_settings'] || {}) as {
        inlineButtonCopies?: boolean;
        showInlineButton?: boolean;
        includeReposts?: boolean;
        pageToolsSide?: 'left' | 'right';
      };
      includeReposts = s.includeReposts === true;
      const wasShown = showInlineButton;
      showInlineButton = s.showInlineButton !== false;
      controlsSide = s.pageToolsSide === 'left' ? 'left' : 'right';
      syncPageTools(showInlineButton, s.pageToolsSide);
      document.querySelectorAll<HTMLElement>('[data-xclipper-controls]').forEach(container => {
        if (container.parentElement) positionControls(container.parentElement, container);
      });
      if (wasShown && !showInlineButton) {
        removeAllInjectedButtons();
      } else if (!wasShown && showInlineButton) {
        scan();
      }
    });
  } catch {
    /* extension context gone */
  }
}
loadInlineMode();
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes['xclipper_settings']) return;
    loadInlineMode();
  });
} catch {
  /* extension context gone */
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function buildIcon(obsidian = false): SVGElement {
  // Mirrors X's own action-bar icon style: solid currentColor fill, no stroke.
  // Arrow path is X's share-icon arrow flipped vertically (download direction);
  // tray path is X's share-icon tray unchanged — it works as a "catch" tray.
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.width = '1.25em';
  svg.style.height = '1.25em';
  svg.style.display = 'block';
  svg.style.fill = 'currentColor';

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute(
    'd',
    obsidian
      ? 'M5 3h12a2 2 0 0 1 2 2v4h-2V5H5v14h7v2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 4h8v2H7zm0 4h5v2H7zm10 1h2v3h3v2h-3v3h-2v-3h-3v-2h3z'
      : 'M12 16l5.7-5.7-1.41-1.42L13 12.18V2.59h-2V12.18l-3.3-3.3-1.41 1.42L12 16zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z'
  );
  svg.appendChild(path);

  return svg;
}

function makeButton(onClick: (e: Event) => void, obsidian = false): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.setAttribute(BUTTON_ATTR, '1');
  wrapper.setAttribute('role', 'button');
  wrapper.setAttribute('tabindex', '0');
  wrapper.setAttribute('aria-label', obsidian ? '添加到 Obsidian' : '下载');
  wrapper.title = obsidian ? '保存此条内容到 Obsidian' : '按默认单条格式下载';
  wrapper.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'cursor:pointer',
    'color:rgb(113,118,123)',
    'padding:8px',
    'border-radius:9999px',
    'transition:background-color 0.15s,color 0.15s',
    'user-select:none',
  ].join(';');
  wrapper.appendChild(buildIcon(obsidian));

  wrapper.addEventListener('mouseenter', () => {
    wrapper.style.backgroundColor = 'rgba(29,155,240,0.1)';
    wrapper.style.color = 'rgb(29,155,240)';
  });
  wrapper.addEventListener('mouseleave', () => {
    wrapper.style.backgroundColor = '';
    // Restore the per-context color measured from X's sibling icon, falling
    // back to the timeline gray if measurement hasn't happened yet.
    wrapper.style.color = wrapper.dataset.idleColor || 'rgb(113,118,123)';
  });

  const handler = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    onClick(e);
  };
  wrapper.addEventListener('click', handler);
  wrapper.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') handler(e);
  });

  return wrapper;
}

function makeObsidianButton(url: () => string, article?: Element): HTMLElement {
  return makeButton(() => {
    window.dispatchEvent(new CustomEvent('xclipper:obsidian', {
      detail: { url: url(), single: true, article },
    }));
  }, true);
}

function positionControls(actionBar: Element, container: HTMLElement): void {
  if (controlsSide === 'left') {
    if (actionBar.firstElementChild !== container) actionBar.prepend(container);
  } else if (actionBar.lastElementChild !== container) actionBar.append(container);
}

function makeExportOptions(url: () => string | null): HTMLElement {
  const button = makeButton(() => {
    const target = url();
    if (target) void openExportMenu(button, target);
  });
  button.setAttribute('aria-label', '导出选项');
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.title = '选择格式、范围或复制为其他格式';
  button.style.padding = '8px 4px';
  button.querySelector('path')!.setAttribute('d', 'M6.7 8.3 12 13.6l5.3-5.3 1.4 1.4L12 16.4 5.3 9.7z');
  return button;
}

// X renders icons at different sizes and slightly different gray values
// depending on context (focused tweet vs timeline, light vs dark theme).
// Measure a sibling icon's actual rendered size and fill, and pin ours to
// match — that way the inline button looks native in every surface X uses.
function matchSiblingIcon(
  actionBar: Element,
  wrapper: HTMLElement,
  ourSvg: SVGElement | null
): void {
  if (!ourSvg) return;
  const ref = Array.from(actionBar.querySelectorAll('svg')).find(
    (s) => !s.closest(`[${BUTTON_ATTR}]`)
  );
  if (!ref) return;
  const r = ref.getBoundingClientRect();
  if (r.width > 0) {
    ourSvg.style.width = `${r.width}px`;
    ourSvg.style.height = `${r.height}px`;
  }
  const fill = getComputedStyle(ref).fill;
  if (fill && fill !== 'none') {
    // Drive both idle and hover via currentColor on the wrapper.
    wrapper.dataset.idleColor = fill;
    wrapper.style.color = fill;
  }
}

function decorateArticleActionBar(article: Element): void {
  const groups = Array.from(article.querySelectorAll('div[role="group"]'))
    .filter(group => group.closest('article') === article && !group.closest('div[role="link"]'));
  const actionBar = groups.find(group => group.id.startsWith('id__')) || groups[0];
  if (!actionBar) return;
  // X replaces action bars without replacing their article. Inspect the live
  // controls rather than remembering that the article used to have buttons.
  if (hasControls(actionBar, true)) {
    positionControls(actionBar, actionBar.querySelector<HTMLElement>('[data-xclipper-controls]')!);
    return;
  }

  const url = getStatusUrl(article);
  if (!url) return;
  removeControls(actionBar);

  const btn = makeButton(() => {
    const fresh = getStatusUrl(article);
    if (fresh) void openExportMenu(btn, fresh, article, true);
  });
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  const container = document.createElement('div');
  container.setAttribute('data-xclipper-controls', '1');
  container.style.cssText = 'display:flex;align-items:center;';
  const obsidianBtn = makeObsidianButton(() => getStatusUrl(article) || url, article);
  obsidianBtn.title = '保存此条内容到 Obsidian（不采集整串评论）';
  container.appendChild(obsidianBtn);
  const copyBtn = makeButton(() => { void copyComment(article, copyBtn); });
  copyBtn.setAttribute('aria-label', '复制正文');
  copyBtn.title = '复制此条评论/推文的正文（不含引用内容）';
  copyBtn.querySelector('path')!.setAttribute('d', 'M8 2h12a2 2 0 0 1 2 2v12h-2V4H8V2zM4 6h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm0 2v12h12V8H4z');
  container.appendChild(copyBtn);
  container.appendChild(btn);
  container.appendChild(makeExportOptions(() => getStatusUrl(article)));
  positionControls(actionBar, container);

  matchSiblingIcon(actionBar, btn, btn.querySelector('svg'));
  matchSiblingIcon(actionBar, obsidianBtn, obsidianBtn.querySelector('svg'));
  matchSiblingIcon(actionBar, copyBtn, copyBtn.querySelector('svg'));

}

// On article (long-form) pages, X renders a top action bar above the content.
// Inject the same button there so users don't have to scroll past long articles.
function decorateArticleTopBar(): void {
  if (!window.location.pathname.includes('/status/')) return;
  const articleBody = document.querySelector('[data-testid="twitterArticleRichTextView"]')
    || document.querySelector('[data-testid="twitter-article-title"]');
  if (!articleBody) return;

  let candidate: Element | null = null;
  let cursor: Element | null = articleBody;
  for (let i = 0; cursor && i < 8; i++) {
    const groups = cursor.parentElement?.querySelectorAll('div[role="group"]');
    if (groups && groups.length) {
      candidate = groups[0];
      break;
    }
    cursor = cursor.parentElement;
  }
  if (!candidate) return;
  if (hasControls(candidate)) {
    positionControls(candidate, candidate.querySelector<HTMLElement>('[data-xclipper-controls]')!);
    return;
  }
  removeControls(candidate);

  const btn = makeButton(() => { void openExportMenu(btn, normalizeStatusUrl(location.href)!, undefined, true); });
  btn.setAttribute('aria-haspopup', 'dialog');
  const container = document.createElement('div');
  container.setAttribute('data-xclipper-controls', '1');
  container.style.cssText = 'display:flex;align-items:center;';
  const obsidianBtn = makeObsidianButton(() => window.location.href);
  container.appendChild(obsidianBtn);
  container.appendChild(btn);
  container.appendChild(makeExportOptions(() => normalizeStatusUrl(location.href)));
  positionControls(candidate, container);
  matchSiblingIcon(candidate, btn, btn.querySelector('svg'));
  matchSiblingIcon(candidate, obsidianBtn, obsidianBtn.querySelector('svg'));
}

let scanScheduled = false;
function scan(): void {
  displayPostTimes();
  if (!showInlineButton) return;
  const articles = document.querySelectorAll('article[role="article"]');
  articles.forEach(decorateArticleActionBar);
  decorateArticleTopBar();
}

// ─── Timeline harvester (ADR 0002, Phases B–C) ───────────────────────
// X virtualizes timelines — cells scrolled past are detached from the DOM —
// so "what's in the DOM" is not "what the user has loaded". Accumulate
// permalinks as cells pass through, in encounter order (top first); the
// popup asks for the set when starting a batch export. Sources: the
// bookmarks page, profile pages (where reposts are skipped by keeping only
// the owner's own /<handle>/status/ links), and the Likes page (which keeps
// every author, since likes are of other people's posts). The set resets
// when the source changes, so a later visit doesn't export items removed
// meanwhile.

type HarvestSource = (XPage & { key: string }) | null;

function harvestSourceOfPage(): HarvestSource {
  const page = pageSourceOfPath(window.location.pathname);
  if (!page) return null;
  // Key the dedupe set per account wherever the route names one, so walking
  // from one profile (or one Likes page) to another starts a fresh set.
  return {
    ...page,
    key: page.handle ? `${page.source}:${page.handle.toLowerCase()}` : page.source,
  };
}

const harvested = new Set<string>();
let harvestKey = '';

function harvestTimeline(): HarvestSource {
  const source = harvestSourceOfPage();
  if (!source) {
    if (harvestKey) {
      harvested.clear();
      harvestKey = '';
    }
    return null;
  }
  if (source.key !== harvestKey) {
    harvested.clear();
    harvestKey = source.key;
  }
  for (const article of document.querySelectorAll('article[role="article"]')) {
    const url = getStatusUrl(article);
    if (!url) continue;
    if (source.source === 'profile' && source.handle && !includeReposts) {
      // Repost cells link to the original author's permalink — skip them so
      // a profile export contains the profile owner's own posts.
      const author = url.match(/x\.com\/([^/]+)\/status\//)?.[1] || '';
      if (author.toLowerCase() !== source.handle.toLowerCase()) continue;
    }
    harvested.add(url);
  }
  return source;
}

// Selection mode lives in ./selection (enter/exit/decorate); the injector just
// wires it to the popup message + the mutation observer below.

try {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.action === 'XCLIPPER_CAPTURE_PAGE') {
      if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('page-export.html'))) return false;
      capturePageExport(msg.url, msg.single !== false).then(
        data => sendResponse({ success: true, data }),
        err => sendResponse({ success: false, error: String(err.message || err) }));
      return true;
    }
    if (msg?.action === 'XCLIPPER_PAGE_TOOLS_STATUS') {
      sendResponse({ enabled: showInlineButton, controlsVersion: 2, side: controlsSide }); return false;
    }
    if (msg?.action === 'XCLIPPER_PAGE_TOOLS_SHOW') {
      showPageTools(); sendResponse({ ok: true }); return false;
    }
    if (msg?.action === 'XCLIPPER_OBSIDIAN_SHOW_BUTTONS') {
      if (sender.id !== chrome.runtime.id) { sendResponse({ ok: false }); return false; }
      showInlineButton = true;
      scan();
      sendResponse({ ok: true, count: document.querySelectorAll(`[${BUTTON_ATTR}][aria-label="添加到 Obsidian"]`).length });
      return false;
    }
    if (msg && msg.action === 'XCLIPPER_HARVEST') {
      const source = harvestTimeline(); // catch cells rendered since the last mutation
      sendResponse({
        source: source ? source.source : null,
        ...(source?.source === 'profile' ? { handle: source.handle } : {}),
        urls: Array.from(harvested),
      });
      return false;
    }
    if (msg && msg.action === 'XCLIPPER_HARVEST_RESET') {
      // Drop everything gathered so far, then re-seed from the current viewport
      // so the collection restarts at wherever the user has scrolled to.
      harvested.clear();
      harvestTimeline();
      sendResponse({ count: harvested.size });
      return false;
    }
    if (msg && msg.action === 'XCLIPPER_SELECTION') {
      if (msg.enable) enterSelection();
      else exitSelection();
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });
} catch {
  /* extension context gone */
}

const observer = new MutationObserver(() => {
  if (!extensionAlive()) {
    observer.disconnect();
    return;
  }
  if (scanScheduled) return;
  scanScheduled = true;
  requestAnimationFrame(() => {
    scanScheduled = false;
    scan();
    harvestTimeline();
    decorateSelection();
  });
});

observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['datetime'] });
scan();
harvestTimeline();

// ─── Right-click tracking ────────────────────────────────────────────
// On context menu open, find the closest tweet article and tell the background
// service worker its permalink. The background uses this as the fallback URL
// when the user picks the menu item over an area that isn't a status link.

document.addEventListener('contextmenu', (e) => {
  if (!extensionAlive()) return;
  const target = e.target as Element | null;
  const article = target?.closest?.('article[role="article"]') as Element | null;
  let url: string | null = null;
  if (article) {
    url = getStatusUrl(article);
  } else if (window.location.pathname.includes('/status/')) {
    // On a permalink page where no article is under the cursor, fall back to
    // the page URL itself.
    url = window.location.href;
  }
  try {
    chrome.runtime.sendMessage({ action: 'XCLIPPER_CTX_URL', url }, () => {
      // Read lastError to suppress "Unchecked runtime.lastError" log when the
      // background hasn't registered the listener yet or context is gone.
      void chrome.runtime.lastError;
    });
  } catch {
    /* extension context gone */
  }
}, true);
