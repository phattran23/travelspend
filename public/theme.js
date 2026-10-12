(function () {
  var t = null;
  try { t = localStorage.getItem('ts_theme'); } catch (e) { /* storage unavailable */ }
  if (!t) t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  var m = document.querySelector('meta[name=theme-color]');
  if (m) m.setAttribute('content', t === 'dark' ? '#0c0a08' : '#faf8f4');
})();
