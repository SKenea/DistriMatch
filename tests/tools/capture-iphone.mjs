/**
 * DistriMatch - Capture d'ecran iPhone 13 (WebKit) d'un ecran de l'app locale.
 *
 * Sert aux fiches docs/stories/ (captures « avant » / « apres » d'une correction).
 * Prerequis : serveur local sur http://localhost:8080 (npx http-server -p 8080 -c-1 -s).
 *
 *   node tests/tools/capture-iphone.mjs <nom> [ecran]
 *   ex. node tests/tools/capture-iphone.mjs BUG-01-avant favoris-menu
 *
 * Image : test-results/captures/<nom>.png (dossier ignore par git).
 * Les appels Supabase sont reels en lecture, la mesure (log_event) est interceptee
 * par setupApp, comme dans les tests fonctionnels.
 */
import { webkit, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setupApp, openDistModal } from '../functional/helpers.js';

const SCREENS = {
    carte: async () => {},
    favoris: async (page) => {
        await page.click('.bottom-nav [data-tab="favorites"]');
        await page.waitForSelector('#subscriptions-view.view-active');
    },
    'favoris-menu': async (page) => {
        await SCREENS.favoris(page);
        await page.click('#profile-avatar-btn');
        await page.waitForSelector('#profile-menu:not([hidden])');
    },
    fiche: async (page) => {
        await openDistModal(page, 0);
    },
    recherche: async (page) => {
        await page.click('#search-toggle');
        await page.waitForSelector('#search-results .search-item-clean');
    },
    compte: async (page) => {
        await page.click('#profile-avatar-btn');
        await page.click('#profile-menu [data-action="account"]');
        await page.waitForSelector('#account-view.view-active');
    },
};

async function main() {
    const [name, screen = 'carte'] = process.argv.slice(2);
    if (!name || !SCREENS[screen]) {
        console.error(`Usage : node tests/tools/capture-iphone.mjs <nom> [${Object.keys(SCREENS).join('|')}]`);
        process.exit(1);
    }
    mkdirSync('test-results/captures', { recursive: true });
    const browser = await webkit.launch();
    try {
        const context = await browser.newContext({ ...devices['iPhone 13'] });
        const page = await context.newPage();
        await setupApp(page, context);
        await SCREENS[screen](page);
        await page.waitForTimeout(500); // fin des transitions
        const path = `test-results/captures/${name}.png`;
        await page.screenshot({ path });
        console.log(path);
    } finally {
        await browser.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
