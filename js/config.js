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
// HELPERS
// ============================================

export function isLocalhost() {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    return host === 'localhost' || host === '127.0.0.1' || host === '';
}

export function getHcaptchaSitekey() {
    return isLocalhost() ? HCAPTCHA_TEST_SITEKEY : HCAPTCHA_PROD_SITEKEY;
}
