// clipboardWrite removes the gesture requirement, not the document-focus
// requirement. Wait for the user's return; never steal focus or reuse stale text.
export async function writeFocusedClipboard(
  text: string,
  signal: AbortSignal,
  onWaiting: () => void,
): Promise<void> {
  const cancelled = (): void => {
    if (signal.aborted) throw new Error('保存已取消');
  };
  const waitForFocus = async (): Promise<void> => {
    cancelled();
    if (document.hasFocus()) return;
    onWaiting();
    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        window.removeEventListener('focus', check);
        document.removeEventListener('visibilitychange', check);
        signal.removeEventListener('abort', abort);
        clearInterval(timer);
      };
      const check = (): void => { if (document.hasFocus()) { cleanup(); resolve(); } };
      const abort = (): void => { cleanup(); reject(new Error('保存已取消')); };
      const timer = setInterval(check, 150);
      window.addEventListener('focus', check);
      document.addEventListener('visibilitychange', check);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort(); else check();
    });
  };
  for (;;) {
    await waitForFocus();
    cancelled();
    try { await navigator.clipboard.writeText(text); }
    catch (err) {
      cancelled();
      if (!document.hasFocus()) continue;
      throw err;
    }
    cancelled();
    // Focus may disappear while writeText is pending. Rewrite on return so
    // anything copied in another application cannot be sent as this note.
    if (document.hasFocus()) return;
  }
}
