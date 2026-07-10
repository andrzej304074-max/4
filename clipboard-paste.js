/**
 * clipboard-paste.js
 * -------------------
 * Emulacja wklejania schowka (Ctrl/Cmd + V) w obecnej karcie przeglądarki.
 *
 * Moduł udostępnia dwa poziomy emulacji:
 *   1. Wstawienie tekstu do aktywnego pola (input / textarea / contenteditable)
 *      dokładnie tam, gdzie znajduje się kursor lub zaznaczenie.
 *   2. Wygenerowanie prawdziwego zdarzenia `paste` (ClipboardEvent), aby
 *      aplikacyjne nasłuchiwacze `element.addEventListener('paste', ...)`
 *      zadziałały tak, jakby użytkownik faktycznie wkleił dane.
 *
 * Można wkleić tekst przekazany ręcznie albo odczytany z prawdziwego schowka
 * systemowego przez Clipboard API (wymaga gestu użytkownika i uprawnień).
 *
 * Użycie w przeglądarce:
 *   import { emulatePaste, pasteFromClipboard } from './clipboard-paste.js';
 * lub dołącz plik <script type="module"> i skorzystaj z window.ClipboardPaste.
 */

/**
 * Zwraca element, do którego ma trafić wklejenie.
 * Domyślnie jest to aktualnie aktywny element (fokus).
 * @param {Element} [target]
 * @returns {Element}
 */
function resolveTarget(target) {
  const el = target || document.activeElement;
  if (!el || el === document.body) {
    throw new Error(
      'Brak elementu docelowego. Ustaw fokus na polu tekstowym albo przekaż element jako argument.'
    );
  }
  return el;
}

/**
 * Sprawdza, czy element to klasyczne pole formularza (input/textarea),
 * w którym da się operować na selectionStart / selectionEnd.
 * @param {Element} el
 * @returns {boolean}
 */
function isEditableFormField(el) {
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) {
    return false;
  }
  // Typy input, które faktycznie przyjmują tekst i mają selection API.
  const textLikeTypes = [
    'text', 'search', 'url', 'tel', 'password', 'email', 'number',
  ];
  if (el instanceof HTMLInputElement && !textLikeTypes.includes(el.type)) {
    return false;
  }
  return !el.disabled && !el.readOnly;
}

/**
 * Sprawdza, czy element jest edytowalny jako contenteditable.
 * @param {Element} el
 * @returns {boolean}
 */
function isContentEditable(el) {
  return el instanceof HTMLElement && el.isContentEditable;
}

/**
 * Wstawia tekst do pola input/textarea w miejscu kursora, zastępując
 * aktualne zaznaczenie — dokładnie tak, jak zachowuje się wklejanie.
 * Emituje też zdarzenie `input`, aby frameworki (React/Vue itd.) wykryły zmianę.
 * @param {HTMLInputElement|HTMLTextAreaElement} el
 * @param {string} text
 */
function insertIntoFormField(el, text) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;

  // setRangeText poprawnie obsługuje undo i pozycję kursora tam,
  // gdzie jest dostępne; w razie braku – ręczne sklejenie wartości.
  if (typeof el.setRangeText === 'function') {
    el.setRangeText(text, start, end, 'end');
  } else {
    const value = el.value;
    el.value = value.slice(0, start) + text + value.slice(end);
    const caret = start + text.length;
    el.setSelectionRange(caret, caret);
  }

  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Wstawia tekst do elementu contenteditable w miejscu zaznaczenia.
 * @param {HTMLElement} el
 * @param {string} text
 */
function insertIntoContentEditable(el, text) {
  el.focus();
  const selection = window.getSelection();

  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    // Ustaw kursor za wstawionym tekstem.
    range.setStartAfter(node);
    range.setEndAfter(node);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    el.append(document.createTextNode(text));
  }

  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Buduje obiekt DataTransfer z tekstem, gotowy do włożenia w ClipboardEvent.
 * @param {string} text
 * @returns {DataTransfer}
 */
function buildDataTransfer(text) {
  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  return dt;
}

/**
 * Wysyła syntetyczne zdarzenie `paste` do elementu, tak aby zadziałały
 * aplikacyjne nasłuchiwacze paste. Zwraca informację, czy któryś listener
 * wywołał preventDefault() (czyli sam obsłużył wklejanie).
 *
 * Uwaga: przeglądarki NIE wykonują domyślnej akcji (fizycznego wstawienia)
 * dla zdarzeń tworzonych skryptowo — dlatego wstawienie tekstu robimy sami.
 *
 * @param {Element} el
 * @param {string} text
 * @returns {boolean} true, jeśli zdarzenie NIE zostało anulowane (defaultowo
 *          należy dokonać wstawienia); false, jeśli listener zrobił preventDefault.
 */
