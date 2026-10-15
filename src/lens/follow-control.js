import { validHandle } from './model';

export function currentHandle(doc = document) {
  const href = doc.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href');
  if (!href) return null;
  try {
    const url = new URL(href, 'https://x.com');
    const handle = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1];
    return url.origin === 'https://x.com' && validHandle(handle) ? handle.toLowerCase() : null;
  } catch { return null; }
}

const busy = new WeakMap();
const noticeTimers = new WeakMap();

function notify(doc, message) {
  let notice = doc.getElementById('xcl-lens-follow-notice');
  if (!notice) {
    notice = doc.createElement('div');
    notice.id = 'xcl-lens-follow-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    doc.body.append(notice);
  }
  notice.textContent = message;
  clearTimeout(noticeTimers.get(doc));
  noticeTimers.set(doc, setTimeout(() => notice.remove(), 6000));
}

export function isFollowResult(event, win) {
  const value = event.data;
  return event.source === win && event.origin === win.location.origin && value?.source === 'xchajian-lens-follow' &&
    validHandle(value.handle) && typeof value.following === 'boolean' && typeof value.requested === 'boolean';
}

function sourceHandle(source) {
  for (const link of source.querySelectorAll('a[role="link"][href]')) {
    const handle = link.getAttribute('href').match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1];
    if (handle && link.textContent.trim().toLowerCase() === '@' + handle.toLowerCase()) return handle.toLowerCase();
  }
  return null;
}

function visible(el) {
  return el?.isConnected && el.getClientRects().length > 0 && !el.hidden &&
    el.ownerDocument.defaultView.getComputedStyle(el).visibility !== 'hidden';
}

// Subscribe before clicking: even an immediate native response must be observed.
function followResult(doc, handle) {
  const win = doc.defaultView;
  let listener, timer;
  const promise = new Promise((resolve, reject) => {
    listener = event => {
      if (!isFollowResult(event, win) || event.data.handle.toLowerCase() !== handle) return;
      if (event.data.following || event.data.requested) resolve(event.data);
    };
    win.addEventListener('message', listener);
    timer = setTimeout(() => reject(new Error('未确认关注结果，请查看 X 提示或刷新页面')), 10000);
  });
  // Menu lookup may fail before the response wait is awaited.
  void promise.catch(() => {});
  return { promise, cancel() { clearTimeout(timer); win.removeEventListener('message', listener); } };
}

