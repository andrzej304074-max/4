# Emulacja wklejania schowka (clipboard paste)

Lekki moduł JavaScript, który **emuluje wklejanie schowka w obecnej karcie
przeglądarki** — bez żadnych zależności. Wstawia tekst do aktywnego pola
dokładnie w miejscu kursora oraz generuje prawdziwe zdarzenie `paste`, dzięki
czemu reagują na nie także aplikacyjne nasłuchiwacze.

## Pliki

| Plik | Opis |
| --- | --- |
| `clipboard-paste.js` | Moduł ES z funkcjami emulacji (zwykła strona / aplikacja). |
| `automa-paste-simple.js` | Wklejanie ze schowka pod Automę, z **wbudowanym** inteligentnym czekaniem. |
| `automa-clipboard-paste.js` | Rozbudowana wersja pod Automę (stała / zmienna workflow / schowek). |
| `automa-press-enter.js` | Emulacja **Enter** pod Automę, z **wbudowanym** inteligentnym czekaniem. |
| `automa-select-option.js` | Wybór opcji z listy podpowiedzi (autouzupełnianie) przez kliknięcie. |
| `automa-smart-wait.js` | Samodzielny blok inteligentnego czekania (przed blokami natywnymi, np. Click). |
| `index.html` | Strona demonstracyjna do testów w przeglądarce. |

Skrypty akcji (`automa-paste-simple.js`, `automa-press-enter.js`) mają
czekanie **wbudowane**: same czekają, aż strona skończy poprzednie operacje,
i dopiero wykonują akcję — osobne bloki Delay nie są potrzebne. Samodzielny
`automa-smart-wait.js` przydaje się tylko przed blokami natywnymi Automy
(np. Click element); alternatywnie włącz w tych blokach opcję
„Wait for selector”.

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

## Automa — wersja prosta (wklejanie ze schowka)

Jeśli chcesz po prostu wkleić zawartość schowka systemowego:

1. W workflow dodaj blok, który klika w pole docelowe (żeby miało fokus),
   np. **„Event click”** na inpucie.
2. Dodaj blok **„JavaScript Code”** i wklej całą zawartość
   `automa-paste-simple.js`.
3. Opcjonalnie: zamiast klikać w pole, wpisz jego selektor CSS w stałą
   `SELEKTOR` na górze skryptu (np. `'#search'`).

Skrypt czyta `navigator.clipboard.readText()`, wysyła zdarzenie `paste`
i wstawia tekst w miejscu kursora. Do następnego bloku przekazuje
`{ ok: true, text }` albo `{ ok: false, error }`.

## Automa — emulacja klawisza Enter (wersja 2, „mądry” Enter)

Plik `automa-press-enter.js` emuluje Enter w sposób odporny na widżety typu
autouzupełnianie:

1. Dodaj blok **„JavaScript Code”** (np. zaraz po bloku wpisującym tekst)
   i wklej całą zawartość `automa-press-enter.js`.
2. Skonfiguruj stałe na górze:
   - `SELEKTOR` — pole docelowe (puste = aktywny element, także w shadow DOM),
   - `KLAWISZE` — sekwencja, domyślnie `['ArrowDown', 'Enter']`: strzałka
     podświetla pierwszą podpowiedź, Enter ją wybiera. Bez listy podpowiedzi
     ustaw `['Enter']`,
   - `ODSTEP_MS` — pauza między klawiszami (czas na reakcję widżetu),
   - `WYSYLAJ_FORMULARZ` — `true`, by wysłać `<form>`, gdy Enter przeszedł
     bez żadnej reakcji strony.

Jak to działa: każdy klawisz to pełna sekwencja `keydown → keypress → keyup`
z wymuszonymi polami legacy (`keyCode`, `which`, `charCode` — starsze
biblioteki czytają tylko je), a dla pól `contenteditable` dochodzi
`beforeinput`. Gdy strona zignoruje zdarzenie, uruchamia się **plan B**:
skrypt odnajduje w DOM wewnętrzne propsy Reacta (`__reactProps$`) i wywołuje
handler `onKeyDown` bezpośrednio — z obiektem, w którym `isTrusted: true`.

Do następnego bloku trafia `{ ok: true, przebieg: [{ klawisz, obsluzone,
react }] }` — widać, który klawisz strona obsłużyła sama, a który poszedł
przez plan B.

**Granica możliwości:** prawdziwej flagi `isTrusted` w zdarzeniu DOM nie da
się podrobić z poziomu JavaScriptu strony. Jeśli strona twardo jej wymaga,
użyj natywnego bloku Automy **„Press key”** z włączonym **Debug mode**
w ustawieniach workflow — klawisze idą wtedy przez Chrome DevTools Protocol
i są nieodróżnialne od fizycznych.

