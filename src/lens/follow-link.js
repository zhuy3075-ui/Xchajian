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

export function createFollowLink(user, ownHandle, doc = document) {
  if (!validHandle(user.handle) || user.handle.toLowerCase() === ownHandle) return null;
  const followed = user.iFollow === true;
  const el = doc.createElement(followed ? 'span' : 'a');
  el.className = 'xcl-lens-follow' + (followed ? ' is-following' : '');
  el.textContent = followed ? '已关注' : '前往关注';
  el.setAttribute('aria-label', followed ? `已关注 @${user.handle}` : `前往 X 关注 @${user.handle}（新标签页，由你完成关注）`);
  el.addEventListener('click', event => event.stopPropagation());
  if (!followed) {
    el.href = `https://x.com/intent/follow?screen_name=${encodeURIComponent(user.handle)}`;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    el.title = `在新标签页打开 X，由你完成对 @${user.handle} 的关注`;
    // Keep X's surrounding card from navigating; let the real link handle
    // opening/login/confirmation without claiming that a follow succeeded.
    el.addEventListener('keydown', event => event.stopPropagation());
  }
  return el;
}
