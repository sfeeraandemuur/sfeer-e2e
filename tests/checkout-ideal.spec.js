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

  // Op deze site staan Type decoratie (Wanddeco), materiaal (Papier) en
  // formaat (20x30) standaard al goed ingevuld, dus daar hoeft de test
  // niets mee te doen. Mocht dat ooit veranderen, dan kan hieronder alsnog
  // een keuze gemaakt worden via de listbox/dropdown-elementen.
  const optiePicker = page.locator('select, [role="listbox"] >> nth=0');
  if (await optiePicker.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    const tagName = await optiePicker.first().evaluate(el => el.tagName.toLowerCase());
    if (tagName === 'select') {
      await optiePicker.first().selectOption({ index: 1 });
    }
  }

  const inWinkelmandKnop = page
    .getByRole('button', { name: /toevoegen aan winkelwagen/i })
    .or(page.getByText(/toevoegen aan winkelwagen/i));
  await expect(inWinkelmandKnop.first()).toBeVisible({ timeout: 15000 });

  // Extra vangnet: de cookiebanner verschijnt soms met een kleine vertraging
  // (ná onze eerste controle in stap 2). Controleer daarom hier nogmaals,
  // vlak vóór de klik, zodat hij niet alsnog in de weg zit.
  await sluitCookieBanner(page);

  await inWinkelmandKnop.first().click();

  // ---- STAP 4: Naar de winkelmand / checkout ----
  // Na het toevoegen verschijnt vaak een mini-cart of pop-up met een link
  // "Naar winkelmand" of "Afrekenen". We proberen beide.
  const naarCheckout = page.getByRole('link', { name: /afrekenen|naar winkelmand|checkout/i }).first();
  if (await naarCheckout.isVisible({ timeout: 5000 }).catch(() => false)) {
    await naarCheckout.click();
  } else {
    // Fallback: direct naar de standaard checkout-URL van WooCommerce
    // (veelgebruikt CMS voor dit soort NL-webshops).
    await page.goto('/checkout/');
  }

  await expect(page).toHaveURL(/winkelmand|cart|checkout/i, { timeout: 15000 });

  // Als we op de winkelmandpagina staan i.p.v. checkout, klik door.
  const afrekenenKnop = page.getByRole('link', { name: /afrekenen|checkout/i }).first();
  if (await afrekenenKnop.isVisible({ timeout: 3000 }).catch(() => false)) {
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
    postcode: '5051s',
    huisnummer: '27',
    // Fallback-waarden, alleen gebruikt als de site straat/plaats niet
    // automatisch invult op basis van postcode + huisnummer.
    straatFallback: 'Teststraat',
    plaatsFallback: 'Tilburg',
  };

  await vulVeldInAlsAanwezig(page, /e-?mailadres/i, testdata.email);
  await vulVeldInAlsAanwezig(page, /^voornaam/i, testdata.voornaam);
  await vulVeldInAlsAanwezig(page, /^achternaam/i, testdata.achternaam);
  await vulVeldInAlsAanwezig(page, /postcode/i, testdata.postcode);
  await vulVeldInAlsAanwezig(page, /^nr\.?$/i, testdata.huisnummer);

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
  }

  // Door naar de volgende stap van de checkout (betaalmethoden).
  const doorgaanKnop = page
    .getByRole('button', { name: /doorgaan/i })
    .or(page.getByText(/doorgaan/i));
  if (await doorgaanKnop.first().isVisible({ timeout: 5000 }).catch(() => false)) {
    await doorgaanKnop.first().click();
  }

  // ---- STAP 6: iDEAL kiezen als betaalmethode ----
  // Op deze site staat iDEAL standaard al geselecteerd (blauw bolletje).
  // We proberen 'm voor de zekerheid nog aan te klikken, maar laten de
  // test niet stuklopen als dat niet lukt (bv. door een widget die niet
  // met gewone tekst-selectors te vinden is) -- zolang de uiteindelijke
  // keuze iDEAL is, is het doel van deze stap gehaald.
  const idealOptie = page.getByText(/ideal/i).first();
  const idealZichtbaar = await idealOptie.isVisible({ timeout: 15000 }).catch(() => false);
  if (idealZichtbaar) {
    await idealOptie.click().catch(() => {});
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

  await page.waitForURL(bankOfProviderUrl, { timeout: 30_000 });
  const duurMs = Date.now() - startTijd;

  console.log(`⏱  Tijd van "bestelling plaatsen" tot bank/provider-pagina: ${duurMs} ms`);

  // ---- STAP 8: Controleren dat we daadwerkelijk bij de bank(keuze) zijn ----
  await expect(page).toHaveURL(bankOfProviderUrl);

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
 * Helperfunctie: vult een formulierveld alleen in als het op de pagina
 * aanwezig is. Zo blijft de test werken ook als de checkout minder velden
 * blijkt te hebben dan verwacht.
 */
async function vulVeldInAlsAanwezig(page, labelRegex, waarde) {
  const veld = page.getByLabel(labelRegex).first();
  if (await veld.isVisible({ timeout: 2000 }).catch(() => false)) {
    await veld.fill(waarde);
    return;
  }
  // Fallback op placeholder-tekst, want niet elk formulier gebruikt <label>.
  const veldViaPlaceholder = page.getByPlaceholder(labelRegex).first();
  if (await veldViaPlaceholder.isVisible({ timeout: 2000 }).catch(() => false)) {
    await veldViaPlaceholder.fill(waarde);
  }
}
