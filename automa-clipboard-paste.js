/**
 * automa-clipboard-paste.js
 * -------------------------
 * Emulacja wklejania schowka przygotowana pod BLOK „JavaScript Code”
 * w rozszerzeniu Automa (https://www.automa.site).
 *
 * Różnice względem zwykłej strony:
 *   - Brak import/export — to jeden samodzielny skrypt (wklej całość do bloku).
 *   - Kod działa w kontekście strony (DOM aktywnej karty jest dostępny).
 *   - Zakończenie i asynchroniczność obsługują funkcje Automy:
 *       automaNextBlock(data)  – przejdź do kolejnego bloku (i przekaż dane),
 *       automaResetTimeout()   – zresetuj licznik timeoutu bloku,
 *       automaRefData(k, path) – odczytaj dane z workflow (zmienne, tabela…).
 *
 * ŹRÓDŁO TEKSTU (kolejność priorytetów):
 *   1. Stała TEXT_TO_PASTE poniżej (jeśli ją ustawisz).
 *   2. Zmienna workflow Automy o nazwie z VARIABLE_NAME (np. wcześniejszy blok
 *      „Clipboard” / „Insert data” zapisał tekst do zmiennej).
 *   3. Prawdziwy schowek systemowy (navigator.clipboard.readText) — o ile
 *      przeglądarka na to pozwoli (bezpieczny kontekst + fokus dokumentu).
 *
 * CEL WKLEJENIA:
 *   - Jeśli ustawisz TARGET_SELECTOR — wklejamy do pierwszego pasującego elementu.
 *   - W przeciwnym razie do aktualnie aktywnego elementu (document.activeElement).
 */

(async () => {
  'use strict';

  /* ====== KONFIGURACJA — dostosuj do swojego workflow ====== */
  const TEXT_TO_PASTE = '';            // np. 'Cześć!' — pusty => użyj innych źródeł
  const VARIABLE_NAME = 'clipboard';   // nazwa zmiennej Automy z tekstem
  const TARGET_SELECTOR = '';          // np. '#search', 'textarea' — pusty => aktywny element
  /* ========================================================= */

  const hasAutoma = typeof automaNextBlock === 'function';
  // W blokach asynchronicznych warto odroczyć timeout Automy.
  if (typeof automaResetTimeout === 'function') automaResetTimeout();

  // Bezpieczny odczyt danych z workflow Automy (nie rzuca, gdy brak).
  function refData(keyword, path) {
    try {
      if (typeof automaRefData === 'function') return automaRefData(keyword, path);
    } catch (_) { /* brak danych */ }
    return undefined;
  }

  /** Ustala tekst do wklejenia wg priorytetów opisanych na górze pliku. */
  async function resolveText() {
    if (TEXT_TO_PASTE) return TEXT_TO_PASTE;

    const fromVar = refData('variables', VARIABLE_NAME);
    if (typeof fromVar === 'string' && fromVar.length) return fromVar;

    if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      try {
        return await navigator.clipboard.readText();
      } catch (err) {
        throw new Error('Nie udało się odczytać schowka: ' + err.message);
      }
    }
    throw new Error('Brak tekstu do wklejenia (pusta stała, zmienna i schowek).');
  }

  /** Ustala element docelowy. */
  function resolveTarget() {
    if (TARGET_SELECTOR) {
      const el = document.querySelector(TARGET_SELECTOR);
      if (!el) throw new Error('Nie znaleziono elementu: ' + TARGET_SELECTOR);
      return el;
    }
    const active = document.activeElement;
    if (!active || active === document.body) {
      throw new Error('Brak aktywnego pola. Ustaw TARGET_SELECTOR albo fokus na polu.');
    }
    return active;
  }

  function isFormField(el) {
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return false;
    const textLike = ['text', 'search', 'url', 'tel', 'password', 'email', 'number'];
    if (el instanceof HTMLInputElement && !textLike.includes(el.type)) return false;
    return !el.disabled && !el.readOnly;
  }

  function insertIntoFormField(el, text) {
    el.focus();
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    if (typeof el.setRangeText === 'function') {
      el.setRangeText(text, start, end, 'end');
    } else {
      const v = el.value;
      el.value = v.slice(0, start) + text + v.slice(end);
      const caret = start + text.length;
      el.setSelectionRange(caret, caret);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function insertIntoContentEditable(el, text) {
    el.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.setEndAfter(node);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      el.append(document.createTextNode(text));
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function buildDataTransfer(text) {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    return dt;
  }

  /** Wysyła prawdziwe zdarzenie `paste`; zwraca false, gdy anulowano (preventDefault). */
  function dispatchPaste(el, text) {
    let event;
    try {
      event = new ClipboardEvent('paste', {
        clipboardData: buildDataTransfer(text),
        bubbles: true,
        cancelable: true,
      });
    } catch (_) {
      event = new Event('paste', { bubbles: true, cancelable: true });
      try {
        Object.defineProperty(event, 'clipboardData', { value: buildDataTransfer(text) });
      } catch (_) { /* poleci bez danych */ }
    }
    return el.dispatchEvent(event);
  }

  /** Główna emulacja: zdarzenie paste + fizyczne wstawienie, jeśli nie anulowano. */
  function emulatePaste(text, target) {
    const el = target || resolveTarget();
    const notCancelled = dispatchPaste(el, text);
    let inserted = false;
    if (notCancelled) {
      if (isFormField(el)) { insertIntoFormField(el, text); inserted = true; }
      else if (el instanceof HTMLElement && el.isContentEditable) {
        insertIntoContentEditable(el, text); inserted = true;
      }
    }
    return { inserted, defaultPrevented: !notCancelled, target: el };
  }

  /* ====== Wykonanie ====== */
  try {
    const text = await resolveText();
    const target = resolveTarget();
    const result = emulatePaste(text, target);

    const payload = {
      ok: true,
      text,
      inserted: result.inserted,
      defaultPrevented: result.defaultPrevented,
    };

    // Zapisz też do zmiennej, by kolejne bloki miały wynik pod ręką.
    if (typeof automaSetVariable === 'function') {
      automaSetVariable('pasteResult', payload);
    }
    if (hasAutoma) automaNextBlock(payload);
    else console.log('[Automa emulacja paste] OK:', payload);
  } catch (err) {
    const payload = { ok: false, error: err.message };
    if (hasAutoma) automaNextBlock(payload);   // przekaż błąd dalej (obsłuż w workflow)
    else console.error('[Automa emulacja paste] Błąd:', err.message);
  }
})();
