/**
 * automa-gmail-live-monitor.js
 * ----------------------------
 * CIĄGŁY monitor Gmaila (na żywo, bez interwałów) pod blok „JavaScript Code”
 * w Automie (Execution context: ACTIVE TAB).
 *
 * Działanie: blok czeka BEZ LIMITU w otwartej karcie Gmaila, aż na liście
 * pojawi się NIEPRZECZYTANA wiadomość od nadawcy NADAWCA. Gmail aktualizuje
 * otwartą skrzynkę w czasie rzeczywistym, więc reakcja następuje w kilka
 * sekund od otrzymania maila. Po wykryciu skrypt:
 *   1. zapisuje temat do zmiennych workflow (gmailTemat, gmailNadawca),
 *   2. klika wiadomość (otwiera ją = oznacza jako przeczytaną, żeby ta sama
 *      wiadomość nie wyzwoliła monitora ponownie),
 *   3. wraca do listy (history.back) i kończy blok — workflow idzie dalej,
 *      np. do bloku „Execute workflow” z Twoim głównym workflow.
 *
 * Układ workflow-monitora (pętla):
 *   Trigger → New tab (https://mail.google.com/mail/u/0/)
 *          → [TEN BLOK] → Execute workflow (główny)
 *          → strzałka z POWROTEM do bloku New tab (pętla nasłuchu)
 *
 * Wymagania: przeglądarka uruchomiona, zalogowany Gmail, karta może być
 * w tle. Skrypt cyklicznie odświeża timeout bloku, więc czeka dowolnie długo.
 */

(async () => {
  /* ====== KONFIGURACJA ====== */
  const NADAWCA = 'adres@gmail.com'; // ← ADRES nadawcy, na którego czekamy
  const INTERWAL_MS = 1000;          // co ile sprawdzać listę (wewnątrz karty)
  /* ========================== */

  let zakonczono = false;
  const zakoncz = (dane) => {
    if (zakonczono) return;
    zakonczono = true;
    if (typeof automaNextBlock === 'function') automaNextBlock(dane);
    else console.log('[gmail-live]', dane);
  };

  try {
    if (typeof document === 'undefined' || !document.documentElement) {
      return zakoncz({
        ok: false, nowy: false,
        error: 'Brak dostępu do strony — ustaw "Execution context" bloku na "Active tab".',
      });
    }
    if (location.hostname !== 'mail.google.com') {
      return zakoncz({
        ok: false, nowy: false,
        error: 'To nie jest karta Gmaila (' + location.hostname + ') — poprzedni blok ma otworzyć mail.google.com.',
      });
    }
    if (!NADAWCA || NADAWCA.indexOf('@') === -1 || NADAWCA === 'adres@gmail.com') {
      return zakoncz({
        ok: false, nowy: false,
        error: 'Uzupełnij NADAWCA — adres e-mail, na który monitor ma reagować.',
      });
    }

    const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));
    const szukany = NADAWCA.toLowerCase();

    // Nieprzeczytany wiersz (tr.zA.zE) od szukanego nadawcy (span[email=...]).
    const znajdzWiersz = () => {
      const wiersze = document.querySelectorAll('tr.zA.zE');
      for (let i = 0; i < wiersze.length; i++) {
        const spany = wiersze[i].querySelectorAll('span[email]');
        for (let j = 0; j < spany.length; j++) {
          if ((spany[j].getAttribute('email') || '').toLowerCase() === szukany) {
            return wiersze[i];
          }
        }
      }
      return null;
    };

    // 1. NASŁUCH: czekaj bez limitu na wiadomość od nadawcy.
    let wiersz = znajdzWiersz();
    while (!wiersz) {
      if (typeof automaResetTimeout === 'function') {
        try { automaResetTimeout(); } catch (_) { /* nieistotne */ }
      }
      await czekaj(INTERWAL_MS);
      wiersz = znajdzWiersz();
    }

    // 2. Zbierz dane wiadomości.
    let temat = '';
    try {
      const elTemat = wiersz.querySelector('span.bog');
      temat = elTemat ? elTemat.textContent.trim() : '';
    } catch (_) { /* dane pomocnicze */ }
    if (typeof automaSetVariable === 'function') {
      try {
        automaSetVariable('gmailTemat', temat);
        automaSetVariable('gmailNadawca', NADAWCA);
      } catch (_) { /* nieistotne */ }
    }

    // 3. Kliknij wiadomość (otwarcie = oznaczenie jako przeczytana),
    //    żeby monitor nie wyzwolił się ponownie od tego samego maila.
    try {
      const r = wiersz.getBoundingClientRect();
      const props = {
        bubbles: true, cancelable: true, composed: true, view: window, button: 0,
        clientX: r.left + r.width / 2,
        clientY: r.top + r.height / 2,
      };
      wiersz.dispatchEvent(new MouseEvent('mousedown', props));
      wiersz.dispatchEvent(new MouseEvent('mouseup', props));
      wiersz.dispatchEvent(new MouseEvent('click', props));
      await czekaj(2000);      // czas na otwarcie (i oznaczenie jako przeczytane)
      history.back();          // powrót do listy — gotowe na następny obieg pętli
      await czekaj(1500);
    } catch (_) { /* nawet jeśli klik zawiódł, i tak zgłoś wykrycie */ }

    // 4. Koniec bloku — workflow idzie do Execute workflow.
    zakoncz({ ok: true, nowy: true, temat, nadawca: NADAWCA });
  } catch (err) {
    zakoncz({ ok: false, nowy: false, error: (err && err.message) || String(err) });
  }
})();
