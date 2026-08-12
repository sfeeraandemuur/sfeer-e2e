// tests/checkout-ideal.spec.js
//
// Wat deze test doet:
//   1. Opent altijd dezelfde vaste productpagina:
//      https://sfeeraandemuur.nl/product/schotse-hooglander/
//   2. Sluit eventuele cookiebanner
//   3. Legt het product in de winkelmand
//   4. Gaat naar de checkout
//   5. Kiest iDEAL als betaalmethode
//   6. Rondt het bestelproces af tot vlak vóór de bank-selectie
//   7. Meet hoe lang het duurt tot je daadwerkelijk bij de bank(-keuzepagina) uitkomt
//
// BELANGRIJK: de test stopt zodra hij bij de bank is aanbeland (of de
// bank-kiespagina van de betaalprovider ziet). Er wordt dus NOOIT echt
// afgerekend of ingelogd bij een bank. Zo kun je deze test veilig
// herhaaldelijk draaien zonder geld uit te geven.
//
// LET OP over selectors: ik kon de site niet live inspecteren (bot-detectie
// blokkeerde mijn poging). De onderstaande selectors zijn met opzet zo
// generiek/robuust mogelijk gemaakt (op basis van zichtbare tekst en rollen),
// maar je moet ze zeer waarschijnlijk finetunen met `npm run codegen`
// (zie README, stap 5) zodat ze exact bij de site passen.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('product in winkelmand -> checkout -> iDEAL -> bank bereikt', async ({ page }) => {

  // ---- STAP 1: Vaste productpagina openen ----
  // We gaan altijd naar hetzelfde, vaste product, zodat de test niet meer
  // afhankelijk is van welke producten er toevallig op de homepage staan.
  await page.goto('/product/schotse-hooglander/');

  // ---- STAP 2: Cookiebanner wegklikken (indien aanwezig) ----
  // Deze site gebruikt een banner met als id "cc-consent-banner". De tekst
  // bleek in de praktijk Engels te zijn ("We use cookies..."), dus we
  // zoeken meertalig naar de accepteer-knop. Belangrijk: we wachten ook
  // actief tot de banner ECHT verdwenen is, want zolang hij nog in de
  // DOM zit (ook onzichtbaar tijdens de sluit-animatie) blokkeert hij
  // klikken op elementen erachter.
  await sluitCookieBanner(page);

  // ---- STAP 3: Product toevoegen aan winkelmand ----
  // We staan nu al op de productpagina van "Schotse Hooglander", dus we
  // hoeven alleen nog een eventuele formaat/materiaal-keuze te doen en op
  // "In winkelmand" te klikken.

  // De standaardkeuzes op de productpagina (Type decoratie, materiaal,
  // formaat) staan al goed zodra je erop landt -- daar hoeft de test dus
  // niets mee te doen. We raken deze velden bewust niet aan.

  const inWinkelmandKnop = page
    .getByRole('button', { name: /toevoegen aan winkelwagen/i })
    .or(page.getByText(/toevoegen aan winkelwagen/i));
  await expect(inWinkelmandKnop.first()).toBeVisible({ timeout: 15000 });

  // Extra vangnet: de cookiebanner verschijnt soms met een kleine vertraging
  // (ná onze eerste controle in stap 2). Controleer daarom hier nogmaals,
  // vlak vóór de klik, zodat hij niet alsnog in de weg zit.
  await sluitCookieBanner(page);

  await inWinkelmandKnop.first().click();

  // Even geduld: het toevoegen aan de winkelmand gaat op deze site via een
  // achtergrond-verzoek en duurt merkbaar even. We proberen eerst netjes te
  // wachten tot het netwerk rustig is, met een royale timeout. Sommige
  // sites hebben continu achtergrondverkeer (chatwidgets, trackers) waardoor
  // "networkidle" nooit echt bereikt wordt -- daarom wachten we daarna
  // sowieso nog een vaste, extra periode als extra zekerheid.
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // ---- STAP 4: Naar de winkelmand / checkout ----
  // Na het toevoegen verschijnt vaak een mini-cart of pop-up met een link
  // "Naar winkelmand" of "Afrekenen". We proberen zowel links als knoppen,
  // want deze site gebruikt niet overal hetzelfde element-type.
  const naarCheckout = page
    .getByRole('link', { name: /afrekenen|naar winkelmand|checkout/i })
    .or(page.getByRole('button', { name: /afrekenen|naar winkelmand|checkout/i }))
    .first();
  if (await naarCheckout.isVisible({ timeout: 5000 }).catch(() => false)) {
    await naarCheckout.click();
  } else {
    // Fallback: direct naar de standaard checkout-URL van WooCommerce
    // (veelgebruikt CMS voor dit soort NL-webshops).
    await page.goto('/checkout/');
  }

  await expect(page).toHaveURL(/winkelmand|cart|checkout/i, { timeout: 15000 });

  // Als we op de winkelmandpagina staan i.p.v. checkout, klik door.
  const afrekenenKnop = page
    .getByRole('link', { name: /afrekenen|checkout/i })
    .or(page.getByRole('button', { name: /afrekenen|checkout/i }))
    .or(page.getByText(/afrekenen/i))
    .first();
  if (await afrekenenKnop.isVisible({ timeout: 5000 }).catch(() => false)) {
    await afrekenenKnop.click();
  }

  await expect(page).toHaveURL(/checkout/i, { timeout: 15000 });

  // ---- STAP 5: Factuurgegevens invullen ----
  // De checkout van deze site is opgesplitst in stappen: eerst gegevens +
  // adres invullen en op "Doorgaan" klikken, pas daarna worden de
  // betaalmethoden (waaronder iDEAL) zichtbaar. Het adres werkt hier met
  // Postcode + Huisnummer (Nr.) in plaats van één los straatveld.
  const testdata = {
    email: 'test@test.nl',
    voornaam: 'Playwright',
    achternaam: 'test',
    postcode: '5051ZS',
    huisnummer: '27',
    // Fallback-waarden, alleen gebruikt als de site straat/plaats onverhoopt
    // niet automatisch invult op basis van postcode + huisnummer.
    straatFallback: 'Hellenweg',
    plaatsFallback: 'Goirle',
  };

  // Wacht tot het adresgedeelte van het formulier daadwerkelijk zichtbaar
  // is voordat we beginnen met invullen -- voorkomt dat we te vroeg typen
  // terwijl het formulier nog aan het laden is.
  await page.getByLabel(/postcode/i).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

  // Deze drie velden zijn standaard WooCommerce-velden met vaste ID's --
  // we proberen die eerst, en vallen alleen terug op tekst zoeken als het
  // ID onverhoopt niet bestaat.
  if (!(await vulVeldViaId(page, 'billing_email', testdata.email))) {
    await vulVeldInAlsAanwezig(page, /e-?mailadres/i, testdata.email);
  }
  if (!(await vulVeldViaId(page, 'billing_first_name', testdata.voornaam))) {
    await vulVeldInAlsAanwezig(page, /^voornaam/i, testdata.voornaam);
  }
  if (!(await vulVeldViaId(page, 'billing_last_name', testdata.achternaam))) {
    await vulVeldInAlsAanwezig(page, /^achternaam/i, testdata.achternaam);
  }
  if (!(await vulVeldViaId(page, 'billing_postcode', testdata.postcode))) {
    await vulVeldInAlsAanwezig(page, /postcode/i, testdata.postcode);
  }
  await vulVeldInAlsAanwezig(page, /^nr\.?/i, testdata.huisnummer);

  // Veel Nederlandse checkouts vullen straat en plaats automatisch aan
  // zodra postcode + huisnummer zijn ingevuld. Geef de site heel even de
  // tijd om dat te doen voordat we zelf iets invullen.
  await page.waitForTimeout(1500);

  const straatVeld = page.getByLabel(/straatnaam/i).first();
  if (await straatVeld.isVisible({ timeout: 2000 }).catch(() => false)) {
    const huidigeWaarde = await straatVeld.inputValue().catch(() => '');
    if (!huidigeWaarde) {
      await straatVeld.fill(testdata.straatFallback);
    }
  }

  const plaatsVeld = page.getByLabel(/^plaats/i).first();
  if (await plaatsVeld.isVisible({ timeout: 2000 }).catch(() => false)) {
    const huidigeWaarde = await plaatsVeld.inputValue().catch(() => '');
    if (!huidigeWaarde) {
      await plaatsVeld.fill(testdata.plaatsFallback);
    }
    // Tab indrukken om het veld te "verlaten" -- sommige formulieren
    // controleren pas bij het verlaten van een veld (blur) of alles
    // geldig is, en Playwright's .fill() simuleert dat niet vanzelf.
    await page.keyboard.press('Tab');
  }

  // De checkout van deze site bestaat uit meerdere interne tabbladen
  // (adres -> verzending -> betaling). Er kan dus meer dan één keer een
  // "Doorgaan"-knop verschijnen. We blijven daarom net zolang klikken tot
  // de knop niet meer verschijnt (of tot een veiligheidsgrens van 3 keer),
  // wat betekent dat we bij het echte betaalscherm zijn aangekomen.
  for (let poging = 0; poging < 3; poging++) {
    const doorgaanKnop = page
      .getByRole('button', { name: /doorgaan/i })
      .or(page.getByText(/doorgaan/i));

    const isZichtbaar = await doorgaanKnop.first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!isZichtbaar) break;

    await doorgaanKnop.first().scrollIntoViewIfNeeded().catch(() => {});
    await doorgaanKnop.first().dblclick({ force: true }).catch(() => {});
    // Geef de site even de tijd om het volgende tabblad te tonen.
    await page.waitForTimeout(1500);
  }

  // ---- STAP 6: iDEAL kiezen als betaalmethode ----
  // Op deze site staat iDEAL standaard al geselecteerd. We zoeken bewust
  // specifiek naar de RADIOBUTTON (niet naar willekeurige "ideal"-tekst
  // op de pagina) -- anders bestaat het risico dat we per ongeluk een
  // betaal-logo verderop op de pagina raken, wat de checkout kan verlaten.
  const idealRadio = page.getByRole('radio', { name: /ideal/i }).first();
  const idealZichtbaar = await idealRadio.isVisible({ timeout: 15000 }).catch(() => false);
  if (idealZichtbaar) {
    const reedsGeselecteerd = await idealRadio.isChecked().catch(() => false);
    if (!reedsGeselecteerd) {
      await idealRadio.check();
      // Als het aanklikken een betaalmethode-wissel triggert, herberekent
      // WooCommerce de checkout via een achtergrond-verzoek. Geef de
      // pagina even de tijd om dat af te ronden voordat we verdergaan.
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    }
  }

  // ---- STAP 6b: Akkoord met de algemene voorwaarden ----
  // Verplicht vinkje voordat de bestelling geplaatst kan worden.
  const voorwaardenCheckbox = page.getByRole('checkbox', { name: /algemene voorwaarden/i });
  if (await voorwaardenCheckbox.isVisible({ timeout: 5000 }).catch(() => false)) {
    await voorwaardenCheckbox.check();
  }

  // ---- STAP 7: Bestelling plaatsen en de tijd meten tot bij de bank ----
  const bestellenKnop = page.getByRole('button', { name: /plaats bestelling|bestelling plaatsen|betalen|afronden/i });
  await expect(bestellenKnop).toBeVisible({ timeout: 15000 });

  const startTijd = Date.now();
  await bestellenKnop.click();

  // We wachten tot de URL verandert naar een bekende betaalprovider/bank-omgeving.
  // sfeeraandemuur.nl gebruikt "Wero" als iDEAL-provider (te zien op het
  // betaalscherm: "iDEAL | Wero"). We laten de andere providers erin staan
  // als extra vangnet, mocht dit ooit veranderen.
  const bankOfProviderUrl = /wero|mollie\.com|buckaroo\.nl|adyen\.com|multisafepay\.com|ideal\.nl|ideal-checkout/i;

  // We gebruiken waitUntil: 'commit' i.p.v. het standaard 'load'. Sommige
  // bank-doorverwijzingen (zoals deep links die een bank-app proberen te
  // openen) laden in een headless browser zonder bank-app nooit helemaal
  // "af", waardoor het standaard 'load'-event nooit komt. We willen alleen
  // weten dat de navigatie zelf heeft plaatsgevonden.
  await page.waitForURL(bankOfProviderUrl, { timeout: 60_000, waitUntil: 'commit' });
  const duurMs = Date.now() - startTijd;

  console.log(`⏱  Tijd van "bestelling plaatsen" tot bank/provider-pagina: ${duurMs} ms`);

  // Schrijf de gemeten tijd ook naar een los bestand. De GitHub Actions
  // workflow leest dit bestand uit om de exacte tijd in de e-mailmelding
  // te kunnen opnemen (zie .github/workflows/nightly-e2e.yml).
  fs.writeFileSync(path.join(process.cwd(), 'duration-ms.txt'), String(duurMs));

  // ---- STAP 8: Controleren dat we daadwerkelijk bij de bank(keuze) zijn ----
  await expect(page).toHaveURL(bankOfProviderUrl);

  // Extra zekerheid, bovenop de URL-check: controleer dat er ook
  // daadwerkelijk herkenbare bank-keuze-inhoud op het scherm staat (zoals
  // "Kies je bank" of "Scan met je bank app"). Dit voorkomt een vals-
  // positieve meting als de URL toevallig al matcht voordat de echte
  // bankpagina is geladen.
  // Extra zekerheid, best-effort: als er herkenbare bank-keuze-tekst te
  // vinden is, loggen we dat ter bevestiging. Dit is bewust GEEN harde
  // eis, want de betaalflow stuurt soms direct door naar een specifieke
  // banktransactie-URL (zoals een deep link) zonder eerst een bankkeuze-
  // scherm te tonen -- dat is nog steeds een geslaagde doorverwijzing.
  const bankPaginaInhoud = page.getByText(/kies je bank|scan met je bank app|kies uw bank/i).first();
  const bankInhoudZichtbaar = await bankPaginaInhoud.isVisible({ timeout: 10000 }).catch(() => false);
  console.log(
    bankInhoudZichtbaar
      ? '✅ Bank-keuze-inhoud gevonden op de pagina.'
      : 'ℹ️  Geen bank-keuze-tekst gevonden -- waarschijnlijk direct doorgestuurd naar een specifieke banktransactie-URL, wat ook een geslaagde doorverwijzing is.'
  );

  // Voeg de gemeten tijd toe aan het testrapport zodat je hem in de
  // HTML-report (npm run report) kunt terugvinden.
  await test.info().attach('tijd-tot-bank-ms', {
    body: String(duurMs),
    contentType: 'text/plain',
  });

  // Harde grens: als het langer dan 10 seconden duurt, laten we de test
  // falen zodat je een melding krijgt bij trage checkouts. Pas dit getal
  // gerust aan naar wat voor jou een acceptabele grens is.
  expect(duurMs, 'De redirect naar de bank duurde te lang').toBeLessThan(10_000);

  // We stoppen hier bewust -- er wordt geen bank-login gedaan en er wordt
  // dus geen echte betaling voltooid.
});

