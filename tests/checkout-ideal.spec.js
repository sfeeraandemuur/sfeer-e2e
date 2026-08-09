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
  // Nederlandse webshops gebruiken vaak Cookiebot/OneTrust met tekst als
  // "Alles accepteren" of "Accepteren". We proberen het, maar falen niet
  // als de banner er niet is (bv. bij een herhaalde testrun).
  const cookieButton = page.getByRole('button', { name: /accepteren/i });
  if (await cookieButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await cookieButton.click();
  }

  // ---- STAP 3: Product toevoegen aan winkelmand ----
  // We staan nu al op de productpagina van "Schotse Hooglander", dus we
  // hoeven alleen nog een eventuele formaat/materiaal-keuze te doen en op
  // "In winkelmand" te klikken.

  // Op de productpagina moet meestal nog een formaat/materiaal gekozen
  // worden voordat "In winkelmand" klikbaar is. Dit verschilt per product,
  // dus dit is het eerste stuk dat je met codegen exact wilt vastleggen.
  // Onderstaande probeert een eventuele eerste keuze-optie te selecteren.
  const optiePicker = page.locator('select, [role="listbox"] >> nth=0');
  if (await optiePicker.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    // Voorbeeld voor een <select>-dropdown; pas aan indien nodig.
    const tagName = await optiePicker.first().evaluate(el => el.tagName.toLowerCase());
    if (tagName === 'select') {
      await optiePicker.first().selectOption({ index: 1 });
    }
  }

  const inWinkelmandKnop = page.getByRole('button', { name: /in winkelmand|toevoegen/i });
  await expect(inWinkelmandKnop).toBeVisible({ timeout: 15000 });
  await inWinkelmandKnop.click();

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

  // ---- STAP 5: (Eventueel) contact- en adresgegevens invullen ----
  // Veel checkouts vereisen minimaal e-mail, naam, adres en postcode
  // voordat de betaalopties zichtbaar worden. Vul hier testgegevens in.
  // Pas de veldnamen aan op basis van wat codegen voor jouw site laat zien.
  const testdata = {
    email: 'playwright.test@example.com',
    voornaam: 'Test',
    achternaam: 'Gebruiker',
    straat: 'Teststraat 1',
    postcode: '1234 AB',
    plaats: 'Amsterdam',
    telefoon: '0612345678',
  };

  await vulVeldInAlsAanwezig(page, /e-?mail/i, testdata.email);
  await vulVeldInAlsAanwezig(page, /voornaam/i, testdata.voornaam);
  await vulVeldInAlsAanwezig(page, /achternaam/i, testdata.achternaam);
  await vulVeldInAlsAanwezig(page, /straat|adres/i, testdata.straat);
  await vulVeldInAlsAanwezig(page, /postcode/i, testdata.postcode);
  await vulVeldInAlsAanwezig(page, /plaats|stad/i, testdata.plaats);
  await vulVeldInAlsAanwezig(page, /telefoon/i, testdata.telefoon);

  // ---- STAP 6: iDEAL kiezen als betaalmethode ----
  const idealOptie = page.getByText(/ideal/i).first();
  await expect(idealOptie).toBeVisible({ timeout: 15000 });
  await idealOptie.click();

  // Sommige checkouts tonen daarna een dropdown om je eigen bank alvast
  // te kiezen (bv. ABN AMRO, ING, Rabobank). Dat overslaan we bewust:
  // we willen alleen meten of/hoelang het duurt tot de betaalprovider
  // ons doorstuurt naar de bank-omgeving.

  // ---- STAP 7: Bestelling plaatsen en de tijd meten tot bij de bank ----
  const bestellenKnop = page.getByRole('button', { name: /bestelling plaatsen|betalen|afronden/i });
  await expect(bestellenKnop).toBeVisible({ timeout: 15000 });

  const startTijd = Date.now();
  await bestellenKnop.click();

  // We wachten tot de URL verandert naar een bekende betaalprovider/bank-omgeving.
  // sfeeraandemuur.nl gebruikt vermoedelijk Mollie, Buckaroo, Adyen of MultiSafepay
  // als iDEAL-provider (dit weet ik niet zeker zonder live inspectie -- vul de
  // juiste hier aan zodra je dat via codegen/Network-tab hebt gezien).
  const bankOfProviderUrl = /mollie\.com|buckaroo\.nl|adyen\.com|multisafepay\.com|ideal\.nl|ideal-checkout/i;

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
