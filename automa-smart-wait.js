/**
 * automa-smart-wait.js
 * --------------------
 * „Inteligentne czekanie” pod blok „JavaScript Code” w Automie.
 *
 * Zamiast sztywnego Delay (np. zawsze 3 s) skrypt czeka DOKŁADNIE tak długo,
 * jak trzeba: kończy się w momencie, gdy poprzednie operacje strony ustały
 * i następna akcja jest możliwa. Sprawdza równocześnie:
 *
 *   1. Czy dokument skończył się ładować (document.readyState === 'complete').
 *   2. Czy zniknęły wskaźniki ładowania (spinnery/overlaye — typowe selektory
 *      albo własny w SELEKTOR_ZNIKNIE).
 *   3. Czy DOM się uspokoił — brak zmian w drzewie przez CISZA_DOM_MS
 *      (MutationObserver); to wyłapuje trwające renderowanie po AJAX-ie.
 *   4. Czy element potrzebny NASTĘPNEMU blokowi (SELEKTOR_NASTEPNY) już
 *      istnieje, jest widoczny, nie jest wyłączony (disabled/aria-disabled)
 *      i nie przysłania go inny element (np. overlay).
 *
 * Gdy wszystkie warunki są spełnione — natychmiast przechodzi dalej.
 * Gdy nie zdąży w MAKS_CZEKANIE_MS — przechodzi dalej z { ok: false, powod },
 * co można obsłużyć blokiem „Conditions” ({{prevBlockData.ok}}).
 *
 * Wstaw ten blok między operacjami, np.:
 *   Forms (wpisz tekst) → [TEN BLOK] → Press key Enter → [TEN BLOK] → dalej
 */

(async () => {
  /* ====== KONFIGURACJA ====== */
  const SELEKTOR_NASTEPNY = '';   // element wymagany przez następny blok, np. '#przycisk'
  const SELEKTOR_ZNIKNIE = '';    // własny spinner/overlay do zniknięcia (puste = typowe)
  const MAKS_CZEKANIE_MS = 15000; // twardy limit czekania
  const CISZA_DOM_MS = 500;       // ile ms bez zmian w DOM uznajemy za „spokój”
  const INTERWAL_MS = 100;        // co ile sprawdzać warunki
  /* ========================== */

  const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));

  const SPINNERY = SELEKTOR_ZNIKNIE || [
    '.spinner', '.loader', '.loading', '.loading-overlay',
    '[class*="spinner" i]', '[class*="loader" i]',
    '[aria-busy="true"]',
    '.MuiCircularProgress-root', '.v-progress-circular', '.ant-spin-spinning',
  ].join(', ');

  const widoczny = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const st = getComputedStyle(el);
    return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
  };

  // Obserwuj zmiany DOM — „cisza” oznacza, że strona skończyła przerysowywać.
  let ostatniaMutacja = Date.now();
  const obserwator = new MutationObserver(() => { ostatniaMutacja = Date.now(); });
  obserwator.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, characterData: true,
  });

  let przewinieto = false;

  /** Zwraca '' gdy wszystko gotowe, albo opis tego, co jeszcze blokuje. */
  function coBlokuje() {
    if (document.readyState !== 'complete') {
      return 'strona wciąż się ładuje (readyState: ' + document.readyState + ')';
    }

    const spinner = [...document.querySelectorAll(SPINNERY)].find(widoczny);
    if (spinner) {
      const opis = spinner.className
        ? '.' + String(spinner.className).trim().split(/\s+/).join('.')
        : spinner.tagName.toLowerCase();
      return 'widoczny wskaźnik ładowania: ' + opis;
    }

    if (Date.now() - ostatniaMutacja < CISZA_DOM_MS) {
      return 'DOM wciąż się zmienia';
    }

    if (SELEKTOR_NASTEPNY) {
      const el = document.querySelector(SELEKTOR_NASTEPNY);
      if (!el) return 'brak elementu ' + SELEKTOR_NASTEPNY;
      if (!widoczny(el)) return 'element ' + SELEKTOR_NASTEPNY + ' jest niewidoczny';
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') {
        return 'element ' + SELEKTOR_NASTEPNY + ' jest wyłączony (disabled)';
      }

      // Czy element nie jest przysłonięty przez inny (np. overlay)?
      const r = el.getBoundingClientRect();
      const poza = r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth;
      if (poza && !przewinieto) {
        el.scrollIntoView({ block: 'center', inline: 'center' });
        przewinieto = true;
        return 'przewijanie do elementu ' + SELEKTOR_NASTEPNY;
      }
      const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
      const y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
      const naWierzchu = document.elementFromPoint(x, y);
      if (naWierzchu && !el.contains(naWierzchu) && !naWierzchu.contains(el)) {
        const opis = naWierzchu.id
          ? '#' + naWierzchu.id
          : naWierzchu.tagName.toLowerCase() +
            (naWierzchu.className ? '.' + String(naWierzchu.className).trim().split(/\s+/)[0] : '');
        return 'element przysłonięty przez ' + opis;
      }
    }

    return '';
  }

  const start = Date.now();
  let powod = coBlokuje();
  while (powod && Date.now() - start < MAKS_CZEKANIE_MS) {
    // Odświeżaj timeout bloku Automy, żeby długie czekanie go nie ubiło.
    if (typeof automaResetTimeout === 'function') automaResetTimeout();
    await czekaj(INTERWAL_MS);
    powod = coBlokuje();
  }
  obserwator.disconnect();

  const czekalemMs = Date.now() - start;
  if (!powod) {
    automaNextBlock({ ok: true, czekalemMs });
  } else {
    // Limit minął — idź dalej, ale powiedz dlaczego (obsłuż blokiem Conditions).
    automaNextBlock({ ok: false, czekalemMs, powod });
  }
})();
