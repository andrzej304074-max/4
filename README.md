# Emulacja wklejania schowka (clipboard paste)

Lekki moduł JavaScript, który **emuluje wklejanie schowka w obecnej karcie
przeglądarki** — bez żadnych zależności. Wstawia tekst do aktywnego pola
dokładnie w miejscu kursora oraz generuje prawdziwe zdarzenie `paste`, dzięki
czemu reagują na nie także aplikacyjne nasłuchiwacze.

## Pliki

| Plik | Opis |
| --- | --- |
| `clipboard-paste.js` | Moduł ES z funkcjami emulacji. |
| `index.html` | Strona demonstracyjna do testów w przeglądarce. |

## Szybki start

```html
<script type="module">
  import { emulatePaste, pasteFromClipboard, installPasteShortcut }
    from './clipboard-paste.js';

  // 1. Wklej podany tekst do aktualnie aktywnego pola:
  document.querySelector('#moje-pole').focus();
  emulatePaste('Tekst do wklejenia');

  // 2. Wklej zawartość PRAWDZIWEGO schowka systemowego
  //    (wywołaj w reakcji na klik/klawisz, wymaga HTTPS lub localhost):
  await pasteFromClipboard();

  // 3. Przechwytuj Ctrl/Cmd + V globalnie i emuluj wklejanie:
  const wylacz = installPasteShortcut();
  // ...później: wylacz();
</script>
```

Możesz też dołączyć plik bez `import` — funkcje trafią do `window.ClipboardPaste`.

## API

### `emulatePaste(text, options?) → { inserted, defaultPrevented }`

Emuluje wklejenie łańcucha `text`.

- Wysyła zdarzenie `paste` (`ClipboardEvent` z `clipboardData`), aby zadziałały
  nasłuchiwacze aplikacji.
- Jeśli żaden listener nie wywoła `preventDefault()`, funkcja sama wstawia tekst
  w miejscu kursora — obsługuje `input`, `textarea` oraz `contenteditable`.
- Emituje zdarzenie `input`, więc frameworki (React, Vue, Angular…) wykrywają zmianę.

**Opcje:**

| Opcja | Domyślnie | Znaczenie |
| --- | --- | --- |
| `target` | `document.activeElement` | Element docelowy. |
| `dispatchEvent` | `true` | Czy wysyłać zdarzenie `paste`. |
| `insert` | `true` | Czy fizycznie wstawić tekst. |

### `pasteFromClipboard(options?) → Promise<{ inserted, defaultPrevented, text }>`

Jak `emulatePaste`, ale tekst pobiera z prawdziwego schowka systemowego przez
`navigator.clipboard.readText()`. Wymaga gestu użytkownika, uprawnienia
`clipboard-read` oraz bezpiecznego kontekstu (HTTPS lub `localhost`).

### `installPasteShortcut(options?) → () => void`

Przechwytuje kombinację **Ctrl/Cmd + V** na całej stronie i wykonuje emulację
z realnego schowka. Zwraca funkcję odpinającą nasłuchiwacz.

## Ograniczenia i uwagi

- **Bezpieczeństwo schowka:** przeglądarki celowo ograniczają dostęp do schowka.
  Odczyt (`navigator.clipboard.readText`) działa tylko w bezpiecznym kontekście
  i zwykle wymaga zgody użytkownika oraz aktywnego gestu.
- **Zdarzenia syntetyczne nie wykonują akcji domyślnej:** dispatchowane skryptowo
  zdarzenie `paste` nie wstawi tekstu samodzielnie — dlatego moduł robi to ręcznie.
- **Zasięg:** kod emuluje wklejanie wyłącznie w obrębie własnej karty/strony.
  Nie da się (i nie powinno się dać) sterować schowkiem innych zakładek czy stron.

## Uruchomienie demo lokalnie

```bash
# Dowolny statyczny serwer, np.:
python3 -m http.server 8000
# następnie otwórz http://localhost:8000/
```

Moduły ES wymagają serwowania przez HTTP(S) — otwarcie pliku przez `file://`
zablokuje `import`.
