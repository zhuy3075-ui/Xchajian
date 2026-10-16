import { startFollow } from './xpandmax-follow';
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
  const actor = currentHandle(doc);
  const isSameAuthor = () => button.isConnected && source?.isConnected &&
    sourceHandle(source) === user.handle.toLowerCase() && currentHandle(doc) === actor;
  return startFollow({ user, source, button, isSameAuthor,
    subscribeResult: () => followResult(doc, user.handle.toLowerCase()) });
}

export function createFollowButton(user, ownHandle, source, doc = document) {
  if (!validHandle(user.handle) || user.handle.toLowerCase() === ownHandle || user.followBlocked ||
      (typeof user.iFollow !== 'boolean' && !user.followRequested)) return null;
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
