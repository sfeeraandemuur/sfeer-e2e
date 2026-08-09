# E2E-test: sfeeraandemuur.nl — winkelmand + iDEAL checkout

Deze test is 100% gratis. Playwright is open-source software (gemaakt door
Microsoft) en vereist **geen account, geen aanmelding en geen betaling**.
Je installeert het lokaal, net als elk ander npm-pakketje.

## Wat heb je nodig?

- Een computer (Windows, Mac of Linux)
- [Node.js](https://nodejs.org) (gratis) — download de LTS-versie en installeer die
  gewoon door op "Volgende" te klikken.

Dat is alles. Geen Playwright-account, geen credit card.

## Stap 1 — Controleer of Node.js is geïnstalleerd

Open een terminal (Windows: "Terminal" of "PowerShell", Mac: "Terminal") en typ:

```bash
node -v
npm -v
```

Zie je versienummers (bv. `v20.11.0`)? Dan is het goed. Zie je een foutmelding?
Installeer dan eerst Node.js via de link hierboven.

## Stap 2 — Projectmap openen

Pak de map `sfeer-e2e` (die ik voor je heb aangemaakt) uit ergens op je
computer, bijvoorbeeld op je Bureaublad. Ga er in de terminal naartoe:

```bash
cd pad/naar/sfeer-e2e
```

## Stap 3 — Playwright installeren

```bash
npm install
```

Dit installeert het Playwright test-framework zelf (staat al klaar in
`package.json`). Dit is de enige "installatie" die nodig is — geen account.

Daarna moet Playwright nog de echte browsers downloaden (Chrome, Firefox,
Safari-motor) die het gebruikt om de site te bezoeken:

```bash
npx playwright install
```

Dit downloadt eenmalig een paar honderd MB aan browsers naar je eigen
computer. Ook dit is gratis en vereist geen account.

## Stap 4 — De test uitvoeren

```bash
npm test
```

Playwright opent (onzichtbaar, op de achtergrond) een Chrome-browser, gaat
naar sfeeraandemuur.nl, legt een product in de winkelmand, doorloopt de
checkout, kiest iDEAL en meet hoe lang het duurt tot je bij de
bank/betaalprovider uitkomt.

Wil je het proces ZIEN gebeuren (browser echt in beeld)?

```bash
npm run test:headed
```

## Stap 5 — Selectors afstemmen op de echte site (belangrijk!)

Ik kon de site niet automatisch inspecteren vanuit mijn eigen omgeving
(de site blokkeert bots), dus de test in `tests/checkout-ideal.spec.js`
gebruikt bewust brede, op tekst gebaseerde selectors ("klik op de knop met
tekst 'In winkelmand'", etc.). Die werken waarschijnlijk, maar niet
gegarandeerd 100%.

De betrouwbaarste manier om dit te controleren en te verbeteren, is
Playwright's ingebouwde recorder gebruiken. Die tekent automatisch de
exacte, correcte selectors op terwijl jij gewoon met je muis door de
site klikt:

```bash
npm run codegen
```

Er opent een browservenster + een apart "Playwright Inspector"-venster.
Klik zelf door het hele proces heen: product kiezen → in winkelmand →
afrekenen → gegevens invullen → iDEAL kiezen → bestellen. In het
Inspector-venster verschijnt live de bijbehorende testcode. Die code kun je
kopiëren en de gegenereerde selectors gebruiken om de regels in
`tests/checkout-ideal.spec.js` te vervangen door de exacte versies.

**Let op:** stop met klikken vóórdat je daadwerkelijk bij je bank inlogt —
je wilt geen echte betaling voltooien tijdens het opnemen.

## Stap 6 — Het testrapport bekijken

Na een testrun (geslaagd of gefaald) genereert Playwright een uitgebreid,
klikbaar HTML-rapport met screenshots, video en — in dit geval — de
gemeten tijd tot de bank-pagina:

```bash
npm run report
```

Dit opent automatisch een pagina in je browser met alle details.

## Wat de test WEL en NIET doet

✅ Legt een echt product in de winkelmand
✅ Doorloopt de checkout met testgegevens
✅ Kiest iDEAL
✅ Meet de tijd tussen "bestelling plaatsen" en het bereiken van de
   bank/betaalprovider-pagina
✅ Faalt automatisch als dat langer dan 10 seconden duurt (pas dit getal
   aan in `tests/checkout-ideal.spec.js` naar wens)

❌ Rondt de betaling NIET echt af — er wordt nergens ingelogd bij een bank
   en er wordt dus geen geld afgeschreven. De test stopt zodra de
   bank/provider-pagina bereikt is.

## Stap 7 — De test 's nachts automatisch laten draaien (ook als je pc uitstaat)

Hiervoor gebruik je **GitHub Actions**: een gratis cloud-computer van GitHub
die volgens een tijdschema jouw test uitvoert, op een server van GitHub —
jouw eigen laptop hoeft dus niet aan te staan. Dit kost niets: publieke
repositories krijgen onbeperkte gratis minuten, en ook privé-repositories
krijgen een ruime gratis maandelijkse hoeveelheid.

Het bestand `.github/workflows/nightly-e2e.yml` (al voor je klaargezet)
regelt dit volledig. Zo activeer je het:

### 7.1 — Gratis GitHub-account aanmaken

Ga naar [github.com](https://github.com) en maak een gratis account aan
(alleen een e-mailadres nodig, geen betaalgegevens).

### 7.2 — Nieuwe repository aanmaken

Klik rechtsboven op **+** → **New repository**. Geef hem een naam, bv.
`sfeer-e2e`. Laat "Public" of "Private" staan naar keuze (Public = gratis
onbeperkte minuten, makkelijkst om mee te beginnen). Klik **Create
repository**.

### 7.3 — Jouw projectmap uploaden

In de terminal, vanuit de `sfeer-e2e`-map:

```bash
git init
git add .
git commit -m "Eerste versie van de e2e-test"
git branch -M main
git remote add origin https://github.com/JOUW-GEBRUIKERSNAAM/sfeer-e2e.git
git push -u origin main
```

(Heb je nog nooit git gebruikt? Installeer het gratis via
[git-scm.com](https://git-scm.com), en GitHub vraagt bij de eerste `push`
om in te loggen — dat hoeft maar één keer.)

### 7.4 — Klaar — de nachtelijke run is nu actief

Zodra het bestand `.github/workflows/nightly-e2e.yml` in je repository
staat, activeert GitHub automatisch het schema. Standaard draait de test
elke nacht om 01:00 UTC (dat is 02:00 of 03:00 Nederlandse tijd, afhankelijk
van winter-/zomertijd). Wil je een ander tijdstip? Pas de regel
`- cron: '0 1 * * *'` in dat bestand aan (formaat: minuut uur dag maand
weekdag, altijd in UTC).

### 7.5 — Testen zonder een hele nacht te wachten

Ga op GitHub naar het tabblad **Actions** van je repository → kies
"Nachtelijke E2E-test sfeeraandemuur.nl" → klik **Run workflow**. Zo kun je
meteen zien of alles werkt.

### 7.6 — Resultaten en meldingen bekijken

- **Bij een falende test** stuurt GitHub automatisch een e-mail naar het
  adres van je GitHub-account — je hoeft hier niks voor in te stellen.
- Onder **Actions** → de betreffende run → **Artifacts**, vind je het
  volledige HTML-testrapport (met screenshots, video en de gemeten tijd
  tot de bank-pagina) terug, ook van runs die 's nachts zonder toezicht
  zijn gedraaid.

## Veelvoorkomende problemen

- **"Timeout" fout bij een stap** → De site-structuur wijkt af van wat de
  test verwacht. Gebruik `npm run codegen` (stap 5) om de juiste selector
  te vinden en pas die regel aan in het testbestand.
- **Cookiebanner blokkeert alles** → Controleer met `npm run test:headed`
  wat de exacte knoptekst van de cookiebanner is en pas de regex in de
  test aan.
- **Weet niet welke betaalprovider (Mollie/Buckaroo/Adyen/etc.) gebruikt
  wordt** → Klik in `npm run codegen` door tot na het kiezen van iDEAL en
  kijk naar de URL in de adresbalk; vul die domeinnaam aan in de regex
  `bankOfProviderUrl` in het testbestand.
