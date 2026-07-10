/**
 * automa-press-enter.js — wersja 2 („mądry” Enter)
 * ------------------------------------------------
 * Emulacja Entera pod blok „JavaScript Code” w Automie, zaprojektowana pod
 * widżety typu autouzupełnianie, które ignorują prosty syntetyczny Enter.
 *
 * Co robi mądrzej niż zwykły dispatchEvent:
 *   1. Wysyła SEKWENCJĘ klawiszy (domyślnie ArrowDown → Enter) z pauzą —
 *      w autouzupełnianiu Enter wybiera tylko PODŚWIETLONĄ opcję, więc
 *      najpierw trzeba ją podświetlić strzałką.
 *   2. Każdy klawisz to pełna sekwencja keydown → keypress → keyup
 *      z wymuszonymi keyCode/which/charCode (starsze biblioteki czytają
 *      tylko te pola, a konstruktor bywa je pomija).
 *   3. Dla pól contenteditable dokłada `beforeinput` (insertParagraph).
 *   4. PLAN B: gdy strona nie obsłużyła zdarzenia, skrypt szuka w DOM
 *      wewnętrznych propsów Reacta (__reactProps$ / __reactEventHandlers$)
 *      i wywołuje handler onKeyDown BEZPOŚREDNIO — z obiektem, w którym
 *      isTrusted ma wartość true.
 *   5. Obsługuje shadow DOM przy ustalaniu aktywnego elementu.
 *
 * Ograniczenie nie do obejścia z poziomu JS strony: prawdziwej flagi
 * isTrusted w zdarzeniu DOM nie da się podrobić. Jeśli strona twardo jej
 * wymaga, jedyną drogą jest natywny blok Automy „Press key” z włączonym
 * Debug mode w ustawieniach workflow (klawisze idą wtedy przez Chrome
 * DevTools Protocol i są nieodróżnialne od fizycznych).
 */

(async () => {
  /* ====== KONFIGURACJA ====== */
  const SELEKTOR = '';                     // np. '#pole' — puste = aktywny element
  const KLAWISZE = ['ArrowDown', 'Enter']; // dla autouzupełniania; ['Enter'] gdy bez listy
  const ODSTEP_MS = 150;                   // pauza między klawiszami (czas dla widżetu)
  const WYSYLAJ_FORMULARZ = false;         // true = wyślij <form>, gdy Enter przeszedł bez echa
  /* ========================== */

  if (typeof automaResetTimeout === 'function') automaResetTimeout();
  const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));

  // Aktywny element z zagłębieniem w shadow DOM.
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

  function daneKlawisza(nazwa) {
    return MAPA[nazwa] || {
      key: nazwa,
      code: nazwa,
      keyCode: nazwa.length === 1 ? nazwa.toUpperCase().charCodeAt(0) : 0,
    };
  }

  function zbudujZdarzenie(typ, d, charCode = 0) {
    const ev = new KeyboardEvent(typ, {
      key: d.key,
      code: d.code,
      keyCode: d.keyCode,
      which: d.keyCode,
      charCode,
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
    });
    // Gdy konstruktor zignorował pola legacy — wymuś je getterami.
    for (const [prop, wartosc] of [['keyCode', d.keyCode], ['which', d.keyCode], ['charCode', charCode]]) {
      if (ev[prop] !== wartosc) {
        try { Object.defineProperty(ev, prop, { get: () => wartosc }); } catch (_) { /* zostaje jak jest */ }
      }
    }
    return ev;
  }

  /** Pełna sekwencja zdarzeń jednego klawisza. Zwraca true, gdy strona obsłużyła keydown. */
  function wcisnijKlawisz(el, nazwa) {
    const d = daneKlawisza(nazwa);
    const obsluzone = !el.dispatchEvent(zbudujZdarzenie('keydown', d));
    if (d.charCode) el.dispatchEvent(zbudujZdarzenie('keypress', d, d.charCode));
    if (nazwa === 'Enter' && el.isContentEditable) {
      el.dispatchEvent(new InputEvent('beforeinput', {
        inputType: 'insertParagraph',
        bubbles: true,
        cancelable: true,
      }));
    }
    el.dispatchEvent(zbudujZdarzenie('keyup', d));
    return obsluzone;
  }

  /** Plan B: znajdź handler Reacta (onKeyDown) na elemencie lub przodkach i wywołaj wprost. */
  function wywolajHandlerReacta(el, nazwa) {
    const d = daneKlawisza(nazwa);
    for (let node = el; node; node = node.parentElement) {
      const klucz = Object.keys(node).find(
        (k) => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$')
      );
      const props = klucz && node[klucz];
      if (props && typeof props.onKeyDown === 'function') {
        const fake = {
          type: 'keydown',
          key: d.key,
          code: d.code,
          keyCode: d.keyCode,
          which: d.keyCode,
          target: el,
          currentTarget: node,
          bubbles: true,
          cancelable: true,
          isTrusted: true,
          defaultPrevented: false,
          altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false,
          timeStamp: performance.now(),
          preventDefault() { this.defaultPrevented = true; },
          stopPropagation() {},
          stopImmediatePropagation() {},
          persist() {},
          getModifierState() { return false; },
        };
        fake.nativeEvent = fake;
        props.onKeyDown(fake);
        return true;
      }
    }
    return false;
  }

  try {
    const el = SELEKTOR ? document.querySelector(SELEKTOR) : aktywnyElement();
    if (!el || el === document.body) {
      throw new Error('Brak elementu docelowego — ustaw SELEKTOR lub kliknij pole wcześniejszym blokiem.');
    }
    el.focus();

    const przebieg = [];
    for (const nazwa of KLAWISZE) {
      const obsluzone = wcisnijKlawisz(el, nazwa);
      const react = obsluzone ? false : wywolajHandlerReacta(el, nazwa);
      przebieg.push({ klawisz: nazwa, obsluzone, react });
      await czekaj(ODSTEP_MS);
    }

    // Opcjonalny submit, gdy ostatni klawisz przeszedł bez żadnej reakcji.
    const ostatni = przebieg[przebieg.length - 1];
    if (
      WYSYLAJ_FORMULARZ && ostatni && !ostatni.obsluzone && !ostatni.react &&
      el instanceof HTMLInputElement && el.form
    ) {
      if (typeof el.form.requestSubmit === 'function') el.form.requestSubmit();
      else el.form.submit();
      ostatni.formularz = true;
    }

    automaNextBlock({ ok: true, przebieg });
  } catch (err) {
    automaNextBlock({ ok: false, error: err.message });
  }
})();
