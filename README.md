# CAP Bewerbungsportal

## Project Overview

CAP Bewerbungsportal is a full-stack website-building platform built with SAP Cloud Application Programming Model (CAP), Node.js, and SAPUI5/Fiori. It enables administrators to create and maintain web applications on SAP BTP with the appearance and behavior of a conventional public website, without manually coding each page. Pages are assembled visually from reusable and configurable content blocks, while the CAP backend provides persistence, media handling, authorization, and integration services.

The central design idea is to construct an entire website as an ordered composition of independent blocks. Top-level blocks define the main page sections and can be arranged as full-width areas or multi-column rows. Each block can include formatted text, an image, menu items, and a button. Users can configure the properties of each element separately, including its content, dimensions, alignment, position, colors, visual effects, spacing, links, and responsive presentation. Blocks can also be nested inside parent blocks, positioned and sized relative to the parent, and layered above its background and content. This makes it possible to create complex layouts, overlays, cards, banners, navigation areas, and calls to action while keeping every element editable through the visual interface.

The included HR career site is a reference implementation of this platform. It demonstrates how the visual website builder can be used to publish a responsive recruitment website and connect it to a structured application workflow that collects user-entered data, CVs, and supporting documents. The same block-based approach can be adapted to other public websites, campaigns, landing pages, and data-collection scenarios.

The application can run locally with SQLite and mocked authentication or be deployed to SAP BTP Cloud Foundry with SAP HANA and XSUAA-based authorization.

Administrators can build and manage multiple landing pages directly in the browser at `/admin`. They can add new pages, delete pages that are no longer needed, and create a new page by copying all content and blocks from the current page. Each block can contain formatted text, uploaded or generated images, navigation menus, calls to action, custom themes, responsive dimensions, nested content, and anchor-based navigation. Blocks can be reordered, arranged in multi-column layouts, and previewed before changes are saved. From the block properties window, an administrator can also copy the selected block and its content to another existing page. A selected page can be published as the site's home page.

OpenRouter integration allows administrators to generate complete page sections from natural-language prompts. The AI generation workflow supports structured text generation, optional image generation, selectable output languages, editable drafts, and the existing block configuration model. API credentials remain in the CAP backend and are not exposed to the browser.

Candidates use the public application page at `/search` to upload a CV in PDF, DOC, DOCX, ODT, or RTF format. The backend extracts text locally, detects common candidate details, and presents the results in an editable form. Candidates can attach additional documents, provide consent, complete the verification challenge, and submit the application to a configured HR email address. Application status and document metadata are stored in the database, while uploaded file contents are processed in memory and forwarded as email attachments.

Administrative functions are protected by the `ApplicationAdmin` role. On SAP BTP, access is managed through XSUAA role collections, while public landing pages and the candidate application flow remain accessible without authentication.

## Run the CAP Project Locally

### Prerequisites

- Node.js 22.13 or later, or Node.js 24 LTS
- npm

Install the dependencies and create the local configuration file:

```powershell
npm install
Copy-Item .env.example .env
```

Open `.env` and configure at least the HR recipient and one email transport. For a personal Google account, set `APPLICATION_TO_EMAIL`, `MAIL_PROVIDER=gmail`, `GMAIL_USER`, and `GMAIL_APP_PASSWORD`. Add `OPENROUTER_API_KEY` to enable AI-assisted block generation. The `.env` file contains secrets and must not be committed to source control.

Create or update the local SQLite database and start the CAP server:

```powershell
npm run deploy
npm start
```

The following routes are then available:

- Career landing page: <http://localhost:4004/>
- Candidate application form: <http://localhost:4004/search>
- Landing-page administration: <http://localhost:4004/admin>

Local administration uses the mocked user `admin` with the password `admin`. These credentials are available only in the development profile. During active development, use `npm run dev` instead of `npm start` to enable automatic restart when source files change.

## Deploy to SAP BTP Cloud Foundry

### Prerequisites

