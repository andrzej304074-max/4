/**
 * automa-wait-clickable.js
 * ------------------------
 * Blok „czekaj, aż przycisk będzie KLIKALNY” pod „JavaScript Code” w Automie
 * (Execution context: ACTIVE TAB). Wstaw go bezpośrednio PRZED blokiem,
 * który klika (Click element / skrypt), i podaj ten sam selektor.
 *
 * Czeka (domyślnie bez limitu), dopóki przycisk nie spełni WSZYSTKICH
 * warunków klikalności:
 *   - istnieje w DOM,
 *   - jest widoczny (rozmiar, display, visibility, opacity),
 *   - nie ma atrybutu disabled ani aria-disabled="true",
 *   - nie ma pointer-events: none,
 *   - nie ma klasy blokującej (.disabled, .loading itp.),
 *   - nie przysłania go inny element (np. overlay/spinner) — sprawdzane
 *     w punkcie środka przycisku; w razie potrzeby przewija do niego stronę.
 *
 * Gdy wszystko gotowe — kończy się NATYCHMIAST i oddaje kontrolę dalej.
 * Wynik: { ok: true, czekalemMs } albo { ok: false, powod } przy limicie.
 * Skrypt cyklicznie odświeża timeout bloku, więc może czekać dowolnie długo.
 */

(async () => {
  /* ====== KONFIGURACJA ====== */
  const SELEKTOR = '';            // ← WPISZ selektor przycisku z NASTĘPNEGO bloku
  const MAKS_CZEKANIE_MS = 0;     // 0 = bez limitu; np. 30000 = maks. 30 s
  const INTERWAL_MS = 150;        // co ile sprawdzać
  const KLASY_BLOKADY = ['disabled', 'is-disabled', 'btn-disabled', 'loading', 'is-loading'];
  const POKAZUJ_POWOD_W_TYTULE = true; // pokazuj na karcie, na co skrypt aktualnie czeka
  /* ========================== */

  const bezLimitu = !(MAKS_CZEKANIE_MS > 0);

  let przywrocTytul = null;
  let zakonczono = false;
  const zakoncz = (dane) => {
    if (zakonczono) return;
    zakonczono = true;
    if (przywrocTytul) { try { przywrocTytul(); } catch (_) { /* nieistotne */ } }
    if (typeof automaNextBlock === 'function') automaNextBlock(dane);
    else console.log('[wait-clickable]', dane);
  };

  if (!bezLimitu) {
    setTimeout(() => {
      zakoncz({ ok: false, error: 'watchdog: skrypt nie zakończył się w limicie' });
    }, MAKS_CZEKANIE_MS + 2000);
  }

  try {
    if (typeof document === 'undefined' || !document.documentElement) {
      return zakoncz({
        ok: false,
        error: 'Brak dostępu do strony — ustaw "Execution context" bloku na "Active tab".',
      });
    }
    if (!SELEKTOR) {
      return zakoncz({
        ok: false,
        error: 'Uzupełnij SELEKTOR — selektor przycisku, na którego klikalność czekamy.',
      });
    }

    const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));
    let przewinieto = false;

    /** Zwraca '' gdy przycisk jest klikalny, albo opis przeszkody. */
    const coBlokuje = () => {
      let el = null;
      try { el = document.querySelector(SELEKTOR); }
      catch (_) { return 'niepoprawny selektor: ' + SELEKTOR; }
      if (!el) return 'przycisk nie istnieje';

      try {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return 'przycisk ma zerowy rozmiar';
        const st = getComputedStyle(el);
        if (st.display === 'none') return 'przycisk ukryty (display: none)';
        if (st.visibility === 'hidden') return 'przycisk ukryty (visibility: hidden)';
        if (st.opacity === '0') return 'przycisk niewidoczny (opacity: 0)';
        if (st.pointerEvents === 'none') return 'przycisk nieklikalny (pointer-events: none)';
      } catch (_) { return 'nie można odczytać stylów przycisku'; }

      if (el.disabled) return 'przycisk wyłączony (disabled)';
      if (el.getAttribute('aria-disabled') === 'true') return 'przycisk wyłączony (aria-disabled)';
      for (const klasa of KLASY_BLOKADY) {
        if (el.classList && el.classList.contains(klasa)) {
          return 'przycisk ma klasę blokady „' + klasa + '”';
        }
      }

      try {
        const r = el.getBoundingClientRect();
        const poza = r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth;
        if (poza && !przewinieto) {
          el.scrollIntoView({ block: 'center', inline: 'center' });
          przewinieto = true;
          return 'przewijanie do przycisku';
        }
        const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
        const y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
        const naWierzchu = document.elementFromPoint(x, y);
        if (naWierzchu && !el.contains(naWierzchu) && !naWierzchu.contains(el)) {
          const opis = naWierzchu.id
            ? '#' + naWierzchu.id
            : naWierzchu.tagName.toLowerCase();
          return 'przycisk przysłonięty przez ' + opis;
        }
      } catch (_) { /* test przysłonięcia pomijamy przy błędzie */ }

      return '';
    };

    // Diagnostyka na żywo: aktualny powód czekania w tytule karty.
    const tytulOryginalny = document.title;
    przywrocTytul = () => { document.title = tytulOryginalny; };
    let ostatniTytul = null;

    const start = Date.now();
    let powod = '';
    for (;;) {
      try { powod = coBlokuje(); }
      catch (e) { powod = 'błąd testu: ' + ((e && e.message) || String(e)); }
      if (!powod) break;
      if (POKAZUJ_POWOD_W_TYTULE && powod !== ostatniTytul) {
        try { document.title = '⏳ ' + powod; } catch (_) { /* nieistotne */ }
        ostatniTytul = powod;
      }
      if (!bezLimitu && Date.now() - start >= MAKS_CZEKANIE_MS) break;
      if (typeof automaResetTimeout === 'function') {
        try { automaResetTimeout(); } catch (_) { /* nieistotne */ }
      }
      await czekaj(INTERWAL_MS);
    }

    const czekalemMs = Date.now() - start;
    zakoncz(powod ? { ok: false, czekalemMs, powod } : { ok: true, czekalemMs });
  } catch (err) {
    zakoncz({ ok: false, error: (err && err.message) || String(err) });
  }
})();
