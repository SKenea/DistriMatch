/**
 * DistriMatch - Authentification Magic Link
 * Email obligatoire pour toute interaction (ecriture).
 * Lectures restent anonymes.
 */

import { supabaseClient } from './state.js';
import { showToast, escapeHTML } from './utils.js';
import { getHcaptchaSitekey } from './config.js';

// ============================================
// ETAT AUTH
// ============================================

let currentUser = null;
const authListeners = [];

export function getCurrentUser() {
    return currentUser;
}

export function isAuthenticated() {
    return currentUser !== null && !currentUser.is_anonymous;
}

export function onAuthChange(fn) {
    authListeners.push(fn);
}

function notifyAuthChange() {
    authListeners.forEach(fn => {
        try { fn(currentUser); } catch (e) { console.error(e); }
    });
}

// ============================================
// INIT - ECOUTE LES CHANGEMENTS DE SESSION
// ============================================

export async function initAuth() {
    if (!supabaseClient) return null;

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        currentUser = session?.user || null;

        supabaseClient.auth.onAuthStateChange((event, session) => {
            currentUser = session?.user || null;
            console.log('[Auth] Event:', event, 'User:', currentUser?.email || 'anonyme/null');

            if (event === 'SIGNED_IN' && !currentUser?.is_anonymous) {
                showToast(`Connecte avec ${currentUser.email}`, 'success');
            }
            if (event === 'SIGNED_OUT') {
                showToast('Deconnecte', 'default');
            }

            notifyAuthChange();
        });

        return currentUser;
    } catch (e) {
        console.warn('[Auth] initAuth echoue:', e.message);
        return null;
    }
}

// ============================================
// MAGIC LINK
// ============================================

export async function sendMagicLink(email, captchaToken) {
    if (!supabaseClient) throw new Error('Supabase indisponible');
    if (!captchaToken) throw new Error('Captcha requis');

    const { error } = await supabaseClient.auth.signInWithOtp({
        email,
        options: {
            emailRedirectTo: window.location.origin + window.location.pathname,
            captchaToken
        }
    });

    if (error) throw error;
    return true;
}

// ============================================
// DECONNEXION
// ============================================

export async function signOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    currentUser = null;
    notifyAuthChange();
}

// ============================================
// REQUIRE AUTH : WRAPPER POUR PROTEGER LES ACTIONS
// ============================================

/**
 * Verifie que l'user est authentifie avant d'executer l'action.
 * Si non, ouvre le modal email et retourne false.
 * @returns {Promise<boolean>} true si authentifie, false sinon
 */
export async function requireAuth() {
    if (isAuthenticated()) return true;

    return new Promise((resolve) => {
        openEmailModal((success) => resolve(success));
    });
}

// ============================================
// MODAL EMAIL
// ============================================

let modalOpen = false;

function openEmailModal(onClose) {
    if (modalOpen) return;
    modalOpen = true;

    const overlay = document.createElement('div');
    overlay.className = 'auth-modal-overlay';
    overlay.innerHTML = `
        <div class="auth-modal">
            <button class="auth-modal-close" aria-label="Fermer">×</button>
            <div class="auth-modal-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                </svg>
            </div>
            <h2>Ton email pour interagir</h2>
            <p class="auth-modal-subtitle">Pour ajouter, modifier ou suivre un distributeur, on a besoin de ton email. Pas de mot de passe, juste un lien a cliquer.</p>
            <form class="auth-modal-form">
                <input type="email" placeholder="ton@email.com" required autofocus>
                <div class="h-captcha" data-sitekey="${getHcaptchaSitekey()}" data-callback="onHcaptchaSuccess" data-expired-callback="onHcaptchaExpired"></div>
                <button type="submit" class="auth-modal-submit" disabled>Recevoir le lien</button>
            </form>
            <p class="auth-modal-status" style="display:none"></p>
        </div>
    `;

    document.body.appendChild(overlay);

    // Rendu explicite du widget hCaptcha si deja charge
    let captchaWidgetId = null;
    let captchaToken = null;

    const tryRenderHcaptcha = () => {
        const captchaEl = overlay.querySelector('.h-captcha');
        if (window.hcaptcha && captchaEl && !captchaEl.dataset.rendered) {
            try {
                captchaWidgetId = window.hcaptcha.render(captchaEl, {
                    sitekey: getHcaptchaSitekey(),
                    callback: (token) => {
                        captchaToken = token;
                        submit.disabled = false;
                    },
                    'expired-callback': () => {
                        captchaToken = null;
                        submit.disabled = true;
                    },
                    'error-callback': () => {
                        captchaToken = null;
                        submit.disabled = true;
                        status.style.display = 'block';
                        status.className = 'auth-modal-status error';
                        status.textContent = 'Erreur captcha, reessaie.';
                    }
                });
                captchaEl.dataset.rendered = 'true';
            } catch (e) {
                console.warn('[Auth] hCaptcha render echoue:', e.message);
            }
        }
    };

    // Attendre que hCaptcha soit charge
    if (window.hcaptcha) {
        tryRenderHcaptcha();
    } else {
        const interval = setInterval(() => {
            if (window.hcaptcha) {
                clearInterval(interval);
                tryRenderHcaptcha();
            }
        }, 200);
        // Timeout au bout de 10s
        setTimeout(() => clearInterval(interval), 10000);
    }

    const close = (success = false) => {
        modalOpen = false;
        if (captchaWidgetId !== null && window.hcaptcha) {
            try { window.hcaptcha.reset(captchaWidgetId); } catch (e) {}
        }
        overlay.remove();
        onClose(success);
    };

    overlay.querySelector('.auth-modal-close').addEventListener('click', () => close(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });

    const form = overlay.querySelector('form');
    const input = overlay.querySelector('input[type=email]');
    const submit = overlay.querySelector('.auth-modal-submit');
    const status = overlay.querySelector('.auth-modal-status');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = input.value.trim();
        if (!email) return;
        if (!captchaToken) {
            status.style.display = 'block';
            status.className = 'auth-modal-status error';
            status.textContent = 'Merci de valider le captcha avant de continuer.';
            return;
        }

        submit.disabled = true;
        submit.textContent = 'Envoi...';
        status.style.display = 'none';

        try {
            await sendMagicLink(email, captchaToken);
            status.style.display = 'block';
            status.className = 'auth-modal-status success';
            status.innerHTML = `Lien envoye a <strong>${escapeHTML(email)}</strong>.<br>Consulte ta boite mail et clique sur le lien pour te connecter.`;
            submit.style.display = 'none';
            input.disabled = true;
        } catch (err) {
            status.style.display = 'block';
            status.className = 'auth-modal-status error';
            status.textContent = `Erreur : ${err.message}`;
            // Reset captcha pour permettre une nouvelle tentative
            if (captchaWidgetId !== null && window.hcaptcha) {
                try { window.hcaptcha.reset(captchaWidgetId); } catch (e) {}
            }
            captchaToken = null;
            submit.disabled = true;
            submit.textContent = 'Recevoir le lien';
        }
    });

    // Si l'user clique deja sur le lien dans son email et revient, on ferme automatiquement
    onAuthChange((user) => {
        if (user && !user.is_anonymous && modalOpen) {
            close(true);
        }
    });
}