- Access to an SAP BTP Cloud Foundry organization and space
- Cloud Foundry CLI 8 or later
- Cloud MTA Build Tool (`mbt`)
- Entitlements for SAP HANA Cloud/HDI containers and Authorization and Trust Management (`xsuaa`)

Log in to Cloud Foundry and select the target organization and space:

```powershell
cf login -a https://api.cf.<region>.hana.ondemand.com
cf target -o <organization> -s <space>
```

Build the multitarget application archive and deploy it:

```powershell
mbt build
cf deploy mta_archives/cap-job-application_1.0.0.mtar
```

The deployment creates the CAP service, application router, SAP HANA HDI container, database deployer, and XSUAA service instance. The local `.env` file is not included in the deployment. Configure runtime values for the CAP service through SAP BTP Cockpit under **Applications → cap-job-application-srv → User-Provided Variables**, or with the Cloud Foundry CLI:

```powershell
cf set-env cap-job-application-srv APPLICATION_TO_EMAIL "hr@example.com"
cf set-env cap-job-application-srv MAIL_PROVIDER "gmail"
cf set-env cap-job-application-srv GMAIL_USER "sender@example.com"
cf set-env cap-job-application-srv GMAIL_APP_PASSWORD "<google-app-password>"
cf set-env cap-job-application-srv OPENROUTER_API_KEY "<openrouter-api-key>"
cf set-env cap-job-application-srv OPENROUTER_MODEL "google/gemini-3.1-pro-preview"
cf restage cap-job-application-srv
```

Assign the `HRBewerbung Administrators` role collection to the required users in **SAP BTP Cockpit → Security → Role Collections**. Use `cf app cap-job-application-approuter` to display the public application URL. The public site is available at `/`, the application form at `/search`, and the protected editor at `/admin`.

Ein startfähiges SAP-CAP-Projekt (Node.js 22, CAP 10, SAPUI5), das:

- eine öffentliche, aus konfigurierbaren Inhaltsblöcken aufgebaute Karriereseite bereitstellt;
- Administratoren Bilder, formatierten Text, Buttons und Blockreihenfolge direkt auf der Seite bearbeiten lässt;
- einen Lebenslauf als PDF, DOC, DOCX, ODT oder RTF entgegennimmt;
- Text lokal ausliest und typische Bewerberdaten per Regeln erkennt;
- die erkannten Werte in einer editierbaren UI5-Form anzeigt;
- bis zu fünf zusätzliche PDF-, Word- oder Bilddateien akzeptiert;
- alle Formulardaten und Originaldateien per SMTP versendet;
- Bewerbungsstatus sowie Dokument-Metadaten lokal in SQLite und auf BTP in SAP HANA protokolliert.

Die hochgeladenen Dateiinhalte werden nicht in der Datenbank gespeichert. Sie befinden sich während der Anfrage im Arbeitsspeicher und werden anschließend als E-Mail-Anhänge übergeben.

## Lokal starten

Voraussetzungen: Node.js 22.13+ oder Node.js 24 LTS, npm.

```bash
npm install
cp .env.example .env
# Gmail-Konto, App-Passwort und HR-Empfänger in .env eintragen
npm run deploy
npm start
```

Danach stehen diese Seiten zur Verfügung:

- Karriereseite: <http://localhost:4004/>
- Bewerbungsformular: <http://localhost:4004/search>
- Landingpage-Editor: <http://localhost:4004/admin> (lokal `admin` / `admin`)

Im Editor befindet sich neben dem Administratornamen eine Seitenauswahl. Dort
können Administratoren zwischen Inhaltsseiten wechseln sowie Seiten hinzufügen
oder löschen. Die Startseite kann nicht gelöscht werden. Zusätzliche Seiten werden
über ihren Slug direkt unter `/<slug>` veröffentlicht, beispielsweise `/team`.

Für die Entwicklung mit automatischem Neustart:

```bash
npm run dev
```

## Docker

Zuerst `.env.example` nach `.env` kopieren und konfigurieren, dann:

```bash
docker compose up --build
```

