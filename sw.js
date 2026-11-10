// DistriMatch - Service worker LIMITE AUX NOTIFICATIONS (EPIC-T25).
// Aucun cache, aucun gestionnaire fetch : le reseau sert toujours les fichiers
// (versionnes a la main, ?v=N). NOTIF-07 : seuls d'eventuels caches DistriMatch sont effaces.

// NOTIF-07 : le stockage des caches est partage par tous les projets de skenea.github.io
// (meme origine) : on ne touche qu'aux caches nommes distrimatch... ou snackmatch...
// (DistriMatch n'en a jamais cree : purge gardee par prudence).
const OWN_CACHE_PREFIX = /^(distrimatch|snackmatch)/i;

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => OWN_CACHE_PREFIX.test(key)).map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});

// Notification envoyee par la fonction serveur push-notify :
// { title, body, url, tag }
self.addEventListener('push', (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data?.text() || '' }; }
    event.waitUntil(self.registration.showNotification(data.title || 'DistriMatch', {
        body: data.body || '',
        icon: 'images/icon-192.png',
        badge: 'images/icon-192.png',
        tag: data.tag,
        // NOTIF-07 : une nouvelle notification du meme favori remplace l'ancienne ET sonne / vibre.
        // Jamais sans tag : renotify avec un tag vide leve une erreur (notification perdue).
        renotify: Boolean(data.tag),
        data: { url: data.url || './' }
    }));
});

// Toucher la notification ouvre la fiche. NOTIF-07 : un onglet DistriMatch deja ouvert passe
// au premier plan et recoit un message (app.js ouvre la fiche), SANS etre recharge : une saisie
// en cours (ajout, avis, message) est gardee. Aucun onglet controle : nouvelle fenetre.
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = new URL(event.notification.data?.url || './', self.registration.scope);
    const distributorId = target.searchParams.get('id');
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window' });
        const client = windows.find(c => c.url.startsWith(self.registration.scope) && c.frameType !== 'nested');
        if (client) {
            try { await client.focus(); } catch (e) { /* focus refuse : le message part quand meme */ }
            if (distributorId) client.postMessage({ type: 'distrimatch:open', id: distributorId });
            return;
        }
        return self.clients.openWindow(target.href);
    })());
});
