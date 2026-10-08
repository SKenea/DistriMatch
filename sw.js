// DistriMatch - Service worker LIMITE AUX NOTIFICATIONS (EPIC-T25).
// Aucun cache, aucun gestionnaire fetch : le reseau sert toujours les fichiers
// (versionnes a la main, ?v=N). L'ancien service worker a cache est efface.

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
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
        data: { url: data.url || './' }
    }));
});

// Toucher la notification ouvre la fiche (reutilise un onglet deja ouvert).
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = new URL(event.notification.data?.url || './', self.registration.scope).href;
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of windows) {
            if (client.url.startsWith(self.registration.scope) && 'navigate' in client) {
                await client.focus();
                return client.navigate(target);
            }
        }
        return self.clients.openWindow(target);
    })());
});
