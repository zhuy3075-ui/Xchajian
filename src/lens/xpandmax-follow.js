// Adapted from XpandMax 0.9.4, extension/follow.js (c282792).
// Copyright (c) 2026 yiren-ai. MIT; see XPANDMAX-LICENSE and NOTICE.md.
// XpandMax's waitFor/start workflow is adapted to Zhishi's UI and response bridge.
import { validHandle } from './model';

const followLabels = ['关注', '關注', '跟随', '跟隨', '追蹤', 'follow'];
const unfollowLabels = ['取消关注', '取消關注', '取消跟随', '取消跟隨', '取消追蹤', 'unfollow'];
const matchesAction = (node, labels, handle) => {
  const text = node.textContent.trim().replace(/\s+/g, ' ').toLowerCase();
  return labels.some(label => text === `${label} @${handle}`);
};

function visible(el) {
  return el?.isConnected && el.getClientRects().length > 0 && !el.hidden &&
    el.ownerDocument.defaultView.getComputedStyle(el).visibility !== 'hidden';
}

function waitFor(doc, check, timeout, signal) {
  return new Promise((resolve, reject) => {
    let observer;
    let timer;
    const cleanup = () => {
      observer?.disconnect();
      clearTimeout(timer);

      signal.removeEventListener('abort', abort);
    };
    const abort = () => { cleanup(); reject(new Error('操作已取消')); };
    const inspect = () => {
      try {
        const result = check();
        if (result) { cleanup(); resolve(result); }
      } catch (error) { cleanup(); reject(error); }
    };
    observer = new doc.defaultView.MutationObserver(inspect);
    observer.observe(doc, { childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['data-testid', 'href', 'aria-expanded', 'role', 'hidden', 'style', 'class', 'disabled', 'aria-disabled'] });

    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { cleanup(); reject(new Error('未找到此账号的关注操作，请使用 X 原生菜单')); }, timeout);
    if (signal.aborted) abort(); else inspect();
  });
}

export async function startFollow({ user, source, button, isSameAuthor, subscribeResult }) {
  if (!validHandle(user.handle) || user.iFollow !== false || user.followRequested || user.followBlocked) {
    throw new Error('当前账号不适合执行关注，请刷新核对状态');
  }
  const doc = button.ownerDocument;
  const handle = user.handle.toLowerCase();
  if (!isSameAuthor()) throw new Error('账号区域已变化，请刷新页面后再操作');
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
  const aborter = new AbortController();
  const cancelOnLeave = () => aborter.abort();
  const cancelOnEscape = event => { if (event.key === 'Escape') aborter.abort(); };
  doc.defaultView.addEventListener('pagehide', cancelOnLeave, { once: true });
  doc.addEventListener('keydown', cancelOnEscape, true);
  const response = subscribeResult();
  try {
    if (!target) {
      const blocked = [...doc.querySelectorAll('[role="menu"], [role="dialog"]')].some(el =>
        visible(el) && !(el.id === 'xcl-lens-tip' && el.getAttribute('aria-modal') === 'false'));
      if (!article || blocked) throw new Error('请先关闭当前弹层，再点击关注');
      caret = article.querySelector('[data-testid="caret"]');
      if (!visible(caret) || caret.disabled || caret.getAttribute('aria-expanded') === 'true') throw new Error('未找到原生关注菜单，请使用 X 原生按钮');
      caret.click();
      let expanded = false;
      target = await waitFor(doc, () => {
        if (!isSameAuthor() || article.querySelector('[data-testid="caret"]') !== caret) throw new Error('关注操作已取消');
        const isExpanded = caret.getAttribute('aria-expanded') === 'true';
        if (expanded && !isExpanded) throw new Error('关注操作已取消');
        expanded ||= isExpanded;
        if (!expanded) return false;
        const menus = [...doc.querySelectorAll('[role="menu"]')].filter(visible);
        if (ownedMenu && (menus.length !== 1 || menus[0] !== ownedMenu)) throw new Error('关注操作已取消');
        if (menus.length !== 1) return false;
        ownedMenu = menus[0];
        const items = [...ownedMenu.querySelectorAll('[role="menuitem"]')].filter(visible);
        if (items.some(node => matchesAction(node, unfollowLabels, handle))) {
          throw new Error('X 当前显示已关注或请求中，请刷新核对状态');
        }
        const matches = items.filter(node => matchesAction(node, followLabels, handle));
        return matches.length === 1 ? matches[0] : false;
      }, 1800, aborter.signal);
    }
    if (aborter.signal.aborted) throw new Error('关注操作已取消');
    if (!isSameAuthor() || !visible(target)) throw new Error('账号区域已变化，请刷新页面后再操作');
    const id = target.getAttribute('data-testid') || '';
    if (id.endsWith('-unfollow') || id.endsWith('-pending')) throw new Error('X 当前显示已关注或请求中，请刷新核对状态');
    if (target.disabled || target.getAttribute('aria-disabled') === 'true') throw new Error('X 的关注按钮暂不可用');
    // Awaiting the menu yields: X may reuse its item for another action before
    // this continuation. Revalidate the complete target immediately before click.
    if (ownedMenu) {
      const menus = [...doc.querySelectorAll('[role="menu"]')].filter(visible);
      const items = [...ownedMenu.querySelectorAll('[role="menuitem"]')].filter(visible);
      const matches = items.filter(node => matchesAction(node, followLabels, handle));
      if (menus.length !== 1 || menus[0] !== ownedMenu || caret.getAttribute('aria-expanded') !== 'true' ||
          article.querySelector('[data-testid="caret"]') !== caret || target.closest('[role="menu"]') !== ownedMenu ||
          matches.length !== 1 || matches[0] !== target || items.some(node => matchesAction(node, unfollowLabels, handle))) {
        throw new Error('关注菜单已变化，请重新点击关注');
      }
    } else if (!root.contains(target) || !/^\d{1,64}-follow$/.test(id) ||
        (user.id ? id.split('-')[0] !== user.id :
          (target.getAttribute('aria-label') || '').match(/@([A-Za-z0-9_]{1,15})\s*$/)?.[1]?.toLowerCase() !== handle)) {
      throw new Error('账号区域已变化，请刷新页面后再操作');
    }
    target.click();
    return await response.promise;
  } finally {
    aborter.abort();
    doc.defaultView.removeEventListener('pagehide', cancelOnLeave);
    doc.removeEventListener('keydown', cancelOnEscape, true);
    response.cancel();
    const menus = [...doc.querySelectorAll('[role="menu"]')].filter(visible);
    if (ownedMenu && menus.length === 1 && menus[0] === ownedMenu && isSameAuthor() &&
        article?.querySelector('[data-testid="caret"]') === caret && caret.getAttribute('aria-expanded') === 'true') caret.click();
  }
}
