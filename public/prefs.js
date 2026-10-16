// Preferences applied before first paint (docs/adr/0012-preferences-before-first-paint.md). Base.astro writes this
// classic script into <head>; the build moves it to the end of <head> as /_astro/prefs.<hash>.js. It writes nothing
// but the address bar. Its literals mirror src/islands/contracts.ts, src/lib/era.ts, src/i18n/langs.ts and
// worker/src/language.ts; tests/islands/prefs-head.test.ts keeps them in step and the file under 1 KB gzip.
(function () {
  try {
    var root = document.documentElement;
    var home = /^\/(pt|en|es|de|it)\/$/.exec(location.pathname);
    // Only the Worker's "/" redirect adds ?auto, so a link, a reload or a history move keeps its language.
    var auto = home && location.search === '?auto';
    // Removed first, even with storage blocked: no copy or bookmark of the address keeps it.
    if (auto) history.replaceState(null, '', home[0] + location.hash);
    var store = window.localStorage;
    var lang = auto && store.getItem('plcmuseum:lang');
    if (lang && lang !== home[1] && /^(pt|en|es|de|it)$/.test(lang)) {
      // Stopping the parser first leaves this home without a body: it never paints or reaches a screen reader.
      window.stop();
      location.replace('/' + lang + '/' + location.hash);
      return;
    }
    if (store.getItem('plcmuseum:era-ui') !== '1') return;
    var era = root.getAttribute('data-page-era');
    if (['1970s', '1980s', '1990s', '2000s', '2020s'].indexOf(era) !== -1) root.setAttribute('data-era', era);
  } catch {
    // Storage or history unavailable: the page keeps the museum theme and its language.
  }
})();
