// Applies the saved appearance before the app renders, so there's no flash of the wrong theme.
(function () {
  try {
    var t = localStorage.getItem('mybuffer_theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
