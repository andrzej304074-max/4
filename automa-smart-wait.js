/**
 * automa-smart-wait.js — wersja 2 (pancerna)
 * ------------------------------------------
 * „Inteligentne czekanie” pod blok „JavaScript Code” w Automie: czeka tylko
 * tak długo, aż poprzednie operacje strony ustaną i następny krok będzie
 * możliwy, po czym natychmiast przechodzi dalej.
 *
 * Wersja 2 — dlaczego „pancerna”:
 *   - KAŻDY możliwy błąd jest łapany i raportowany przez automaNextBlock,
 *     więc w logu Automy zawsze zobaczysz konkretny powód zamiast gołego
 *     „error” (goły error = skrypt umarł przed zgłoszeniem wyniku i blok
 *     padł na timeoucie).
 *   - Wykrywa uruchomienie w złym kontekście (Background zamiast Active tab)
 *     i mówi o tym wprost.
 *   - Watchdog gwarantuje zakończenie bloku nawet przy nieprzewidzianym
 *     zawieszeniu.
 *   - Tylko maksymalnie zgodne konstrukcje; każdy selektor w try/catch.
 *
 * USTAWIENIA BLOKU (ikona zębatki na bloku JavaScript Code):
 *   - Execution context: ACTIVE TAB (w Background nie ma dostępu do strony!),
 *   - Timeout bloku: ustaw WIĘKSZY niż MAKS_CZEKANIE_MS, np. 30000.
 */

(async () => {
  /* ====== KONFIGURACJA ====== */
  const SELEKTOR_NASTEPNY = '';   // element wymagany przez następny blok, np. '#przycisk'
  const SELEKTOR_ZNIKNIE = '';    // własny spinner/overlay (puste = typowe klasy)
  const MAKS_CZEKANIE_MS = 15000; // twardy limit czekania
  const CISZA_DOM_MS = 500;       // ile ms bez zmian w DOM uznajemy za „spokój”
  const INTERWAL_MS = 100;        // co ile sprawdzać warunki
  /* ========================== */

  // Dokładnie jedno zakończenie bloku — cokolwiek by się działo.
  let zakonczono = false;
  const zakoncz = (dane) => {
    if (zakonczono) return;
    zakonczono = true;
    if (typeof automaNextBlock === 'function') automaNextBlock(dane);
    else console.log('[smart-wait]', dane);
  };

  // Watchdog: gdyby cokolwiek się zawiesiło, blok i tak się zakończy.
  setTimeout(() => {
    zakoncz({ ok: false, error: 'watchdog: skrypt nie zakończył się w limicie' });
  }, MAKS_CZEKANIE_MS + 2000);

  try {
    if (typeof document === 'undefined' || !document.documentElement) {
      return zakoncz({
        ok: false,
        error: 'Brak dostępu do strony — ustaw "Execution context" bloku na "Active tab".',
      });
    }

    const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));

    const SPINNERY = SELEKTOR_ZNIKNIE
      ? [SELEKTOR_ZNIKNIE]
      : [
          '.spinner', '.loader', '.loading', '.loading-overlay',
          '[aria-busy="true"]',
          '.MuiCircularProgress-root', '.v-progress-circular', '.ant-spin-spinning',
        ];

    const znajdzWszystkie = (selektor) => {
      try { return Array.prototype.slice.call(document.querySelectorAll(selektor)); }
      catch (_) { return []; }
    };

    const widoczny = (el) => {
      try {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        const st = getComputedStyle(el);
        return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
      } catch (_) { return false; }
    };

    // Cisza w DOM — jeśli obserwatora nie da się założyć, warunek pomijamy.
    let ostatniaMutacja = Date.now();
    let obserwator = null;
    try {
      obserwator = new MutationObserver(() => { ostatniaMutacja = Date.now(); });
      obserwator.observe(document.documentElement, {
        childList: true, subtree: true, attributes: true, characterData: true,
      });
    } catch (_) { obserwator = null; }

    let przewinieto = false;

    /** Zwraca '' gdy wszystko gotowe, albo opis tego, co blokuje. */
    const coBlokuje = () => {
      if (document.readyState !== 'complete') return 'strona wciąż się ładuje';

      for (const sel of SPINNERY) {
        const el = znajdzWszystkie(sel).find(widoczny);
        if (el) return 'widoczny wskaźnik ładowania (' + sel + ')';
      }

      if (obserwator && Date.now() - ostatniaMutacja < CISZA_DOM_MS) {
        return 'DOM wciąż się zmienia';
      }

      if (SELEKTOR_NASTEPNY) {
        let el = null;
        try { el = document.querySelector(SELEKTOR_NASTEPNY); }
        catch (_) { return 'niepoprawny selektor: ' + SELEKTOR_NASTEPNY; }
        if (!el) return 'brak elementu ' + SELEKTOR_NASTEPNY;
        if (!widoczny(el)) return 'element niewidoczny: ' + SELEKTOR_NASTEPNY;
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') {
          return 'element wyłączony (disabled): ' + SELEKTOR_NASTEPNY;
        }
        try {
          const r = el.getBoundingClientRect();
          const poza = r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth;
          if (poza && !przewinieto) {
            el.scrollIntoView({ block: 'center', inline: 'center' });
            przewinieto = true;
            return 'przewijanie do elementu';
          }
          const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
          const y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
          const naWierzchu = document.elementFromPoint(x, y);
          if (naWierzchu && !el.contains(naWierzchu) && !naWierzchu.contains(el)) {
            return 'element przysłonięty przez inny (np. overlay)';
          }
        } catch (_) { /* test przysłonięcia pomijamy przy błędzie */ }
      }

      return '';
    };

    const start = Date.now();
    let powod = '';
    for (;;) {
      try { powod = coBlokuje(); }
      catch (e) { powod = 'błąd testu: ' + ((e && e.message) || String(e)); }
      if (!powod) break;
      if (Date.now() - start >= MAKS_CZEKANIE_MS) break;
      if (typeof automaResetTimeout === 'function') {
        try { automaResetTimeout(); } catch (_) { /* nieistotne */ }
      }
      await czekaj(INTERWAL_MS);
    }
    if (obserwator) { try { obserwator.disconnect(); } catch (_) { /* nieistotne */ } }

    const czekalemMs = Date.now() - start;
    zakoncz(powod ? { ok: false, czekalemMs, powod } : { ok: true, czekalemMs });
  } catch (err) {
    zakoncz({ ok: false, error: (err && err.message) || String(err) });
  }
})();
