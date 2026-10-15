// View switches only affect presentation; existing form listeners own persistence.
export function initSettingsNavigation(): void {
  const views = document.querySelectorAll<HTMLButtonElement>('[data-settings-view]');
  const panes = document.querySelectorAll<HTMLElement>('.settings-pane');
  function showView(view: string): void {
    for (const button of views) {
      const active = button.dataset.settingsView === view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    for (const pane of panes) pane.hidden = pane.id !== `settings-${view}`;
  }
  for (const button of views) button.addEventListener('click', () => showView(button.dataset.settingsView!));
  const lensViews = document.querySelectorAll<HTMLButtonElement>('[data-lens-view]');
  for (const button of lensViews) button.addEventListener('click', () => {
    for (const candidate of lensViews) {
      candidate.classList.toggle('active', candidate === button);
      candidate.setAttribute('aria-pressed', String(candidate === button));
    }
    for (const pane of document.querySelectorAll<HTMLElement>('[data-lens-pane]')) {
      pane.hidden = pane.dataset.lensPane !== button.dataset.lensView;
    }
  });
  showView(location.hash === '#lens' ? 'lens' : 'export');
}
