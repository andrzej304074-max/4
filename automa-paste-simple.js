/**
 * automa-paste-simple.js
 * ----------------------
 * NAJPROSTSZA wersja pod blok „JavaScript Code” w Automie:
 * czyta tekst z systemowego schowka i wkleja go w aktywne pole strony.
 *
 * Użycie: wklej całość do bloku „JavaScript Code”. Wcześniejszy blok powinien
 * kliknąć/ustawić fokus na polu docelowym (np. blok „Event click” na input).
 * Jeśli wolisz wskazać pole selektorem, wpisz go w SELEKTOR poniżej.
 */

(async () => {
  const SELEKTOR = ''; // np. '#search' lub 'textarea' — puste = aktywne pole

  if (typeof automaResetTimeout === 'function') automaResetTimeout();

  try {
    // 1. Odczytaj schowek systemowy.
    const text = await navigator.clipboard.readText();

    // 2. Znajdź pole docelowe.
    const el = SELEKTOR
      ? document.querySelector(SELEKTOR)
      : document.activeElement;
    if (!el || el === document.body) {
      throw new Error('Brak pola docelowego — kliknij w pole wcześniejszym blokiem lub ustaw SELEKTOR.');
    }
    el.focus();

    // 3. Wyślij prawdziwe zdarzenie `paste`, żeby strona je zauważyła.
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const notCancelled = el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    );

    // 4. Jeśli strona sama nie obsłużyła wklejenia — wstaw tekst w miejscu kursora.
    if (notCancelled) {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        el.setRangeText(text, start, end, 'end');
        el.dispatchEvent(new Event('input', { bubbles: true }));
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
      }
    }

    automaNextBlock({ ok: true, text });
  } catch (err) {
    automaNextBlock({ ok: false, error: err.message });
  }
})();
