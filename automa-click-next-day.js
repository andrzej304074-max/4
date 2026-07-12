/**
 * automa-click-next-day.js
 * ------------------------
 * Klika w kalendarzu (datepickerze) przycisk JUTRZEJSZEGO dnia pod blok
 * „JavaScript Code” w Automie (Execution context: ACTIVE TAB).
 *
 * Działanie:
 *   1. Odczytuje dzisiejszą datę z komputera i dodaje PRZESUNIECIE_DNI
 *      (domyślnie 1 = następny dzień; obsługuje przejścia miesiąca/roku).
 *   2. Buduje etykietę w formacie datepickera, np. „Monday, July 13th, 2026”
 *      (angielski dzień tygodnia, miesiąc, dzień z końcówką st/nd/rd/th, rok).
 *   3. Czeka, aż pojawi się KLIKALNY przycisk, którego aria-label ZAWIERA
 *      tę etykietę — dopiski typu „, selected” nie przeszkadzają.
 *   4. Klika pełną sekwencją zdarzeń myszy (pointer + mouse + click).
 *
 * Wynik w logu: { ok, etykieta, kliknieto } albo { ok: false, etykieta,
 * error } — pole `etykieta` pokazuje, czego skrypt szukał, więc łatwo
 * porównać z faktycznym aria-label na stronie.
 */

(async () => {
  /* ====== KONFIGURACJA ====== */
  const PRZESUNIECIE_DNI = 1;     // 1 = jutro, 0 = dzisiaj, 2 = pojutrze, -1 = wczoraj
  const MAKS_CZEKANIE_MS = 15000; // ile czekać na przycisk; 0 = bez limitu
  const INTERWAL_MS = 200;        // co ile ponawiać szukanie
  /* ========================== */

  const bezLimitu = !(MAKS_CZEKANIE_MS > 0);

  let zakonczono = false;
  const zakoncz = (dane) => {
    if (zakonczono) return;
    zakonczono = true;
    if (typeof automaNextBlock === 'function') automaNextBlock(dane);
    else console.log('[click-next-day]', dane);
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

    const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));

    /* ===== 1–2: data docelowa i etykieta ===== */
    const data = new Date();
    data.setDate(data.getDate() + PRZESUNIECIE_DNI);

    const dzien = data.getDate();
    const koncowka = (d) => {
      if (d % 100 >= 11 && d % 100 <= 13) return 'th';
      switch (d % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
      }
    };
    const dzienTygodnia = data.toLocaleDateString('en-US', { weekday: 'long' });
    const miesiac = data.toLocaleDateString('en-US', { month: 'long' });
    const etykieta =
      dzienTygodnia + ', ' + miesiac + ' ' + dzien + koncowka(dzien) + ', ' + data.getFullYear();
    // np. „Monday, July 13th, 2026”

    /* ===== 3: czekaj na klikalny przycisk ===== */
    const widoczny = (el) => {
      try {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        const st = getComputedStyle(el);
        return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
      } catch (_) { return false; }
    };

    const znajdzPrzycisk = () => {
      let lista = [];
      try {
        lista = Array.prototype.slice.call(
          document.querySelectorAll('button[aria-label*="' + etykieta + '"]')
        );
      } catch (_) { lista = []; }
      return lista.find(
        (el) =>
          widoczny(el) &&
          !el.disabled &&
          el.getAttribute('aria-disabled') !== 'true'
      ) || null;
    };

    const start = Date.now();
    let przycisk = znajdzPrzycisk();
    while (!przycisk) {
      if (!bezLimitu && Date.now() - start >= MAKS_CZEKANIE_MS) break;
      if (typeof automaResetTimeout === 'function') {
        try { automaResetTimeout(); } catch (_) { /* nieistotne */ }
      }
      await czekaj(INTERWAL_MS);
      przycisk = znajdzPrzycisk();
    }
    if (!przycisk) {
      return zakoncz({
        ok: false,
        etykieta,
        error: 'Nie znaleziono klikalnego przycisku o aria-label zawierającym: „' + etykieta + '”.',
      });
    }

    /* ===== 4: kliknięcie pełną sekwencją zdarzeń ===== */
    try { przycisk.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) { /* nieistotne */ }
    const r = przycisk.getBoundingClientRect();
    const props = {
      bubbles: true, cancelable: true, composed: true, view: window, button: 0,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
    };
    przycisk.dispatchEvent(new PointerEvent('pointerover', props));
    przycisk.dispatchEvent(new MouseEvent('mouseover', props));
    przycisk.dispatchEvent(new PointerEvent('pointerdown', props));
    przycisk.dispatchEvent(new MouseEvent('mousedown', props));
    przycisk.dispatchEvent(new PointerEvent('pointerup', props));
    przycisk.dispatchEvent(new MouseEvent('mouseup', props));
    przycisk.dispatchEvent(new MouseEvent('click', props));

    zakoncz({
      ok: true,
      etykieta,
      kliknieto: przycisk.getAttribute('aria-label'),
      czekalemMs: Date.now() - start,
    });
  } catch (err) {
    zakoncz({ ok: false, error: (err && err.message) || String(err) });
  }
})();
