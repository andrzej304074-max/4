/**
 * automa-smart-wait.js — wersja 3 (budżety czasowe warunków)
 * ----------------------------------------------------------
 * Uniwersalny blok czekania pod „JavaScript Code” w Automie: wstaw między
 * DOWOLNE dwa bloki. Czeka, aż strona skończy pracę po poprzednim bloku,
 * i natychmiast oddaje kontrolę dalej.
 *
 * Nowość w v3: każdy warunek ma własny BUDŻET czasu. Na stronach, które
 * mutują DOM bez przerwy (czaty, animacje, zegary), warunek „ciszy w DOM”
 * nigdy się nie spełni — po wyczerpaniu budżetu jest pomijany, zamiast
 * blokować workflow do pełnego limitu. To samo dotyczy wiecznie widocznych
 * elementów wyglądających jak spinner.
 *
 * Warunki i budżety (liczone od startu bloku):
 *   - dokument doładowany (readyState)  → pełny limit MAKS_CZEKANIE_MS,
 *   - brak widocznych spinnerów         → do BUDZET_SPINNERA_MS,
 *   - cisza w DOM przez CISZA_DOM_MS    → do BUDZET_CISZY_MS,
 *   - gotowość SELEKTOR_NASTEPNY        → pełny limit (tylko gdy ustawiony).
 *
 * USTAWIENIA BLOKU: Execution context = ACTIVE TAB, Timeout = 30000.
 * Wynik: { ok, czekalemMs, pominiete } — `pominiete` mówi, które warunki
 * wyczerpały budżet (diagnostyka w logach).
 */

(async () => {
  /* ====== KONFIGURACJA (domyślne działają uniwersalnie) ====== */
  const SELEKTOR_NASTEPNY = '';    // OPCJONALNIE: element potrzebny następnemu blokowi
  const SELEKTOR_ZNIKNIE = '';     // OPCJONALNIE: własny spinner/overlay
  const MAKS_CZEKANIE_MS = 10000;  // twardy limit całego czekania
  const CISZA_DOM_MS = 400;        // ile ms bez zmian w DOM uznajemy za „spokój”
  const BUDZET_CISZY_MS = 4000;    // po tym czasie warunek ciszy DOM jest pomijany
  const BUDZET_SPINNERA_MS = 8000; // po tym czasie ignorujemy wiecznie widoczny spinner
  const INTERWAL_MS = 100;         // co ile sprawdzać warunki
  /* =========================================================== */

  let zakonczono = false;
  const zakoncz = (dane) => {
    if (zakonczono) return;
    zakonczono = true;
    if (typeof automaNextBlock === 'function') automaNextBlock(dane);
    else console.log('[smart-wait]', dane);
  };

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

    let ostatniaMutacja = Date.now();
    let obserwator = null;
    try {
      obserwator = new MutationObserver(() => { ostatniaMutacja = Date.now(); });
      obserwator.observe(document.documentElement, {
        childList: true, subtree: true, attributes: true, characterData: true,
      });
    } catch (_) { obserwator = null; }

    let przewinieto = false;
    const pominiete = [];

    const coBlokuje = (uplynelo) => {
      if (document.readyState !== 'complete') return 'strona wciąż się ładuje';

      if (uplynelo < BUDZET_SPINNERA_MS) {
        for (const sel of SPINNERY) {
          const el = znajdzWszystkie(sel).find(widoczny);
          if (el) return 'widoczny wskaźnik ładowania (' + sel + ')';
        }
      } else if (pominiete.indexOf('spinner') === -1) {
        pominiete.push('spinner');
      }

      if (uplynelo < BUDZET_CISZY_MS) {
        if (obserwator && Date.now() - ostatniaMutacja < CISZA_DOM_MS) {
          return 'DOM wciąż się zmienia';
        }
      } else if (pominiete.indexOf('cisza-dom') === -1) {
        pominiete.push('cisza-dom');
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
      const uplynelo = Date.now() - start;
      try { powod = coBlokuje(uplynelo); }
      catch (e) { powod = 'błąd testu: ' + ((e && e.message) || String(e)); }
      if (!powod) break;
      if (uplynelo >= MAKS_CZEKANIE_MS) break;
      if (typeof automaResetTimeout === 'function') {
        try { automaResetTimeout(); } catch (_) { /* nieistotne */ }
      }
      await czekaj(INTERWAL_MS);
    }
    if (obserwator) { try { obserwator.disconnect(); } catch (_) { /* nieistotne */ } }

    const czekalemMs = Date.now() - start;
    zakoncz(
      powod
        ? { ok: false, czekalemMs, powod, pominiete }
        : { ok: true, czekalemMs, pominiete }
    );
  } catch (err) {
    zakoncz({ ok: false, error: (err && err.message) || String(err) });
  }
})();
