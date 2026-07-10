/**
 * automa-press-enter.js
 * ---------------------
 * Emulacja wciśnięcia klawisza ENTER pod blok „JavaScript Code” w Automie.
 *
 * Wysyła pełną sekwencję zdarzeń klawiatury (keydown → keypress → keyup)
 * z klawiszem Enter na wskazanym/aktywnym elemencie, żeby zareagowały
 * nasłuchiwacze strony (np. wyszukiwarki, czaty, formularze SPA).
 *
 * Ponieważ zdarzenia tworzone skryptowo NIE wykonują akcji domyślnej
 * przeglądarki, skrypt dodatkowo — jeśli strona sama nie obsłużyła Entera:
 *   - dla pola w <form>  → wysyła formularz (requestSubmit, z walidacją),
 *   - dla textarea / contenteditable → wstawia nową linię w miejscu kursora.
 *
 * Użycie: wklej całość do bloku „JavaScript Code”. Pole docelowe wskaż
 * selektorem w SELEKTOR albo zostaw puste i kliknij pole wcześniejszym blokiem.
 */

(async () => {
  const SELEKTOR = '';        // np. '#search' — puste = aktywne pole
  const WSTAW_NOWA_LINIE = true; // false = nigdy nie wstawiaj \n (tylko zdarzenia + submit)

  if (typeof automaResetTimeout === 'function') automaResetTimeout();

  try {
    const el = SELEKTOR
      ? document.querySelector(SELEKTOR)
      : document.activeElement;
    if (!el || el === document.body) {
      throw new Error('Brak elementu docelowego — ustaw SELEKTOR lub kliknij pole wcześniejszym blokiem.');
    }
    el.focus();

    // Pełne parametry Entera; keyCode/which dodane dla starszych bibliotek.
    const props = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
      composed: true,
    };

    // Sekwencja jak przy prawdziwym wciśnięciu klawisza.
    const keydownOk = el.dispatchEvent(new KeyboardEvent('keydown', props));
    el.dispatchEvent(new KeyboardEvent('keypress', props));
    el.dispatchEvent(new KeyboardEvent('keyup', props));

    // Jeśli strona anulowała keydown (preventDefault), sama obsłużyła Enter.
    let action = 'events-only';
    if (keydownOk) {
      const isTextInput = el instanceof HTMLInputElement;
      const isTextarea = el instanceof HTMLTextAreaElement;

      if (isTextInput && el.form) {
        // Enter w polu formularza = wysłanie formularza.
        if (typeof el.form.requestSubmit === 'function') el.form.requestSubmit();
        else el.form.submit();
        action = 'form-submitted';
      } else if (WSTAW_NOWA_LINIE && isTextarea) {
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        el.setRangeText('\n', start, end, 'end');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        action = 'newline-inserted';
      } else if (WSTAW_NOWA_LINIE && el.isContentEditable) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const br = document.createElement('br');
          range.insertNode(br);
          range.setStartAfter(br);
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          el.append(document.createElement('br'));
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        action = 'newline-inserted';
      }
    } else {
      action = 'handled-by-page';
    }

    automaNextBlock({ ok: true, action });
  } catch (err) {
    automaNextBlock({ ok: false, error: err.message });
  }
})();
