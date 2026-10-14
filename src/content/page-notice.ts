// Shared page feedback. Errors remain visible; successful actions expire.
export function pageNotice(text: string, error = false): void {
  document.getElementById('xclipper-page-notice')?.remove();
  const box = document.createElement('section');
  box.id = 'xclipper-page-notice';
  box.setAttribute('role', error ? 'alert' : 'status');
  box.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;max-width:min(360px,calc(100vw - 40px));padding:14px;border:1px solid #9baabc;border-radius:12px;background:#15202b;color:#fff;box-shadow:0 6px 24px #0004;font:14px/1.6 system-ui;overflow-wrap:anywhere;';
  const message = document.createElement('span');
  message.textContent = text;
  box.append(message);
  if (error) {
    const close = document.createElement('button');
    close.textContent = '关闭提示';
    close.style.cssText = 'display:block;margin-top:10px;padding:6px 12px;cursor:pointer;';
    close.onclick = () => box.remove();
    box.append(close);
  } else window.setTimeout(() => box.remove(), 5000);
  document.body.append(box);
}
