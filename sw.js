// Service Worker désactivé temporairement pour le développement
// Se désinstalle automatiquement
self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', () => {
    self.registration.unregister();
    console.log('Service Worker désinstallé');
});