## Wichtige Umgebungsvariablen

| Variable | Bedeutung |
|---|---|
| `MAIL_PROVIDER` | `gmail` für ein persönliches Google-Konto oder `smtp` für einen anderen Server |
| `GMAIL_USER` | Vollständige Gmail-Adresse des sendenden Google-Kontos |
| `GMAIL_APP_PASSWORD` | Separates 16-stelliges Google-App-Passwort, nicht das Kontopasswort |
| `MAIL_FROM_NAME` | Anzeigename des Absenders im Gmail-Modus |
| `SMTP_HOST`, `SMTP_PORT` | SMTP-Server und Port |
| `SMTP_SECURE` | `true` für implizites TLS (typisch Port 465), sonst `false` |
| `SMTP_USER`, `SMTP_PASS` | SMTP-Zugang; optional bei einem internen Relay |
| `MAIL_FROM` | Absenderadresse |
| `MAX_FILE_SIZE_MB` | Maximale Größe je Datei, Standard 10 MB |
| `MAX_ATTACHMENTS` | Maximale Anzahl zusätzlicher Dateien, Standard 5 |

## Versand über ein persönliches Google-Konto

1. Im Google-Konto die Bestätigung in zwei Schritten aktivieren.
2. Unter <https://myaccount.google.com/apppasswords> ein eigenes App-Passwort für das Bewerbungsportal erzeugen.
3. `.env.example` nach `.env` kopieren und die Werte eintragen:

```dotenv
MAIL_PROVIDER=gmail
GMAIL_USER=your.google.account@gmail.com
GMAIL_APP_PASSWORD=your-16-character-app-password
MAIL_FROM_NAME=Bewerbungsportal
```

Das normale Google-Kontopasswort darf nicht in `.env` eingetragen werden. Die Datei `.env` ist bereits durch `.gitignore` vom Commit ausgeschlossen. Nach einer Änderung der Mail-Konfiguration muss der Server neu gestartet werden.

## KI-Generierung von Landingpage-Blöcken

Administratoren können über **KI generieren** in der oberen Seitenleiste neue
Blöcke mit OpenRouter erzeugen. Die Blöcke werden als ungespeicherter Entwurf in
den Bearbeitungsmodus übernommen und erst mit **Speichern** dauerhaft abgelegt.

Für die lokale Entwicklung folgende Werte in `.env` ergänzen:

```dotenv
OPENROUTER_API_KEY=your-openrouter-api-key
OPENROUTER_MODEL=google/gemini-3.1-pro-preview
# Optional für langsame Modelle; Standardwerte sind 180000 bzw. 300000 ms:
# OPENROUTER_TIMEOUT_MS=300000
# OPENROUTER_IMAGE_TIMEOUT_MS=600000
# Bei einem Unternehmensproxy mit eigener Stammzertifizierungsstelle:
OPENROUTER_USE_SYSTEM_CA=true
```

Das Modell kann über `OPENROUTER_MODEL` gewechselt werden. Es muss Structured
Outputs mit JSON Schema unterstützen. Der API-Schlüssel wird ausschließlich im
CAP-Backend verwendet und darf nicht in das UI5-Frontend oder in Git übernommen
werden. Nach Änderungen an `.env` muss der Server neu gestartet werden.
Auf SAP BTP müssen dieselben Werte als geschützte Umgebungsvariablen oder über
einen gebundenen Secret-Service für das `cap-job-application-srv`-Modul gesetzt
werden; die lokale `.env` wird nicht deployt.

Wenn `fetch failed` zusammen mit `SELF_SIGNED_CERT_IN_CHAIN` gemeldet wird,
aktiviert `OPENROUTER_USE_SYSTEM_CA=true` die vertrauenswürdigen Zertifikate des
Betriebssystems. Die TLS-Prüfung bleibt dabei aktiv; sie darf nicht über
`NODE_TLS_REJECT_UNAUTHORIZED=0` abgeschaltet werden.

## API