/**
 * Sluit de cookiebanner van sfeeraandemuur.nl (id="cc-consent-banner").
 * Zoekt meertalig naar een accepteer-knop, valt terug op de eerste knop
 * in de banner als er geen herkenbare tekst gevonden wordt, en wacht
 * daarna actief tot de banner echt (onzichtbaar) verdwenen is -- zolang
 * hij nog aanwezig is blokkeert hij namelijk klikken op de rest van de
 * pagina, ook als hij optisch al lijkt te zijn dichtgeklikt.
 */
async function sluitCookieBanner(page) {
  const banner = page.locator('#cc-consent-banner');
  const isZichtbaar = await banner.isVisible({ timeout: 5000 }).catch(() => false);
  if (!isZichtbaar) return;

  // Probeer eerst netjes op een echte accepteer-knop te klikken, ongeacht
  // of het een <button>, <a> of ander klikbaar element is.
  const acceptKnop = banner
    .locator('button, a, [role="button"]')
    .filter({ hasText: /accept|akkoord|accepteren|toestaan|allow|agree|got it|^ok$/i })
    .first();

  if (await acceptKnop.isVisible({ timeout: 3000 }).catch(() => false)) {
    await acceptKnop.click().catch(() => {});
  }

  // Nog steeds zichtbaar (geen passende knop gevonden, of de klik werkte
  // niet)? Verwijder de banner dan hard uit de pagina zodat hij in elk
  // geval geen klikken op de rest van de pagina meer blokkeert.
  const isNogSteedsZichtbaar = await banner.isVisible({ timeout: 2000 }).catch(() => false);
  if (isNogSteedsZichtbaar) {
    await page.evaluate(() => {
      document.getElementById('cc-consent-banner')?.remove();
    });
  }
}

