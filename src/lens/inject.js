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
function emit(body) {
  if (enabled && typeof body === 'string' && body.length <= 4 * 1024 * 1024) {
    window.postMessage({ source: SOURCE, body }, location.origin);
  }
}
async function readResponse(response) {
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
    emit(body + decoder.decode());
  } finally { reader.releaseLock(); }
}
const originalFetch = window.fetch;
window.fetch = function (...args) {
  const result = originalFetch.apply(this, args);
  if (enabled && isGraphql(args[0])) {
    // Rejections must never become page-visible unhandled promise rejections.
    void result.then(response => readResponse(response.clone())).catch(() => {});
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
        if (!this.responseType || this.responseType === 'text') emit(this.responseText);
        else if (this.responseType === 'json') emit(JSON.stringify(this.response));
      } catch { /* Opaque/non-text responses have no usable public stats. */ }
    });
  }
  requests.set(this, isGraphql(args[1]));
  return originalOpen.apply(this, args);
};
