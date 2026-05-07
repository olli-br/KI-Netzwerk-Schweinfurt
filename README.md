# Ki Netzwerk Schweinfurt

Offizielle **statische Website** des Ki Netzwerks Schweinfurt — Vernetzung von Unternehmen, Bildung, Verwaltung und Community rund um praxisnahe KI in der Region Mainfranken.

Inhalte kommen aus **JSON-Dateien** unter `data/` (Events, Blog, mehrsprachige Seitentexte). Es gibt **kein Build-Tool** und **keine Datenbank**; Pflege erfolgt durch Bearbeiten der Dateien.

| | |
|--|--|
| **Version** | 0.1.0 (Beta) |
| **Entwicklung** | seit April 2026 |
| **Entwickler** | Oliver Braun — [github.com/olli-br](https://github.com/olli-br) |

---

## Inhalt

1. [Schnellstart](#schnellstart)
2. [Datenstruktur](#datenstruktur)
3. [Metadaten in Dateien](#metadaten-in-dateien)
4. [Neues Event](#neues-event)
5. [Neuer Blogbeitrag](#neuer-blogbeitrag)
6. [Seitentexte & UI-Strings](#seitentexte--ui-strings)
7. [Schema: Event](#schema-event)
8. [Schema: Blog](#schema-blog)
9. [Konventionen](#konventionen)
10. [Projektdateien](#projektdateien)
11. [Deployment](#deployment)

---

## Schnellstart

Zum lokalen Testen im **Projektroot** einen einfachen HTTP-Server starten, damit `fetch` für HTML-Partials und JSON zuverlässig funktioniert:

```bash
cd /pfad/zu/KI_Netzwerk_Schweinfurt
python3 -m http.server 8000
```

Im Browser: `http://localhost:8000` — Start über `index.html`.

---

## Datenstruktur

| Bereich | Pfad | Zweck |
|--------|------|--------|
| **Events (Inhalte)** | `data/event/events/*.json` | Einzelne Veranstaltungen |
| **Event-Liste** | `data/event/index.json` | Dateinamen der Event-JSONs (`files`) |
| **Events-UI** | `data/event/events-page.json` | Überschriften, Filter, Event-Detail-Labels (DE/EN) |
| **Blog (Beiträge)** | `data/blog/posts/*.json` | Einzelne Artikel |
| **Blog-Liste** | `data/blog/index.json` | Dateinamen der Post-JSONs (`files`) |
| **Blog-UI** | `data/blog/blog-page.json` | Überschriften, Liste, Detail (DE/EN) |
| **Startseite** | `data/start/start-page.json` | Hero & Start-Texte (`home.*` in der App) |
| **Über uns** | `data/about/about-page.json` | About-Texte, Chips, Partner |
| **Vorlagen** | `data/demo-files/` | Leere Schemas zum Kopieren (`*-entry.empty.json`) |

Die App lädt u. a.:

- `./data/event/index.json` → danach je `./data/event/events/<name>`
- `./data/blog/index.json` → danach je `./data/blog/posts/<name>`
- `./data/event/events-page.json`, `./data/blog/blog-page.json`, `./data/start/start-page.json`, `./data/about/about-page.json`

**Technik:** Vanilla JavaScript (`assets/js/main.js`), Übersetzungs-Fallbacks in `assets/js/i18n.js`, Layout in `assets/css/styles.css`. HTML-Fragmente unter `components/` werden per `fetch` eingebunden und für Karten/Templates genutzt.

---

## Metadaten in Dateien

Zur **Nachverfolgung und Pflege** tragen alle relevanten Quell- und Datendateien einheitliche Metadaten:

| Art | Inhalt (oben in der Datei) |
|-----|-----------------------------|
| **HTML** (`*.html`, `components/*.html`) | HTML-Kommentar: Projekt, **Seite**, **Projekt-Pfad**, Beschreibung, Version, Update-Historie, Urheberhinweis |
| **CSS / JS** | Blockkommentar: Projekt, **Datei**, **Seite/Rolle**, **Projekt-Pfad**, Version, Historie |
| **JSON** unter `data/` | Root-Objekt **`_meta`**: u. a. `project`, `pageName`, `pathInProject`, `developedBy`, `github`, `developmentStart`, `currentVersion`, `updateHistory` |

**Wichtig:** `_meta` wird von der **Laufzeit-Logik nicht ausgewertet** — die Seite nutzt weiterhin Felder wie `files`, `title`, `slug`, `id` usw. Du kannst `_meta` bei neuen Einträgen aus einer Vorlage kopieren und **Datum / Beschreibung in `updateHistory`** anpassen, ohne die Funktion der Website zu beeinträchtigen.

---

## Neues Event

1. Eine Datei aus `data/event/events/` kopieren (z. B. `event-ai-in-practice.json`).
2. Neuen Dateinamen vergeben, z. B. `event-mein-thema.json` (nur Kleinbuchstaben, Zahlen, Bindestrich).
3. JSON anpassen: `id`, `date`, `title`, `location`, `geo`, `detail`, … (siehe [Schema: Event](#schema-event)); **`_meta`** bei Bedarf aktualisieren (`pageName`, `pathInProject`, `updateHistory`).
4. Dateinamen in `data/event/index.json` unter `"files"` **ergänzen** (Reihenfolge = Anzeige-Reihenfolge).

Alternativ: `data/demo-files/event-entry.empty.json` als Startpunkt.

**Sichtbar:** Startseite (Kalender, Karten, Countdown-Leiste), `events.html` (Liste & Detail), DE/EN über Sprachumschaltung.

---

## Neuer Blogbeitrag

1. Eine Datei aus `data/blog/posts/` kopieren (z. B. `post-erstes-treffen.json`).
2. Neuen Dateinamen vergeben, z. B. `post-mein-artikel.json`.
3. JSON anpassen: `slug` muss zur URL passen (`blog.html?post=<slug>`), siehe [Schema: Blog](#schema-blog); **`_meta`** bei Bedarf anpassen.
4. Dateinamen in `data/blog/index.json` unter `"files"` **ergänzen**.

Alternativ: `data/demo-files/post-entry.empty.json` als Startpunkt.

**Sichtbar:** Startseite (neueste Beiträge), `blog.html` (Liste & Detail), DE/EN.

---

## Seitentexte & UI-Strings

| Datei | Inhalt |
|-------|--------|
| `data/start/start-page.json` | Startseite (dynamische Keys für `home.*` in der Logik) |
| `data/about/about-page.json` | Über uns: Hero, Treffenbeschreibung (`meetingBody` mit `\n\n` für Absätze), Teilnehmer- und Partner-Chips als Arrays von `{ "de", "en" }` |
| `data/event/events-page.json` | Events-Seite: Titel, Filter, Badges, Buttons im Detail |
| `data/blog/blog-page.json` | Blog: Titel, „Weiterlesen“, Lesezeit-Suffix für Fallback, Zurück-Link |

Struktur: pro sichtbarem Text meist Objekte mit `"de"` und `"en"`.

---

## Schema: Event

| Feld | Typ | Pflicht | Hinweis |
|------|-----|---------|---------|
| `id` | Zahl oder String | ja | eindeutig |
| `date` | String (ISO) | ja | z. B. `2026-06-15T18:00:00` |
| `image` | String | ja | z. B. `./assets/images/event-1.svg` |
| `link` | String | ja | Anmeldung / externe Seite |
| `title` | `{ de, en }` | ja | |
| `location` | Objekt | ja | `venue` { de, en }, `street`, `postalCode`, `city` |
| `geo` | `{ lat, lng }` | ja | für Karten-Einbettung / Links |
| `detail.description` | `{ de, en }` | ja | Kurztext / Karte |
| `detail.content` | `{ de, en }` | ja | Markdown für die Detailseite |
| `recapLink` | String | nein | z. B. für vergangene Events |

---

## Schema: Blog

| Feld | Typ | Pflicht | Hinweis |
|------|-----|---------|---------|
| `id` | String | ja | eindeutig |
| `slug` | String | ja | URL-Parameter `?post=` |
| `date` | String (ISO) | ja | Sortierung & Anzeige |
| `image` | String | ja | |
| `title` | `{ de, en }` | ja | |
| `teaser` | `{ de, en }` | ja | Vorschau in der Karte |
| `detail.content` | `{ de, en }` | ja | Markdown im Artikel |
| `readTime` | `{ de, en }` | empfohlen | z. B. `3 Min Lesezeit` / `3 min read` |

**Lesezeit:** Fehlt `readTime` oder ist er leer, schätzt die Seite die Dauer aus Teaser + Fließtext und nutzt den Text aus `blog-page.json` unter `list.readTime` (Einheit DE/EN).

---

## Konventionen

- **Keine doppelten** `id` (Events) bzw. `id` / `slug` (Blog).
- **Dateinamen:** nur `a-z`, `0-9`, Bindestrich; Endung `.json`.
- **Sprache:** überall dort, wo es vorkommt, `de` und `en` parallel pflegen.
- **`_meta` / Dateiköpfe:** bei inhaltlich größeren Änderungen `updateHistory` (JSON) bzw. die Update-Zeile in den Kommentaren (HTML/CSS/JS) ergänzen — einheitlich mit Datum und Kurzbeschreibung.

---

## Projektdateien

```
KI_Netzwerk_Schweinfurt/
├── index.html              # Startseite
├── events.html             # Events (Liste & Detail)
├── blog.html               # Blog (Liste & Detail)
├── about.html              # Über uns
├── README.md
├── assets/
│   ├── css/styles.css      # Designsystem & Seitenlayout
│   ├── js/main.js        # Daten, Kalender, Blog, Events, Sprache, Theme
│   ├── js/i18n.js        # Statische UI-Strings DE/EN
│   └── images/           # SVGs, Fotos für Events/Blog
├── components/
│   ├── header.html
│   ├── footer.html
│   ├── event-card.html     # Template für Event-Karten
│   └── blog-card.html      # Template für Blog-Karten
└── data/
    ├── start/start-page.json
    ├── about/about-page.json
    ├── event/index.json
    ├── event/events-page.json
    ├── event/events/*.json
    ├── blog/index.json
    ├── blog/blog-page.json
    ├── blog/posts/*.json
    └── demo-files/         # Leere Vorlagen
```

---

## Deployment

Dieselbe **reine Static-Site**-Logik eignet sich für **GitHub Pages** oder jeden statischen Host: Root = Webroot, keine Server-API nötig. Wichtig ist, dass Pfade zu JSON und `components/` weiterhin per `fetch` erreichbar sind (gleiche relative Struktur wie lokal).

---

*Projekt eigenständig entwickelt. Code gerne zum Lernen nutzen — bitte die Attribution in den Dateiköpfen und in `_meta` respektieren.*
