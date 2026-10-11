(function () {
  var t = null;
  try { t = localStorage.getItem('ts_theme'); } catch (e) { /* storage unavailable */ }
  if (!t) t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
})();
