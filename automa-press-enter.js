/**
 * automa-press-enter.js — wersja 3 (Enter z wbudowanym czekaniem)
 * ---------------------------------------------------------------
 * Emulacja Entera pod blok „JavaScript Code” w Automie (Execution context:
 * ACTIVE TAB), z inteligentnym czekaniem WBUDOWANYM w skrypt — nie potrzeba
 * żadnych bloków Delay ani osobnego bloku czekania w workflow.
 *
 * Przebieg:
 *   FAZA 1 — czekanie: skrypt czeka, aż strona skończy poprzednie operacje
 *     (dokument doładowany, spinnery zniknęły, DOM ucichł) — maks. MAKS_CZEKANIE_MS,
 *     a kończy czekać natychmiast, gdy strona jest gotowa.
 *   FAZA 2 — akcja: sekwencja klawiszy (domyślnie ArrowDown → Enter) z pełnymi
 *     zdarzeniami keydown/keypress/keyup + plan B przez propsy Reacta.
 *
 * Zabezpieczenia: każdy błąd jest raportowany przez automaNextBlock (nigdy
 * gołe „error”), watchdog gwarantuje zakończenie bloku, wykrywany jest zły
 * Execution context (Background).
 */

(async () => {
  /* ====== KONFIGURACJA ====== */
  const SELEKTOR = '';             // np. '#pole' — puste = aktywny element
  const KLAWISZE = ['Enter'];      // dla pola z listą podpowiedzi: ['ArrowDown', 'Enter']
  const ODSTEP_MS = 150;           // pauza między klawiszami
  const PLAN_B_REACT = false;      // true = wywołaj handler Reacta, gdy strona nie zgłosi
                                   // obsługi Entera. UWAGA: jeśli strona obsługuje Enter
                                   // bez preventDefault, plan B ZDUBLUJE akcję (np. podwójna
                                   // wysyłka w czacie). Włączaj tylko, gdy Enter nie działa.
  const CZEKAJ_NA_GOTOWOSC = true; // false = działaj od razu, bez fazy czekania
  const MAKS_CZEKANIE_MS = 10000;  // limit fazy czekania
  const CISZA_DOM_MS = 400;        // ile ms spokoju w DOM uznajemy za „gotowe”
  /* ========================== */

  // Dokładnie jedno zakończenie bloku, cokolwiek się stanie.
  let zakonczono = false;
  const zakoncz = (dane) => {
    if (zakonczono) return;
    zakonczono = true;
    if (typeof automaNextBlock === 'function') automaNextBlock(dane);
    else console.log('[press-enter]', dane);
  };
  setTimeout(() => {
    zakoncz({ ok: false, error: 'watchdog: skrypt nie zakończył się w limicie' });
  }, MAKS_CZEKANIE_MS + KLAWISZE.length * (ODSTEP_MS + 200) + 3000);

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

    /* ===== FAZA 2: klawisze ===== */
    function aktywnyElement() {
      let el = document.activeElement;
      while (el && el.shadowRoot && el.shadowRoot.activeElement) {
        el = el.shadowRoot.activeElement;
      }
      return el;
    }

    const MAPA = {
      Enter:     { key: 'Enter',     code: 'Enter',     keyCode: 13, charCode: 13 },
      Tab:       { key: 'Tab',       code: 'Tab',       keyCode: 9 },
      Escape:    { key: 'Escape',    code: 'Escape',    keyCode: 27 },
      ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
      ArrowUp:   { key: 'ArrowUp',   code: 'ArrowUp',   keyCode: 38 },
    };

    const daneKlawisza = (nazwa) => MAPA[nazwa] || {
      key: nazwa,
      code: nazwa,
      keyCode: nazwa.length === 1 ? nazwa.toUpperCase().charCodeAt(0) : 0,
    };

    function zbudujZdarzenie(typ, d, charCode = 0) {
      const ev = new KeyboardEvent(typ, {
        key: d.key, code: d.code, keyCode: d.keyCode, which: d.keyCode, charCode,
        bubbles: true, cancelable: true, composed: true, view: window,
      });
      for (const [prop, wartosc] of [['keyCode', d.keyCode], ['which', d.keyCode], ['charCode', charCode]]) {
        if (ev[prop] !== wartosc) {
          try { Object.defineProperty(ev, prop, { get: () => wartosc }); } catch (_) { /* zostaje */ }
        }
      }
      return ev;
    }

    function wcisnijKlawisz(el, nazwa) {
      const d = daneKlawisza(nazwa);
      const obsluzone = !el.dispatchEvent(zbudujZdarzenie('keydown', d));
      if (d.charCode) el.dispatchEvent(zbudujZdarzenie('keypress', d, d.charCode));
      if (nazwa === 'Enter' && el.isContentEditable) {
        el.dispatchEvent(new InputEvent('beforeinput', {
          inputType: 'insertParagraph', bubbles: true, cancelable: true,
        }));
      }
      el.dispatchEvent(zbudujZdarzenie('keyup', d));
      return obsluzone;
    }

    function wywolajHandlerReacta(el, nazwa) {
      const d = daneKlawisza(nazwa);
      for (let node = el; node; node = node.parentElement) {
        const klucz = Object.keys(node).find(
          (k) => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$')
        );
        const props = klucz && node[klucz];
        if (props && typeof props.onKeyDown === 'function') {
          const fake = {
            type: 'keydown', key: d.key, code: d.code, keyCode: d.keyCode, which: d.keyCode,
            target: el, currentTarget: node,
            bubbles: true, cancelable: true, isTrusted: true, defaultPrevented: false,
            altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false,
            timeStamp: performance.now(),
            preventDefault() { this.defaultPrevented = true; },
            stopPropagation() {}, stopImmediatePropagation() {}, persist() {},
            getModifierState() { return false; },
          };
          fake.nativeEvent = fake;
          props.onKeyDown(fake);
          return true;
        }
      }
      return false;
    }

    const el = SELEKTOR ? document.querySelector(SELEKTOR) : aktywnyElement();
    if (!el || el === document.body) {
      return zakoncz({
        ok: false, czekalemMs,
        error: 'Brak elementu docelowego — ustaw SELEKTOR lub kliknij pole wcześniejszym blokiem.',
      });
    }
    el.focus();

    const przebieg = [];
    for (const nazwa of KLAWISZE) {
      const obsluzone = wcisnijKlawisz(el, nazwa);
      const react = (!obsluzone && PLAN_B_REACT) ? wywolajHandlerReacta(el, nazwa) : false;
      przebieg.push({ klawisz: nazwa, obsluzone, react });
      await czekaj(ODSTEP_MS);
    }

    zakoncz({ ok: true, czekalemMs, przebieg });
  } catch (err) {
    zakoncz({ ok: false, error: (err && err.message) || String(err) });
  }
})();
