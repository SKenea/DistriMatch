import { defineConfig, devices } from '@playwright/test';

// Mode debug visuel opt-in : PWDEBUG_HEADED=1 ouvre un navigateur visible avec
// ralenti (pour observer un test a l'oeil nu). Par defaut, headless = rapide et
// fiable (le mode headed en arriere-plan rend les clics bottom-nav instables et
// fait exploser le temps de run).
const headed = process.env.PWDEBUG_HEADED === '1';

export default defineConfig({
    testDir: './tests',
    testMatch: '**/*.spec.js',
    timeout: 90000,
    retries: 1,
    use: {
        baseURL: 'http://localhost:8080',
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
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] }
        }
    ]
});
