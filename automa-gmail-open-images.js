/**
 * automa-gmail-open-images.js
 * ---------------------------
 * Otwiera PO KOLEI wszystkie zdjęcia (załączniki graficzne) w otwartej
 * wiadomości Gmaila. Blok „JavaScript Code” w Automie, ACTIVE TAB.
 *
 * Gmail ma dynamiczne ID, ale stałe klasy:
 *   div.aQH           — pasek załączników pod treścią maila,
 *   span.aZo          — kafelek pojedynczego załącznika,
 *   div.a3s img       — obrazki osadzone w treści wiadomości.
 *
 * Skrypt: czeka na załączniki → klika kafelek (otwiera podgląd) → trzyma
 * POKAZ_MS → zamyka podgląd (przycisk Zamknij/Close albo Escape) → następny.
 */

(async () => {
  /* ====== KONFIGURACJA ====== */
  const ZRODLO = 'zalaczniki';   // 'zalaczniki' = kafelki pod mailem; 'tresc' = obrazki w treści
  const POKAZ_MS = 3000;         // ile trzymać każde zdjęcie otwarte
  const MAKS_CZEKANIE_MS = 15000; // ile czekać na pojawienie się załączników
  const INTERWAL_MS = 250;
  /* ========================== */

  let zakonczono = false;
  const zakoncz = (dane) => {
    if (zakonczono) return;
    zakonczono = true;
    if (typeof automaNextBlock === 'function') automaNextBlock(dane);
    else console.log('[gmail-images]', dane);
  };

  try {
    if (typeof document === 'undefined' || !document.documentElement) {
      return zakoncz({
        ok: false,
        error: 'Brak dostępu do strony — ustaw "Execution context" bloku na "Active tab".',
      });
    }

    const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));

    const widoczny = (el) => {
      try {
        const r = el.getBoundingClientRect();
        return !!(r.width && r.height);
      } catch (_) { return false; }
    };

    // Kafelki załączników z miniaturą (obrazy) albo obrazki w treści.
    const znajdzZdjecia = () => {
      if (ZRODLO === 'tresc') {
        return Array.prototype.slice.call(document.querySelectorAll('div.a3s img'))
          .filter(widoczny);
      }
      return Array.prototype.slice.call(document.querySelectorAll('div.aQH span.aZo'))
        .filter((k) => widoczny(k) && k.querySelector('img'));
    };

    // Czekaj, aż mail z załącznikami się doładuje.
    const start = Date.now();
    let zdjecia = znajdzZdjecia();
    while (!zdjecia.length && Date.now() - start < MAKS_CZEKANIE_MS) {
      if (typeof automaResetTimeout === 'function') {
        try { automaResetTimeout(); } catch (_) { /* nieistotne */ }
      }
      await czekaj(INTERWAL_MS);
      zdjecia = znajdzZdjecia();
    }
    if (!zdjecia.length) {
      return zakoncz({
        ok: false, otwarto: 0,
        error: 'Nie znaleziono zdjęć (' +
          (ZRODLO === 'tresc' ? 'div.a3s img' : 'div.aQH span.aZo z miniaturą') +
          ') — czy wiadomość jest otwarta i ma załączniki graficzne?',
      });
    }

    const kliknij = (el) => {
      const r = el.getBoundingClientRect();
      const props = {
        bubbles: true, cancelable: true, composed: true, view: window, button: 0,
        clientX: r.left + r.width / 2,
        clientY: r.top + r.height / 2,
      };
      el.dispatchEvent(new PointerEvent('pointerdown', props));
      el.dispatchEvent(new MouseEvent('mousedown', props));
      el.dispatchEvent(new PointerEvent('pointerup', props));
      el.dispatchEvent(new MouseEvent('mouseup', props));
      el.dispatchEvent(new MouseEvent('click', props));
    };

    const zamknijPodglad = () => {
      // Przycisk zamknięcia podglądu (różne języki interfejsu) albo Escape.
      const przycisk = document.querySelector(
        '[aria-label="Zamknij"], [aria-label="Close"], [data-tooltip="Zamknij"], [data-tooltip="Close"]'
      );
      if (przycisk && widoczny(przycisk)) {
        kliknij(przycisk);
        return 'przycisk';
      }
      const esc = {
        key: 'Escape', code: 'Escape', keyCode: 27, which: 27,
        bubbles: true, cancelable: true, composed: true,
      };
      (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', esc));
      (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keyup', esc));
      return 'escape';
    };

    // Otwieraj po kolei.
    const razem = zdjecia.length;
    let otwarto = 0;
    for (let i = 0; i < razem; i++) {
      if (typeof automaResetTimeout === 'function') {
        try { automaResetTimeout(); } catch (_) { /* nieistotne */ }
      }
      // Lista mogła się przerysować — pobierz świeżą i bierz i-ty element.
      const aktualne = znajdzZdjecia();
      const cel = aktualne[i];
      if (!cel) break;

      try { cel.scrollIntoView({ block: 'center' }); } catch (_) { /* nieistotne */ }
      await czekaj(300);
      kliknij(cel);
      otwarto++;

      await czekaj(POKAZ_MS);   // zdjęcie otwarte w podglądzie
      zamknijPodglad();
      await czekaj(800);        // czas na zamknięcie animacji podglądu
    }

    zakoncz({ ok: true, otwarto, razem });
  } catch (err) {
    zakoncz({ ok: false, error: (err && err.message) || String(err) });
  }
})();
