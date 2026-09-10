document.documentElement.classList.add('js');

const navigationEntry = performance.getEntriesByType?.('navigation')?.[0];
const isReload = navigationEntry
  ? navigationEntry.type === 'reload'
  : performance.navigation?.type === 1;

const supportsScrollRestoration = 'scrollRestoration' in history;

if (isReload && supportsScrollRestoration) {
  history.scrollRestoration = 'manual';
}

if (isReload && window.location.hash) {
  history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}`);
}

const resetReloadPosition = () => {
  if (isReload && (window.scrollX !== 0 || window.scrollY !== 0)) {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }
};

resetReloadPosition();
window.addEventListener('pageshow', () => {
  resetReloadPosition();
  requestAnimationFrame(() => {
    resetReloadPosition();
    if (supportsScrollRestoration) history.scrollRestoration = 'auto';
  });
}, { once: true });
