/**
 * automa-select-option.js
 * -----------------------
 * Wybiera opcję z listy podpowiedzi (autouzupełnianie / dropdown) pod blok
 * „JavaScript Code” w Automie.
 *
 * Zamiast emulować Enter (który wiele widżetów ignoruje, bo sprawdza
 * isTrusted), skrypt CZEKA aż lista podpowiedzi się pojawi i KLIKA
 * w opcję pełną sekwencją zdarzeń myszy (pointer + mouse + click).
 * Kliknięcia obsługuje praktycznie każdy widżet (React-select, Select2,
 * Angular Material, jQuery UI itd.).
 *
 * Użycie: blok wpisujący tekst w pole → ten blok.
 */

(async () => {
  /* ====== KONFIGURACJA ====== */
  const TEKST_OPCJI = '';    // fragment tekstu opcji do wybrania; puste = pierwsza widoczna
  const SELEKTOR_OPCJI = ''; // własny selektor opcji, gdy automatyczne nie łapią
  const MAKS_CZEKANIE_MS = 3000; // ile czekać na pojawienie się listy
  /* ========================== */

  if (typeof automaResetTimeout === 'function') automaResetTimeout();

  const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));

  const widoczny = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const st = getComputedStyle(el);
    return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
  };

  // Selektory typowych list podpowiedzi używanych przez popularne biblioteki.
  const SELEKTORY = SELEKTOR_OPCJI || [
    '[role="option"]',
    'ul[role="listbox"] li',
    '.select2-results__option',
    '.ui-autocomplete .ui-menu-item',
    '.autocomplete-item, .autocomplete__option, .autocomplete-suggestion',
    '.dropdown-menu li, .dropdown-item',
    '.tt-suggestion',
  ].join(', ');

  const znajdzOpcje = () => {
    const kandydaci = [...document.querySelectorAll(SELEKTORY)].filter(widoczny);
    if (!kandydaci.length) return null;
    if (!TEKST_OPCJI) return kandydaci[0];
    const szukany = TEKST_OPCJI.trim().toLowerCase();
    return (
      kandydaci.find((el) => (el.textContent || '').trim().toLowerCase().includes(szukany)) || null
    );
  };

  try {
    // Czekaj, aż lista podpowiedzi się wyrenderuje.
    let opcja = null;
    const start = Date.now();
    while (!(opcja = znajdzOpcje()) && Date.now() - start < MAKS_CZEKANIE_MS) {
      await czekaj(100);
    }
    if (!opcja) {
      throw new Error(
        'Nie znaleziono widocznej opcji' +
          (TEKST_OPCJI ? ` z tekstem "${TEKST_OPCJI}"` : '') +
          '. Sprawdź SELEKTOR_OPCJI (zbadaj listę w DevTools).'
      );
    }

    // Pełna sekwencja zdarzeń myszy w środku opcji — widżety często
    // reagują już na mousedown, nie dopiero na click.
    const r = opcja.getBoundingClientRect();
    const props = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      button: 0,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
    };
    opcja.dispatchEvent(new PointerEvent('pointerover', props));
    opcja.dispatchEvent(new MouseEvent('mouseover', props));
    opcja.dispatchEvent(new PointerEvent('pointerdown', props));
    opcja.dispatchEvent(new MouseEvent('mousedown', props));
    opcja.dispatchEvent(new PointerEvent('pointerup', props));
    opcja.dispatchEvent(new MouseEvent('mouseup', props));
    opcja.dispatchEvent(new MouseEvent('click', props));

    automaNextBlock({ ok: true, wybrano: (opcja.textContent || '').trim() });
  } catch (err) {
    automaNextBlock({ ok: false, error: err.message });
  }
})();
