import { exitSelection } from './selection';
let host: HTMLElement | undefined;
let frame: HTMLIFrameElement | undefined;
let trigger: HTMLButtonElement | undefined;
export function syncPageTools(enabled: boolean, side: 'left' | 'right' = 'right'): void {
  if (!enabled) { host?.remove(); host = undefined; frame = undefined; exitSelection(); return; }
  if (!host) {
    host = document.createElement('aside');
    host.id = 'xclipper-page-tools';
    host.style.cssText = 'position:fixed;bottom:96px;z-index:2147483645;font:14px system-ui;';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = ':host{color-scheme:light dark}button{font:600 14px system-ui;padding:10px 14px;background:Canvas;color:CanvasText;border:1px solid #8a9aaa;border-radius:10px;cursor:pointer}iframe{display:block;width:min(360px,calc(100vw - 32px));height:min(510px,calc(100vh - 190px));border:1px solid #8a9aaa;border-radius:12px;background:Canvas;box-shadow:0 8px 30px #0004;margin-bottom:8px}iframe[hidden]{display:none}';
    trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.textContent = '采集工具';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.onclick = () => {
      if (!frame) {
        frame = document.createElement('iframe');
        frame.src = chrome.runtime.getURL('page-tools.html');
        frame.title = '知拾 页面采集工具';
        shadow.insertBefore(frame, trigger!);
      } else frame.hidden = !frame.hidden;
      trigger!.textContent = frame.hidden ? '采集工具' : '收起采集工具';
      trigger!.setAttribute('aria-expanded', String(!frame.hidden));
    };
    shadow.append(style, trigger);
    document.body.append(host);
    // Keyboard positioning avoids interfering with pointer clicks or X scrolling.
    trigger.title = '展开批量采集；在插件设置中选择左侧或右侧';
  }
  host.style.left = side === 'left' ? '16px' : 'auto';
  host.style.right = side === 'left' ? 'auto' : '16px';
}

export function showPageTools(): void {
  if (trigger && (!frame || frame.hidden)) trigger.click();
}