function dispatchPasteEvent(el, text) {
  let event;
  try {
    // Ścieżka nowoczesna: konstruktor ClipboardEvent z clipboardData.
    event = new ClipboardEvent('paste', {
      clipboardData: buildDataTransfer(text),
      bubbles: true,
      cancelable: true,
    });
  } catch (_) {
    // Fallback dla starszych/ograniczonych środowisk, gdzie konstruktor
    // ClipboardEvent nie przyjmuje clipboardData.
    event = new Event('paste', { bubbles: true, cancelable: true });
    try {
      Object.defineProperty(event, 'clipboardData', {
        value: buildDataTransfer(text),
      });
    } catch (_) {
      /* w ostateczności zdarzenie poleci bez danych */
    }
  }

  // dispatchEvent zwraca false, gdy wywołano preventDefault().
  return el.dispatchEvent(event);
}

/**
 * Główna funkcja: emuluje wklejenie podanego tekstu w obecnej karcie.
 *
 * Kolejność działania:
 *   1. Wyślij zdarzenie `paste` (żeby zadziałały aplikacyjne listenery).
 *   2. Jeśli żaden listener nie anulował zdarzenia — samodzielnie wstaw tekst
 *      do aktywnego pola (input / textarea / contenteditable).
 *
 * @param {string} text  Tekst do wklejenia.
 * @param {Object} [options]
 * @param {Element} [options.target]        Element docelowy (domyślnie aktywny).
 * @param {boolean} [options.dispatchEvent=true]  Czy wysyłać zdarzenie `paste`.
 * @param {boolean} [options.insert=true]   Czy fizycznie wstawiać tekst.
 * @returns {{ inserted: boolean, defaultPrevented: boolean }}
 */
export function emulatePaste(text, options = {}) {
  const {
    target,
    dispatchEvent = true,
    insert = true,
  } = options;

  if (typeof text !== 'string') {
    throw new TypeError('emulatePaste: „text” musi być łańcuchem znaków.');
  }

  const el = resolveTarget(target);

  let defaultPrevented = false;
  if (dispatchEvent) {
    const notCancelled = dispatchPasteEvent(el, text);
    defaultPrevented = !notCancelled;
  }

  // Jeśli listener sam obsłużył wklejanie (preventDefault) — nie dublujemy.
  let inserted = false;
  if (insert && !defaultPrevented) {
    if (isEditableFormField(el)) {
      insertIntoFormField(el, text);
      inserted = true;
    } else if (isContentEditable(el)) {
      insertIntoContentEditable(el, text);
      inserted = true;
    }
    // Dla innych elementów pozostawiamy obsługę zdarzeniowym listenerom.
  }

  return { inserted, defaultPrevented };
}

/**
 * Emuluje wklejenie danych odczytanych z PRAWDZIWEGO schowka systemowego.
 * Wymaga wywołania w odpowiedzi na gest użytkownika (klik, klawisz) oraz
 * uprawnienia „clipboard-read”. Działa tylko w bezpiecznym kontekście (HTTPS
 * lub localhost).
 *
 * @param {Object} [options]  Te same opcje co emulatePaste (bez „text”).
 * @returns {Promise<{ inserted: boolean, defaultPrevented: boolean, text: string }>}
 */
export async function pasteFromClipboard(options = {}) {
  if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
    throw new Error(
      'Clipboard API nie jest dostępne. Wymagany bezpieczny kontekst (HTTPS/localhost).'
    );
  }

  const text = await navigator.clipboard.readText();
  const result = emulatePaste(text, options);
  return { ...result, text };
}

/**
 * Instaluje globalny skrót: przechwytuje Ctrl/Cmd + V i wykonuje emulację
 * z realnego schowka. Przydatne do testów oraz demonstracji.
 * Zwraca funkcję odpinającą nasłuchiwacz.
 *
 * @param {Object} [options]
 * @param {Element|Document} [options.root=document]  Gdzie nasłuchiwać.
 * @returns {() => void} funkcja usuwająca listener
 */
export function installPasteShortcut(options = {}) {
  const { root = document } = options;

  const handler = async (event) => {
    const isPasteCombo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v';
    if (!isPasteCombo) return;

    event.preventDefault();
    try {
      await pasteFromClipboard({ target: document.activeElement });
    } catch (err) {
      console.warn('[ClipboardPaste] Nie udało się wkleić ze schowka:', err.message);
    }
  };

  root.addEventListener('keydown', handler, true);
  return () => root.removeEventListener('keydown', handler, true);
}

// Wygodny dostęp globalny, gdy plik ładowany jest jako <script type="module">.
if (typeof window !== 'undefined') {
  window.ClipboardPaste = { emulatePaste, pasteFromClipboard, installPasteShortcut };
}
