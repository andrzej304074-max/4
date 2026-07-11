/**
 * automa-paste-simple.js — wersja 2 (wklejanie z wbudowanym czekaniem)
 * --------------------------------------------------------------------
 * Wklejanie ze schowka systemowego pod blok „JavaScript Code” w Automie
 * (Execution context: ACTIVE TAB), z inteligentnym czekaniem WBUDOWANYM
 * w skrypt — bloki Delay nie są potrzebne.
 *
 * Przebieg:
 *   FAZA 1 — czekanie: aż strona skończy poprzednie operacje (dokument
 *     doładowany, spinnery zniknęły, DOM ucichł); kończy się natychmiast,
 *     gdy strona gotowa.
 *   FAZA 2 — akcja: odczyt schowka, zdarzenie `paste`, wstawienie tekstu
 *     w miejscu kursora (input/textarea/contenteditable) + zdarzenie `input`.
 *
 * Każdy błąd jest raportowany przez automaNextBlock — nigdy gołe „error”.
 */

(async () => {
  /* ====== KONFIGURACJA ====== */
  const SELEKTOR = '';             // np. '#search' — puste = aktywne pole
  const CZEKAJ_NA_GOTOWOSC = true; // false = wklejaj od razu
  const MAKS_CZEKANIE_MS = 10000;  // limit fazy czekania
  const CISZA_DOM_MS = 400;        // ile ms spokoju w DOM uznajemy za „gotowe”
  /* ========================== */

  let zakonczono = false;
  const zakoncz = (dane) => {
    if (zakonczono) return;
    zakonczono = true;
    if (typeof automaNextBlock === 'function') automaNextBlock(dane);
    else console.log('[paste]', dane);
  };
  setTimeout(() => {
    zakoncz({ ok: false, error: 'watchdog: skrypt nie zakończył się w limicie' });
  }, MAKS_CZEKANIE_MS + 5000);

  try {
    if (typeof document === 'undefined' || !document.documentElement) {
      return zakoncz({
        ok: false,
        error: 'Brak dostępu do strony — ustaw "Execution context" bloku na "Active tab".',
      });
    }

    const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));

    /* ===== FAZA 1: poczekaj, aż strona skończy poprzednie operacje ===== */
    async function poczekajNaGotowosc(maksMs) {
      const startCzekania = Date.now();
      const widoczny = (el) => {
        try {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) return false;
          const st = getComputedStyle(el);
          return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
        } catch (_) { return false; }
      };
      const SPINNERY = [
        '.spinner', '.loader', '.loading', '.loading-overlay',
        '[aria-busy="true"]',
        '.MuiCircularProgress-root', '.v-progress-circular', '.ant-spin-spinning',
      ];
      let ostatniaMutacja = Date.now();
      let obserwator = null;
      try {
        obserwator = new MutationObserver(() => { ostatniaMutacja = Date.now(); });
        obserwator.observe(document.documentElement, {
          childList: true, subtree: true, attributes: true, characterData: true,
        });
      } catch (_) { obserwator = null; }

      const zajete = () => {
        if (document.readyState !== 'complete') return true;
        for (const sel of SPINNERY) {
          try {
            if (Array.prototype.some.call(document.querySelectorAll(sel), widoczny)) return true;
          } catch (_) { /* pomiń selektor */ }
        }
        if (obserwator && Date.now() - ostatniaMutacja < CISZA_DOM_MS) return true;
        return false;
      };

      while (zajete() && Date.now() - startCzekania < maksMs) {
        if (typeof automaResetTimeout === 'function') {
          try { automaResetTimeout(); } catch (_) { /* nieistotne */ }
        }
        await czekaj(100);
      }
      if (obserwator) { try { obserwator.disconnect(); } catch (_) { /* nieistotne */ } }
      return Date.now() - startCzekania;
    }

    const czekalemMs = CZEKAJ_NA_GOTOWOSC ? await poczekajNaGotowosc(MAKS_CZEKANIE_MS) : 0;

    /* ===== FAZA 2: wklejenie ===== */
    if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
      return zakoncz({
        ok: false, czekalemMs,
        error: 'Clipboard API niedostępne (wymagany HTTPS i zgoda na odczyt schowka).',
      });
    }

    let text;
    try {
      text = await navigator.clipboard.readText();
    } catch (err) {
      return zakoncz({
        ok: false, czekalemMs,
        error: 'Nie udało się odczytać schowka: ' + err.message +
          ' (karta musi mieć fokus, a strona zgodę na clipboard-read).',
      });
    }

    let el = null;
    if (SELEKTOR) {
      el = document.querySelector(SELEKTOR);
    } else {
      el = document.activeElement;
      while (el && el.shadowRoot && el.shadowRoot.activeElement) {
        el = el.shadowRoot.activeElement;
      }
    }
    if (!el || el === document.body) {
      return zakoncz({
        ok: false, czekalemMs,
        error: 'Brak pola docelowego — kliknij w pole wcześniejszym blokiem lub ustaw SELEKTOR.',
      });
    }
    el.focus();

    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const notCancelled = el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    );

    let wstawiono = false;
    if (notCancelled) {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const start = el.selectionStart === null ? el.value.length : el.selectionStart;
        const end = el.selectionEnd === null ? el.value.length : el.selectionEnd;
        el.setRangeText(text, start, end, 'end');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        wstawiono = true;
      } else if (el.isContentEditable) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const node = document.createTextNode(text);
          range.insertNode(node);
          range.setStartAfter(node);
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          el.append(document.createTextNode(text));
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        wstawiono = true;
      }
    }

    zakoncz({ ok: true, czekalemMs, text, wstawiono });
  } catch (err) {
    zakoncz({ ok: false, error: (err && err.message) || String(err) });
  }
})();