async function nativeFollow(user, source, button) {
  const doc = button.ownerDocument;
  const handle = user.handle.toLowerCase();
  const actor = currentHandle(doc);
  const validSource = () => button.isConnected && source?.isConnected && sourceHandle(source) === handle && currentHandle(doc) === actor;
  if (!validSource()) throw new Error('账号区域已变化，请刷新页面后再操作');
  const cell = source.closest('[data-testid="UserCell"]');
  const article = source.closest('article[data-testid="tweet"]');
  const root = cell || article;
  if (!root || (!cell && article.querySelector('[data-testid="User-Name"]') !== source)) {
    throw new Error('无法确认此账号的原生关注入口，请使用 X 原生按钮');
  }
  const controls = [...root.querySelectorAll('button[data-testid], [role="button"][data-testid]')].filter(el => {
    const id = el.getAttribute('data-testid');
    if (!/^\d{1,64}-(?:unfollow|follow|pending)$/.test(id) || !visible(el)) return false;
    if (user.id) return id.split('-')[0] === user.id;
    return (el.getAttribute('aria-label') || '').match(/@([A-Za-z0-9_]{1,15})\s*$/)?.[1]?.toLowerCase() === handle;
  });
  if (controls.length > 1) throw new Error('存在多个关注入口，请使用 X 原生按钮');
  let target = controls[0];
  let caret, ownedMenu;
  let cancelled = false;
  const cancelOnEscape = event => { if (event.key === 'Escape') cancelled = true; };
  const response = followResult(doc, handle);
  try {
    if (!target) {
      // The lens keeps its non-modal hover card in the DOM after hiding it.
      // Only visible external overlays should prevent opening X's native menu.
      const blockingOverlay = [...doc.querySelectorAll('[role="menu"], [role="dialog"]')].some(el =>
        visible(el) && !(el.id === 'xcl-lens-tip' && el.getAttribute('aria-modal') === 'false'));
      if (!article || blockingOverlay) throw new Error('请先关闭当前弹层，再点击关注');
      caret = article.querySelector('[data-testid="caret"]');
      if (!visible(caret) || caret.disabled || caret.getAttribute('aria-expanded') === 'true') throw new Error('未找到原生关注菜单，请使用 X 原生按钮');
      doc.addEventListener('keydown', cancelOnEscape, true);
      caret.click();
      const deadline = Date.now() + 1800;
      let expanded = false;
      while (!target && Date.now() < deadline) {
        if (cancelled || !validSource()) throw new Error('关注操作已取消');
        const isExpanded = caret.getAttribute('aria-expanded') === 'true';
        // X commits its React menu asynchronously. A collapsed trigger before
        // the first expansion is still opening, not a user cancellation.
        if (expanded && !isExpanded) throw new Error('关注操作已取消');
        expanded ||= isExpanded;
        if (!expanded) {
          await new Promise(resolve => setTimeout(resolve, 50));
          continue;
        }
        const menus = [...doc.querySelectorAll('[role="menu"]')].filter(visible);
        if (ownedMenu && menus[0] !== ownedMenu) throw new Error('关注操作已取消');
        if (menus.length === 1) {
          ownedMenu = menus[0];
          const items = [...ownedMenu.querySelectorAll('[role="menuitem"]')].filter(el => {
            const text = el.textContent.trim().replace(/\s+/g, ' ');
            return new RegExp('^(?:Follow|Unfollow|关注|關注|跟随|跟隨|取消关注|取消關注)\\s+@' + handle + '$', 'i').test(text);
          });
          if (items.length === 1) target = items[0];
        }
        if (!target) await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!target) throw new Error('未找到此账号的关注操作，请使用 X 原生菜单');
    }
    if (cancelled) throw new Error('关注操作已取消');
    if (!validSource() || !visible(target)) throw new Error('账号区域已变化，请刷新页面后再操作');
    const id = target.getAttribute('data-testid') || '';
    if (id.endsWith('-unfollow') || id.endsWith('-pending') || /^(?:Unfollow|取消关注|取消關注)\s/i.test(target.textContent.trim())) {
      throw new Error('X 当前显示已关注或请求中，请刷新核对状态');
    }
    if (target.disabled || target.getAttribute('aria-disabled') === 'true') throw new Error('X 的关注按钮暂不可用');
    target.click();
    return await response.promise;
  } finally {
    doc.removeEventListener('keydown', cancelOnEscape, true);
    response.cancel();
    // Close only the menu opened by this operation, never another user's dialog.
    const menus = [...doc.querySelectorAll('[role="menu"]')].filter(visible);
    if (ownedMenu && menus.length === 1 && menus[0] === ownedMenu && validSource() &&
        article?.querySelector('[data-testid="caret"]') === caret && caret.getAttribute('aria-expanded') === 'true') caret.click();
  }
}

export function createFollowButton(user, ownHandle, source, doc = document) {
  if (!validHandle(user.handle) || user.handle.toLowerCase() === ownHandle) return null;
  const el = doc.createElement('button');
  el.type = 'button';
  el.className = 'xcl-lens-follow';
  const setState = (following, requested, loading = false) => {
    el.textContent = loading ? '关注中…' : following ? '已关注' : requested ? '已请求' : '关注';
    el.disabled = following || requested || loading;
    el.classList.toggle('is-following', following || requested);
    el.setAttribute('aria-busy', String(loading));
    el.setAttribute('aria-label', `${el.textContent} @${user.handle}`);
    el.title = requested ? '关注请求已发送，等待对方批准' : `${el.textContent} @${user.handle}`;
  };
  setState(user.iFollow === true, user.followRequested === true);
  el.addEventListener('keydown', event => event.stopPropagation());
  el.addEventListener('click', async event => {
    event.preventDefault(); event.stopPropagation();
    if (el.disabled) return;
    if (busy.has(doc)) { notify(doc, '正在处理关注，请稍候'); return; }
    busy.set(doc, true);
    setState(false, false, true);
    try {
      const result = await nativeFollow(user, source, el);
      setState(result.following, result.requested);
      notify(doc, result.following ? `已关注 @${user.handle}` : `已发送关注请求 @${user.handle}`);
    } catch (error) {
      setState(false, false);
      el.title = error.message;
      notify(doc, error.message);
    } finally { busy.delete(doc); }
  });
  return el;
}
