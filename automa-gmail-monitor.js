/**
 * automa-gmail-monitor.js
 * -----------------------
 * Sprawdzenie skrzynki Gmail pod blok „JavaScript Code” w Automie
 * (Execution context: ACTIVE TAB). Część workflow-monitora, który cyklicznie
 * odpytuje Gmaila i uruchamia główny workflow, gdy przyjdzie mail od
 * konkretnego nadawcy.
 *
 * Zakłada, że POPRZEDNI blok (New tab) otworzył Gmaila z wyszukiwaniem:
 *   https://mail.google.com/mail/u/0/#search/from%3AADRES%40gmail.com+is%3Aunread
 * (podmień ADRES%40gmail.com — @ zapisuje się jako %40).
 *
 * Skrypt czeka na załadowanie listy wyników i zwraca:
 *   { ok: true, nowy: true/false, ile: N, temat: '...' }
 * gdzie `nowy` mówi, czy są nieprzeczytane wiadomości pasujące do
 * wyszukiwania. Dalej w workflow: blok Conditions na {{prevBlockData.nowy}}.
 *
 * Selektory Gmaila (stabilne od lat, ale mogą się kiedyś zmienić):
 *   tr.zA       — wiersz wiadomości na liście,
 *   tr.zA.zE    — wiersz NIEPRZECZYTANEJ wiadomości,
 *   span.bog    — temat wiadomości w wierszu.
 */

(async () => {
  /* ====== KONFIGURACJA ====== */
  const MAKS_CZEKANIE_MS = 30000; // Gmail potrafi ładować się długo
  const STABILIZACJA_MS = 1500;   // zapas na dorenderowanie wierszy listy
  const INTERWAL_MS = 250;
  /* ========================== */

  let zakonczono = false;
  const zakoncz = (dane) => {
    if (zakonczono) return;
    zakonczono = true;
    if (typeof automaNextBlock === 'function') automaNextBlock(dane);
    else console.log('[gmail-monitor]', dane);
  };
  setTimeout(() => {
    zakoncz({ ok: false, nowy: false, error: 'watchdog: Gmail nie załadował się w limicie' });
  }, MAKS_CZEKANIE_MS + STABILIZACJA_MS + 3000);

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
        error: 'To nie jest karta Gmaila (' + location.hostname + ') — poprzedni blok ma otworzyć mail.google.com z wyszukiwaniem.',
      });
    }

    const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));

    // 1. Czekaj na główny obszar z listą wiadomości.
    const start = Date.now();
    let main = document.querySelector('div[role="main"]');
    while (!main && Date.now() - start < MAKS_CZEKANIE_MS) {
      if (typeof automaResetTimeout === 'function') {
        try { automaResetTimeout(); } catch (_) { /* nieistotne */ }
      }
      await czekaj(INTERWAL_MS);
      main = document.querySelector('div[role="main"]');
    }
    if (!main) {
      return zakoncz({
        ok: false, nowy: false,
        error: 'Lista wiadomości nie załadowała się — sprawdź, czy jesteś zalogowany do Gmaila.',
      });
    }

    // 2. Chwila na dorenderowanie wierszy (Gmail dokłada je po załadowaniu main).
    await czekaj(STABILIZACJA_MS);

    // 3. Policz nieprzeczytane wiersze w wynikach wyszukiwania.
    const wiersze = Array.prototype.slice.call(main.querySelectorAll('tr.zA.zE'));
    const nowy = wiersze.length > 0;

    let temat = '';
    let nadawca = '';
    if (nowy) {
      try {
        const elTemat = wiersze[0].querySelector('span.bog');
        temat = elTemat ? elTemat.textContent.trim() : '';
        const elNadawca = wiersze[0].querySelector('[email]');
        nadawca = elNadawca ? (elNadawca.getAttribute('email') || '') : '';
      } catch (_) { /* dane pomocnicze — nieistotne przy błędzie */ }
    }

    // Zapisz też do zmiennych workflow, wygodne dla kolejnych bloków.
    if (typeof automaSetVariable === 'function') {
      try {
        automaSetVariable('gmailNowy', nowy);
        automaSetVariable('gmailTemat', temat);
        automaSetVariable('gmailNadawca', nadawca);
      } catch (_) { /* nieistotne */ }
    }

    zakoncz({ ok: true, nowy, ile: wiersze.length, temat, nadawca });
  } catch (err) {
    zakoncz({ ok: false, nowy: false, error: (err && err.message) || String(err) });
  }
})();
