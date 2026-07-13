/**
 * automa-gmail-subject-paste.js
 * -----------------------------
 * Wkleja tekst ze schowka w pole TEMAT (Subject) okna tworzenia wiadomości
 * Gmaila. Blok „JavaScript Code” w Automie, Execution context: ACTIVE TAB.
 *
 * Gmail — pułapki, które ta wersja omija:
 *   - selektory z DevTools mają dynamiczne ID z dwukropkiem (np. #:1p6),
 *     które psują querySelector i zmieniają się co chwilę; stabilny selektor
 *     tematu to input[name="subjectbox"],
 *   - pole tematu istnieje dopiero po otwarciu okna tworzenia/odpowiedzi —
 *     skrypt czeka na nie do MAKS_CZEKANIE_MS,
 *   - przy kilku otwartych oknach compose bierze OSTATNIE (najnowsze) pole.
 *
 * Uwaga: odczyt schowka wymaga AKTYWNEGO okna przeglądarki. Jeśli workflow
 * ma działać w tle, użyj zamiast tego natywnych bloków: Clipboard (do
 * zmiennej) → Forms (selector: input[name="subjectbox"], wartość:
 * {{variables.nazwa}}) — one fokusu nie potrzebują.
 */

(async () => {
  /* ====== KONFIGURACJA ====== */
  const SELEKTOR = 'input[name="subjectbox"]'; // pole Temat w Gmailu
  const MAKS_CZEKANIE_MS = 10000;              // ile czekać na pojawienie się pola
  const INTERWAL_MS = 200;
  /* ========================== */

  let zakonczono = false;
  const zakoncz = (dane) => {
    if (zakonczono) return;
    zakonczono = true;
    if (typeof automaNextBlock === 'function') automaNextBlock(dane);
    else console.log('[gmail-subject]', dane);
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

    const widoczny = (el) => {
      try {
        const r = el.getBoundingClientRect();
        return !!(r.width && r.height);
      } catch (_) { return false; }
    };

    // Czekaj na pole tematu (okno compose może się dopiero otwierać).
    // Przy kilku oknach compose bierz ostatnie — najnowsze.
    const znajdzPole = () => {
      const lista = Array.prototype.slice.call(document.querySelectorAll(SELEKTOR)).filter(widoczny);
      return lista.length ? lista[lista.length - 1] : null;
    };

    const start = Date.now();
    let pole = znajdzPole();
    while (!pole && Date.now() - start < MAKS_CZEKANIE_MS) {
      if (typeof automaResetTimeout === 'function') {
        try { automaResetTimeout(); } catch (_) { /* nieistotne */ }
      }
      await czekaj(INTERWAL_MS);
      pole = znajdzPole();
    }
    if (!pole) {
      return zakoncz({
        ok: false,
        error: 'Nie znaleziono pola Temat (' + SELEKTOR + ') — czy okno tworzenia wiadomości jest otwarte?',
      });
    }

    pole.focus();

    // Odczyt schowka (wymaga aktywnego okna przeglądarki).
    let text;
    try {
      text = await navigator.clipboard.readText();
    } catch (err) {
      return zakoncz({
        ok: false,
        error: 'Nie udało się odczytać schowka: ' + err.message +
          ' (okno Chrome musi być aktywne; w tle użyj bloków Clipboard + Forms).',
      });
    }

    // Zdarzenie paste + wstawienie w miejscu kursora.
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const notCancelled = pole.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    );
    if (notCancelled) {
      const s = pole.selectionStart === null ? pole.value.length : pole.selectionStart;
      const e = pole.selectionEnd === null ? pole.value.length : pole.selectionEnd;
      pole.setRangeText(text, s, e, 'end');
      pole.dispatchEvent(new Event('input', { bubbles: true }));
      pole.dispatchEvent(new Event('change', { bubbles: true }));
    }

    zakoncz({ ok: true, text, wartoscPola: pole.value });
  } catch (err) {
    zakoncz({ ok: false, error: (err && err.message) || String(err) });
  }
})();