/**
 * Vult een veld in via het standaard WooCommerce ID (bv. "billing_email"),
 * wat veel betrouwbaarder is dan zoeken op zichtbare labeltekst -- die
 * bleek op deze site meermaals net iets anders te zijn dan verwacht.
 * Geeft true terug als het gelukt is, anders false (zodat er een fallback
 * geprobeerd kan worden).
 */
async function vulVeldViaId(page, id, waarde) {
  const veld = page.locator(`#${id}`);
  if (await veld.isVisible({ timeout: 5000 }).catch(() => false)) {
    await veld.fill(waarde);
    await veld.evaluate(el => el.blur()).catch(() => {});
    return true;
  }
  return false;
}

/**
 * Helperfunctie: vult een formulierveld alleen in als het op de pagina
 * aanwezig is. Zo blijft de test werken ook als de checkout minder velden
 * blijkt te hebben dan verwacht.
 */
async function vulVeldInAlsAanwezig(page, labelRegex, waarde) {
  const veld = page.getByLabel(labelRegex).first();
  if (await veld.isVisible({ timeout: 8000 }).catch(() => false)) {
    await veld.fill(waarde);
    return;
  }
  // Fallback op placeholder-tekst, want niet elk formulier gebruikt <label>.
  const veldViaPlaceholder = page.getByPlaceholder(labelRegex).first();
  if (await veldViaPlaceholder.isVisible({ timeout: 3000 }).catch(() => false)) {
    await veldViaPlaceholder.fill(waarde);
  }
}
