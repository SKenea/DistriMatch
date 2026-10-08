/**
 * DistriMatch - Configuration centralisee
 *
 * NE STOCKE QUE DES CLES PUBLIQUES.
 * Les secrets (service role key, captcha secret key, SMTP passwords, etc.)
 * doivent rester cote serveur (Supabase dashboard) — JAMAIS ici.
 */

// ============================================
// SUPABASE (cles publiques)
// ============================================

export const SUPABASE_URL = 'https://qtpgdkipweivjxcremsk.supabase.co';

// Anon key : publique par design, protegee par RLS Supabase
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0cGdka2lwd2Vpdmp4Y3JlbXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwOTYwMjUsImV4cCI6MjA5MTY3MjAyNX0.Uz5GhGwJ5CIgoy3n6t6_2g1kE8N35msmeHfpMSFeEuc';

// ============================================
// HCAPTCHA (sitekeys publiques)
// ============================================

// Sitekey de test hCaptcha officielle (accepte partout, y compris localhost)
export const HCAPTCHA_TEST_SITEKEY = '10000000-ffff-ffff-ffff-000000000001';

// Sitekey prod DistriMatch (domaines autorises : skenea.github.io, distrimatch.pages.dev)
export const HCAPTCHA_PROD_SITEKEY = 'ad886e32-4268-4bf4-b3fe-2b36fc528552';

// ============================================
// DOMAINES PROD (pour detection environnement)
// ============================================

export const PROD_HOSTNAMES = ['skenea.github.io', 'distrimatch.pages.dev'];

// ============================================
// FONCTIONNALITES (interrupteurs produit)
// ============================================

// chat : chatbot par distributeur. Inactif depuis 2026-09-20 (decision produit :
// un favori notifie via le centre de notifications, cf. js/favorites-watch.js).
// Le code de js/chat.js est conserve : repasser a true suffit a le reactiver.
// photos : desactivees en V1 (EPIC-T14, Stephane 2026-10-01) : ni bouton Photo, ni
// galerie, ni vignettes, ni photo a l'ajout d'un distributeur. true = tout revient.
export const FEATURES = { chat: false, photos: false };

// Notifications app fermee (EPIC-T25) : cle PUBLIQUE VAPID (la privee est un
// secret de la fonction serveur push-notify, jamais dans le depot).
export const VAPID_PUBLIC_KEY = 'BAyf_Y4xhWwQGtGPnwY61v2hA0rgJjoAQSe3B-7gzIq82cQNjahR__HDhrXthUeqhp7QXc9OOKI6BOTmKoyZ_7o';

// ============================================
// HELPERS
// ============================================

export function isLocalhost() {
    const host = typeof window !== 'undefined' && window.location ? window.location.hostname : '';
    return host === 'localhost' || host === '127.0.0.1' || host === '';
}

export function getHcaptchaSitekey() {
    return isLocalhost() ? HCAPTCHA_TEST_SITEKEY : HCAPTCHA_PROD_SITEKEY;
}
