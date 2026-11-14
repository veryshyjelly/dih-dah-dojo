// Resolve appearance before the app paints. This preference never enters learner state.
(() => {
  const key = 'dojo-theme';
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const valid = (value) => value === 'light' || value === 'dark';
  const read = () => {
    try {
      const value = localStorage.getItem(key);
      return valid(value) ? value : null;
    } catch {
      return null;
    }
  };
  let preference = read();
  const apply = () => {
    const theme = preference || (media.matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#101b19' : '#f7f8f2');
    window.dispatchEvent(new Event('dojo-theme-change'));
  };
  window.dojoTheme = {
    setTheme(theme) {
      if (!valid(theme)) return;
      preference = theme;
      try {
        localStorage.setItem(key, theme);
      } catch {
        /* Keep an in-memory choice. */
      }
      apply();
    },
  };
  media.addEventListener('change', () => {
    if (!preference) apply();
  });
  window.addEventListener('storage', (event) => {
    if (event.key === key || event.key === null) {
      preference = read();
      apply();
    }
  });
  apply();
})();
