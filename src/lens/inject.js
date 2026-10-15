// Passive observer only: preserve the page's original request and response.
const SOURCE = 'xchajian-lens';
let enabled = true;
window.addEventListener('message', (event) => {
  if (event.source === window && event.origin === location.origin && event.data?.source === SOURCE + '-control') {
    if (typeof event.data.enabled === 'boolean') enabled = event.data.enabled;
  }
});
function isGraphql(input) {
  try {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
    return url.origin === location.origin && url.pathname.startsWith('/i/api/graphql/');
  } catch { return false; }
}
function isFollow(input) {
  try {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
    return url.origin === location.origin && /^\/i\/api\/1\.1\/friendships\/(create|destroy)\.json$/.test(url.pathname);
  } catch { return false; }
}
function emit(body, follow = false, ok = true) {
  if (follow) {
    if (!enabled || !ok || typeof body !== 'string' || body.length > 4 * 1024 * 1024) return;
    try {
      const result = JSON.parse(body);
      if (result.errors || !/^[A-Za-z0-9_]{1,15}$/.test(result.screen_name) || typeof result.following !== 'boolean') return;
      window.postMessage({ source: SOURCE + '-follow', handle: result.screen_name.toLowerCase(),
        following: result.following, requested: result.follow_request_sent === true }, location.origin);
    } catch { /* A missing/invalid result must never be reported as success. */ }
    return;
  }
  if (enabled && typeof body === 'string' && body.length <= 4 * 1024 * 1024) {
    window.postMessage({ source: SOURCE, body }, location.origin);
  }
}
async function readResponse(response, follow) {
  if (!response.body || Number(response.headers.get('content-length')) > 4 * 1024 * 1024) return;
  const reader = response.body.getReader();
  let size = 0;
  const decoder = new TextDecoder();
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4 * 1024 * 1024) { void reader.cancel().catch(() => {}); return; }
      body += decoder.decode(value, { stream: true });
    }
    emit(body + decoder.decode(), follow, response.ok);
  } finally { reader.releaseLock(); }
}
const originalFetch = window.fetch;
window.fetch = function (...args) {
  const result = originalFetch.apply(this, args);
  const follow = isFollow(args[0]);
  if (enabled && (follow || isGraphql(args[0]))) {
    // Rejections must never become page-visible unhandled promise rejections.
    void result.then(response => readResponse(response.clone(), follow)).catch(() => {});
  }
  return result;
};
const originalOpen = XMLHttpRequest.prototype.open;
const requests = new WeakMap();
XMLHttpRequest.prototype.open = function (...args) {
  if (!requests.has(this)) {
    this.addEventListener('load', () => {
      if (!enabled || !requests.get(this)) return;
      try {
        const follow = requests.get(this) === 'follow';
        const ok = this.status >= 200 && this.status < 300;
        if (!this.responseType || this.responseType === 'text') emit(this.responseText, follow, ok);
        else if (this.responseType === 'json') emit(JSON.stringify(this.response), follow, ok);
      } catch { /* Opaque/non-text responses have no usable public stats. */ }
    });
  }
  requests.set(this, isFollow(args[1]) ? 'follow' : isGraphql(args[1]));
  return originalOpen.apply(this, args);
};