## Automa — wybór opcji z autouzupełniania

Gdy po wpisaniu tekstu ma się „zaznaczyć opcja" z listy podpowiedzi, emulowany
Enter często zawodzi: widżety autouzupełniania sprawdzają `isTrusted` zdarzeń
klawiatury albo wymagają wcześniejszego podświetlenia opcji. Niezawodne
rozwiązania:

1. **`automa-select-option.js`** — czeka aż lista podpowiedzi się pojawi
   i klika w opcję pełną sekwencją zdarzeń myszy. Skonfiguruj `TEKST_OPCJI`
   (fragment tekstu opcji) albo zostaw puste, by kliknąć pierwszą widoczną.
2. **Natywny blok „Press key" + Debug mode** — w ustawieniach workflow włącz
   *Debug mode*, potem użyj bloku *Press key* (klawisz `ArrowDown`, potem drugi
   z `Enter`). W trybie debug Automa wysyła klawisze przez Chrome DevTools
   Protocol, więc zdarzenia są „prawdziwe" (`isTrusted: true`) i strona nie
   odróżni ich od fizycznych. Chrome pokaże pasek „Automa started debugging
   this browser" — to normalne.

W `automa-press-enter.js` dostępna jest też stała `WYSYLAJ_FORMULARZ = false`,
która wyłącza wysyłanie formularza — przy autouzupełnianiu wysłanie formularza
Enterem jest zwykle niepożądane.

## Automa — inteligentne czekanie (smart wait)

Plik `automa-smart-wait.js` zastępuje sztywne bloki **Delay**: czeka dokładnie
tak długo, aż poprzednie operacje strony się zakończą i następna akcja będzie
możliwa — a potem natychmiast przechodzi dalej. Wstaw go między operacjami:

```
Forms (wpisz tekst) → [smart wait] → Press key Enter → [smart wait] → dalej
```

Sprawdzane warunki (wszystkie naraz, co 100 ms):

1. dokument doładowany (`readyState === 'complete'`),
2. brak widocznych spinnerów/overlayów (typowe selektory albo własny
   w `SELEKTOR_ZNIKNIE`),
3. DOM „ucichł” — brak zmian przez `CISZA_DOM_MS` (domyślnie 500 ms),
4. element dla następnego bloku (`SELEKTOR_NASTEPNY`) istnieje, jest widoczny,
   aktywny (nie `disabled`) i nie przysłania go inny element; w razie potrzeby
   skrypt przewija do niego stronę.

Po przekroczeniu `MAKS_CZEKANIE_MS` (domyślnie 15 s) przechodzi dalej
z `{ ok: false, powod }` — rozgałęzisz to blokiem **Conditions** po
`{{prevBlockData.ok}}`. Przy sukcesie zwraca `{ ok: true, czekalemMs }`,
więc w logach widać, ile realnie czekał.

## Użycie w rozszerzeniu Automa (wersja rozbudowana)

Plik `automa-clipboard-paste.js` jest przygotowany specjalnie pod rozszerzenie
[Automa](https://www.automa.site). W zwykłym module ES (`import`/`export`) Automa
by się nie uruchomiła — dlatego to jeden samodzielny skrypt.

**Jak użyć:**

1. W workflow Automy dodaj blok **„JavaScript Code”** (Wykonaj kod JS).
2. Wklej całą zawartość `automa-clipboard-paste.js` do pola z kodem.
3. Na górze skryptu ustaw konfigurację:
   - `TEXT_TO_PASTE` — stały tekst do wklejenia, albo
   - `VARIABLE_NAME` — nazwa zmiennej Automy z tekstem (np. z wcześniejszego
     bloku „Clipboard” / „Insert data”), albo pozostaw puste, aby spróbować
     odczytać prawdziwy schowek systemowy,
   - `TARGET_SELECTOR` — selektor CSS pola docelowego (puste => aktywny element).
4. Zadbaj, aby wcześniejszy blok ustawił fokus na polu (np. blok „Trigger event” /
   klik) albo podaj `TARGET_SELECTOR`.

**Co zwraca do workflow:** skrypt wywołuje `automaNextBlock({ ok, text, inserted,
defaultPrevented })` oraz zapisuje wynik do zmiennej `pasteResult`. W razie błędu
przekazuje `{ ok: false, error }`, więc możesz go obsłużyć w kolejnym bloku.

Uwaga: kod bloku Automy działa w kontekście strony, więc `navigator.clipboard`
podlega tym samym ograniczeniom co na zwykłej stronie (bezpieczny kontekst,
fokus dokumentu). Jeśli odczyt schowka bywa zawodny w automatyzacji, najpewniej
jest podać tekst przez `TEXT_TO_PASTE` lub zmienną workflow.

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
