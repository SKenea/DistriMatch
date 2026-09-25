import { defineConfig, devices } from '@playwright/test';

// Mode debug visuel opt-in : PWDEBUG_HEADED=1 ouvre un navigateur visible avec
// ralenti (pour observer un test a l'oeil nu). Par defaut, headless = rapide et
// fiable (le mode headed en arriere-plan rend les clics bottom-nav instables et
// fait exploser le temps de run).
const headed = process.env.PWDEBUG_HEADED === '1';

// Deux niveaux de tests navigateur (EPIC-T7) :
//   functional : l'app locale (npx http-server -p 8080 -c-1), serveur simule la
//                ou il le faut -> npm run test:functional
//   e2e        : le site EN LIGNE, vraie base, aucune simulation, sans ecriture
//                -> npm run test:e2e  (E2E_BASE_URL pour viser un autre hote)
export default defineConfig({
    timeout: 90000,
    use: {
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'off',
        headless: !headed,
        launchOptions: {
            slowMo: headed ? 300 : 0
        }
    },
    projects: [
        {
            name: 'functional',
            testDir: './tests/functional',
            testMatch: '**/*.spec.js',
            retries: 1,
            use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:8080' }
        },
        {
            name: 'e2e',
            testDir: './tests/e2e',
            testMatch: '**/*.spec.js',
            retries: 0,
            use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', baseURL: process.env.E2E_BASE_URL || 'https://skenea.github.io/DistriMatch/' }
        }
    ]
});
