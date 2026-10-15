// Preferences applied before first paint (docs/adr/0012-preferences-before-first-paint.md): Base.astro loads this
// classic script first in <head>. It only reads storage. Its literals mirror src/islands/contracts.ts, src/lib/era.ts
// and src/i18n/langs.ts; tests/islands/prefs-head.test.ts keeps them in step and the file under 1 KB gzip.
(function () {
  try {
    var root = document.documentElement;
    var store = window.localStorage;
    var home = /^\/(pt|en|es|de|it)\/$/.exec(location.pathname);
    var lang = store.getItem('plcmuseum:lang');
    if (home && lang !== home[1] && /^(pt|en|es|de|it)$/.test(lang || '')) {
      // Only a home reached through a same-origin redirect (the Worker's "/" answer) follows the remembered
      // language (ADR-0011); a link, a reload or a history move keeps its language.
      var nav = performance.getEntriesByType('navigation')[0];
      if (nav && nav.type === 'navigate' && nav.redirectCount > 0) {
        // Stopping the parser first leaves this home without a body: it never paints or reaches a screen reader.
        window.stop();
        location.replace('/' + lang + '/' + location.search + location.hash);
        return;
      }
    }
    if (store.getItem('plcmuseum:era-ui') !== '1') return;
    var era = root.getAttribute('data-page-era');
    if (['1970s', '1980s', '1990s', '2000s', '2020s'].indexOf(era) !== -1) root.setAttribute('data-era', era);
  } catch {
    // Storage or timing unavailable: the page keeps the museum theme and its language.
  }
})();
