// Picks this device's theme before the page first paints, so a dark or custom
// theme doesn't flash light while the app loads. (main.js and themes.js take
// over once the app runs; this reads the same settings.)
(function () {
  var root = document.documentElement;
  var s = {};
  try {
    s = JSON.parse(localStorage.getItem('planner.settings.v1')) || {};
  } catch (e) {
    // No settings yet: System.
  }
  var theme = s.theme || 'system';
  var cache = s.themeCache;
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme);
  } else if (theme !== 'system' && cache && cache.css) {
    root.setAttribute('data-theme', cache.base);
    for (var k in cache.css) root.style.setProperty('--' + k, cache.css[k]);
  } else {
    root.setAttribute('data-theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }
})();