- `POST /api/resume/analyze` – `multipart/form-data`, Feld `resume` (PDF, DOC, DOCX, ODT oder RTF).
- `POST /api/applications/submit` – Felder `resume`, `attachments` und `fields` (JSON-String).
- `GET /api/health` – einfacher Health Check.
- `/odata/v4/job-applications` – geschützte, nur lesbare CAP-Administration für Metadaten; Rolle `ApplicationAdmin`.
- `GET /odata/v4/landing/Blocks` – öffentliche Inhaltsblöcke der Karriereseite.
- `POST /odata/v4/landing-admin/createPage` – geschütztes Anlegen einer Inhaltsseite.
- `POST /odata/v4/landing-admin/deletePage` – geschütztes Löschen einer Inhaltsseite.
- `POST /odata/v4/landing-admin/generateBlocks` – erzeugt einen bearbeitbaren Blockentwurf über OpenRouter.
- `POST /odata/v4/landing-admin/saveBlocks` – geschütztes Speichern der Blöcke einer Seite; Rolle `ApplicationAdmin`.

## Administratorrolle auf SAP BTP

Beim MTA-Deployment wird eine XSUAA-Instanz mit dem Role Template `ApplicationAdmin`
und der Role Collection `HRBewerbung Administrators (<Org>-<Space>)` angelegt. Die
öffentliche Karriereseite, `/search`, `/odata/v4/landing` und `/api` bleiben ohne Anmeldung erreichbar. Alle anderen
Pfade verlangen am Application Router eine BTP-Anmeldung. Der Zugriff auf
`/odata/v4/job-applications` wird von CAP zusätzlich gegen die Rolle
`ApplicationAdmin` geprüft.

Deployment nach SAP BTP Cloud Foundry:

```bash
mbt build
cf deploy mta_archives/cap-job-application_1.0.0.mtar
```

Danach im SAP BTP Cockpit:

1. `Security` → `Role Collections` öffnen.
2. `HRBewerbung Administrators (<Org>-<Space>)` auswählen.
3. Unter `Users` eine oder mehrere Benutzer-E-Mail-Adressen hinzufügen.
4. Die Benutzer greifen über die Route von `cap-job-application-approuter` auf
   `/admin` auf den Landingpage-Editor und über `/odata/v4/job-applications/` auf
   die Bewerbungsmetadaten zu.

Für lokale Entwicklung existiert der Mock-Benutzer `admin` mit dem Passwort `admin`.
Diese Zugangsdaten gelten ausschließlich außerhalb des Production-Profils.

## Grenzen des Analyse-Prototyps

Die Erkennung ist bewusst lokal und deterministisch. Sie funktioniert bei textbasierten PDFs und benötigt keine externe KI. Gescannte PDFs brauchen zusätzlich OCR. Layouts mit mehreren Spalten können unvollständig erkannt werden. Der Benutzer muss deshalb die Werte vor dem Senden prüfen.

Bei DOC, DOCX, ODT und RTF wird der enthaltene Text lokal extrahiert. Makros und eingebettete Dateien werden nicht ausgeführt. Komplexe Layouts und ältere DOC-Dokumente können unvollständig erkannt werden.

Der Austauschpunkt befindet sich in `srv/lib/resume-analyzer.js`. Dort kann später zum Beispiel SAP AI Core, Document Information Extraction oder ein anderer freigegebener Dienst angebunden werden.

## Vor Produktion ergänzen

- Virenscan für Uploads und gegebenenfalls isolierte Dateiverarbeitung;
- Datenschutztexte, Löschfristen, Auskunfts-/Widerrufsprozess und Audit Logging;
- Queue/Retry-Mechanismus für fehlgeschlagene E-Mails;
- serverseitiges OCR für gescannte PDFs;
- CSRF-/Bot-Schutz passend zum gewählten Anmelde- und Hostingmodell;
- produktives UI5-Hosting statt CDN, falls die Umgebung keinen Internetzugriff erlaubt.

## Tests

```bash
npm test
npm run check
```
