// playwright.config.js
// Centrale instellingen voor alle tests.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',

  // Eén test tegelijk uitvoeren is prettiger tijdens het leren/debuggen.
  // Zet dit later gerust hoger als je meerdere tests hebt.
  fullyParallel: false,
  workers: 1,

  // Bij een falende test automatisch 1x opnieuw proberen
  // (checkout-flows zijn soms wat traag/onvoorspelbaar).
  retries: 1,

  // Hoe lang een hele test maximaal mag duren.
  timeout: 60_000,

  reporter: [
    ['list'],               // nette output in de terminal
    ['html', { open: 'never' }] // genereert een klikbaar rapport
  ],

  use: {
    baseURL: 'https://www.sfeeraandemuur.nl',

    // Neemt een video op van elke test die faalt -> heel handig om te zien wat er misging.
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Wil je ook in Firefox/Safari testen? Haal onderstaande uit commentaar.
    // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
