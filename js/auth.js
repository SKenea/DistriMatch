/**
 * DistriMatch - Authentification Magic Link
 *
 * Politique d'authentification : voir CLAUDE.md > "Politique d'authentification"
 * pour la matrice complete des 10 use cases. Regle structurante : auth
 * obligatoire des qu'une ecriture impacte les autres utilisateurs (contributions
 * publiques) ; libre pour ce qui n'affecte que son propre appareil (favoris,
 * prefs notifs, suivi produits, chat). Lectures toujours anonymes.
 */

import { supabaseClient, AppState } from './state.js';
import { showToast, escapeHTML, describeAuthError } from './utils.js';
import { getHcaptchaSitekey, isLocalhost, SUPABASE_URL } from './config.js';
import { activateFocusTrap, deactivateFocusTrap } from './focus-trap.js';
import { isStandalone, forgetPushAccount } from './push.js';
import { pushLayer, popLayer } from './history.js';

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

// Renvoie de quoi retirer l'ecouteur (CNX-02 : une fenetre de connexion fermee ne
// reagit plus a la connexion suivante)
export function onAuthChange(fn) {
    authListeners.push(fn);
    return () => {
        const i = authListeners.indexOf(fn);
        if (i !== -1) authListeners.splice(i, 1);
    };
}

function notifyAuthChange() {
    // Copie : un ecouteur qui se retire pendant la boucle ne fait pas sauter le suivant
    authListeners.slice().forEach(fn => {
        try { fn(currentUser); } catch (e) { console.error(e); }
    });
}

// Tests e2e UNIQUEMENT (localhost) : simuler un compte connecte, le magic link
// ne pouvant pas aboutir en local. Aucun effet en prod (isLocalhost). Les
// appels Supabase restent anonymes : seule l'interface change.
if (typeof window !== 'undefined' && isLocalhost()) {
    window.__testLogin = () => {
        currentUser = { id: '00000000-0000-0000-0000-00000000e2e0', email: 'e2e@localhost', is_anonymous: false };
        notifyAuthChange();
    };
    window.__testLogout = () => {
        currentUser = null;
        notifyAuthChange();
    };
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
            // CNX-05 : supabase-js reemet SIGNED_IN au retour sur l'onglet et TOKEN_REFRESHED
            // toutes les heures. La session est gardee a jour, mais l'app (toast, fiche, avis,
            // formulaires) n'est prevenue que si le compte change : sinon une saisie en cours
            // etait effacee et le toast revenait a chaque retour dans l'app.
            const previousId = currentUser?.id ?? null;
            currentUser = session?.user || null;
            const nextId = currentUser?.id ?? null;
            console.log('[Auth] Event:', event, 'User:', currentUser?.email || 'anonyme/null');
            if (previousId === nextId) return;
            if (nextId && !currentUser.is_anonymous) showToast(`Connecté avec ${currentUser.email}`, 'success');
            if (!nextId) showToast('Déconnecté', 'default');
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
    if (!isLocalhost() && !captchaToken) throw new Error('Captcha requis');

    const options = {
        emailRedirectTo: window.location.origin + window.location.pathname
    };
    // Sur localhost, on n'envoie pas de captchaToken (Supabase peut etre
    // configure pour ne pas exiger captcha en dev). En prod, le token est requis.
    if (captchaToken) {
        options.captchaToken = captchaToken;
    }

    const { error } = await supabaseClient.auth.signInWithOtp({ email, options });

    if (error) throw error;
    rememberLoginReturn();
    return true;
}

// Code recu par e-mail (BUG-05) : la session nait dans l'app ou on le saisit.
// Indispensable dans l'app de l'ecran d'accueil sur iPhone : le lien ouvrirait Safari.
export async function verifyEmailCode(email, token) {
    if (!supabaseClient) throw new Error('Supabase indisponible');
    const { error } = await supabaseClient.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
    // Connecte sur place, la fiche est deja ouverte : rien a rouvrir au prochain lancement
    try { localStorage.removeItem(LOGIN_RETURN_KEY); } catch (e) { /* stockage bloque */ }
    return true;
}

// Erreur du code en francais (Supabase repond en anglais)
function describeCodeError(err) {
    if (err?.status === 429) return 'Trop d’essais d’affilée : réessaie dans quelques minutes.';
    if (!err?.status || err.status >= 500) return 'Connexion impossible pour le moment : vérifie ton réseau et réessaie.';
    return 'Code incorrect ou expiré. Vérifie les chiffres, ou ferme cette fenêtre pour recevoir un nouveau code.';
}

// CNX-08 : script hCaptcha pas encore la au bout de 10 s (reseau lent, bloqueur)
const CAPTCHA_SLOW_TEXT = 'Le contrôle anti-robot ne s’est pas chargé : vérifie ta connexion ou ton bloqueur de publicités, puis patiente un instant.';

// ============================================
// RETOUR SUR LA FICHE APRES CONNEXION (Stephane 2026-10-17)
// ============================================
// Le lien recu par e-mail ramene a l'adresse de base du site (seule adresse de
// retour autorisee chez Supabase) : sans ceci, on revenait sur l'accueil. La
// fiche ouverte au moment de la demande est retenue sur l'appareil (1 h) et
// rouverte au retour, comme un lien partage (?id=).
export const LOGIN_RETURN_KEY = 'distrimatch_login_return';
const LOGIN_RETURN_TTL = 60 * 60 * 1000;

// Fiche en cours : ouverte, ou fermee il y a moins d'une minute (sur telephone,
// toucher le menu du profil ferme la fiche avant d'ouvrir la connexion).
const RECENT_FICHE_MS = 60 * 1000;

function rememberLoginReturn() {
    const ficheOpen = document.getElementById('dist-modal-overlay')?.classList.contains('active');
    const recent = AppState.lastClosedFiche;
    const id = ficheOpen
        ? AppState.currentDistributor?.id
        : (recent && Date.now() - recent.at < RECENT_FICHE_MS ? recent.id : null);
    try {
        if (id) localStorage.setItem(LOGIN_RETURN_KEY, JSON.stringify({ id, at: Date.now() }));
        else localStorage.removeItem(LOGIN_RETURN_KEY);
    } catch (e) { /* stockage bloque : on reviendra sur l'accueil */ }
}

// Fiche a rouvrir au retour du lien de connexion (une seule fois), ou null.
export function takeLoginReturn(now = Date.now()) {
    try {
        const raw = localStorage.getItem(LOGIN_RETURN_KEY);
        if (!raw) return null;
        localStorage.removeItem(LOGIN_RETURN_KEY);
        const { id, at } = JSON.parse(raw);
        return id && now - at < LOGIN_RETURN_TTL ? String(id) : null;
    } catch (e) {
        return null;
    }
}

// ============================================
// DECONNEXION
// ============================================

// Cle de la session de supabase-js sur cet appareil (meme calcul que tests/e2e/session.mjs)
const SESSION_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

export async function signOut() {
    if (!supabaseClient) return;
    // PRIV-06 : l'abonnement aux notifications quitte le compte AVANT la fin de session ;
    // la synchronisation qui suit la deconnexion le recree sans compte (push.js)
    await forgetPushAccount();
    let error = null;
    try {
        ({ error } = await supabaseClient.auth.signOut());
    } catch (e) {
        error = e;
    }
    if (error) {
        // PRIV-06 : sans reseau, supabase-js garde la session sur l'appareil (elle revenait
        // au lancement suivant) : on l'efface ici. Elle reste ouverte cote serveur jusqu'a
        // son expiration, mais plus rien ne la porte sur ce telephone.
        console.warn('[Auth] Deconnexion sans reponse du serveur, session effacee sur cet appareil :', error?.message || error);
        try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch (e) { /* stockage bloque */ }
    }
    // CNX-05 : si le serveur a repondu, supabase-js a deja emis SIGNED_OUT (ecouteurs
    // prevenus, currentUser a null) : une seule notification par vrai changement
    if (currentUser === null) return;
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
    // Dev : sur localhost le magic link Supabase ne peut pas aboutir
    // (pas de redirection vers localhost). On saute donc le mur d'auth
    // PAR DEFAUT en local pour pouvoir tester les ecritures sans friction.
    // Les tests e2e qui verifient le mur posent le flag
    // 'distrimatch_force_auth' = '1' pour le reactiver. Aucun effet en prod
    // (isLocalhost gate : l'email reste obligatoire sur le site deploye).
    try {
        if (isLocalhost() && localStorage.getItem('distrimatch_force_auth') !== '1') {
            return true;
        }
    } catch (e) {
        if (isLocalhost()) return true; // localStorage indispo : on autorise en dev
    }

    if (isAuthenticated()) return true;

    return new Promise((resolve) => {
        openEmailModal((success) => resolve(success));
    });
}

// ============================================
// MODAL EMAIL
// ============================================

let modalOpen = false;

// Session morte cote serveur (signal refuse en 28000 / 401) alors que l'app
// croit encore l'utilisateur connecte : on rouvre la connexion par e-mail sans
// passer par isAuthenticated() (EPIC-T6). Meme exception localhost que requireAuth.
export function promptReconnect() {
    try {
        if (isLocalhost() && localStorage.getItem('distrimatch_force_auth') !== '1') return;
    } catch (e) {
        if (isLocalhost()) return;
    }
    openEmailModal(() => {});
}

function openEmailModal(onClose) {
    if (modalOpen) return;
    modalOpen = true;
    // App de l'ecran d'accueil : le lien de l'e-mail ouvrirait Safari, on met le code en avant (BUG-05)
    const standalone = isStandalone();
    const sendLabel = standalone ? 'Recevoir le code' : 'Recevoir le lien';

    const overlay = document.createElement('div');
    overlay.className = 'auth-modal-overlay';
    overlay.innerHTML = `
        <div class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" tabindex="-1">
            <button class="auth-modal-close" aria-label="Fermer">×</button>
            <div class="auth-modal-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                </svg>
            </div>
            <h2 id="auth-modal-title">Ton email pour interagir</h2>
            <p class="auth-modal-subtitle">Pour signaler ce qui est dispo, donner ton avis, ajouter un distributeur ou modifier une fiche, on a besoin de ton e-mail. Pas de mot de passe : tu reçois un lien et un code par e-mail.</p>
            <form class="auth-modal-form">
                <input type="email" placeholder="ton@email.com" required autofocus>
                <p class="auth-modal-privacy"><button type="button" class="privacy-link" data-open-privacy>Ce que devient ton e-mail</button></p>
                ${isLocalhost()
                    ? '<div class="auth-modal-dev-banner">Mode developpement — captcha desactive sur localhost</div>'
                    : '<div class="auth-captcha"></div>'   // CNX-08 : rendu par tryRenderHcaptcha seulement (script en mode explicite)
                }
                <button type="submit" class="auth-modal-submit"${isLocalhost() ? '' : ' disabled'}>${sendLabel}</button>
            </form>
            <p class="auth-modal-status" style="display:none"></p>
            <form class="auth-modal-form auth-modal-otp" hidden>
                <label for="auth-modal-code">Code reçu par e-mail</label>
                <input id="auth-modal-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456">
                <button type="submit" class="auth-modal-submit auth-modal-code-submit">Valider le code</button>
            </form>
        </div>
    `;

    document.body.appendChild(overlay);

    // Rendu explicite du widget hCaptcha si deja charge
    let captchaWidgetId = null;
    let captchaToken = null;

    // Sur localhost : pas de captcha rendu, on saute directement
    if (isLocalhost()) {
        // Le bouton submit est deja active dans le HTML, captchaToken reste null
        // et sendMagicLink n'enverra pas de captchaToken a Supabase.
    }

    const tryRenderHcaptcha = () => {
        if (isLocalhost()) return; // pas de captcha en dev
        const captchaEl = overlay.querySelector('.auth-captcha');
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
                        status.textContent = 'Erreur captcha, réessaie.';
                    }
                });
                captchaEl.dataset.rendered = 'true';
            } catch (e) {
                console.warn('[Auth] hCaptcha render echoue:', e.message);
            }
        }
    };

    // Attendre hCaptcha tant que la fenetre est ouverte (CNX-08 : plus d'abandon muet au
    // bout de 10 s) ; au-dela de 10 s, on dit pourquoi le bouton reste grise
    let captchaWait = null;
    let captchaSlowTimer = null;
    if (window.hcaptcha) {
        tryRenderHcaptcha();
    } else if (!isLocalhost()) {
        captchaWait = setInterval(() => {
            if (!window.hcaptcha) return;
            clearInterval(captchaWait);
            clearTimeout(captchaSlowTimer);
            if (status.textContent === CAPTCHA_SLOW_TEXT) status.style.display = 'none';
            tryRenderHcaptcha();
        }, 200);
        captchaSlowTimer = setTimeout(() => {
            status.style.display = 'block';
            status.className = 'auth-modal-status error';
            status.textContent = CAPTCHA_SLOW_TEXT;
        }, 10000);
    }

    const dialog = overlay.querySelector('.auth-modal');
    let closed = false;
    let stopAuthWatch = null;
    const close = (success = false) => {
        if (closed) return;   // CNX-02 : une seule fermeture (croix, Echap, fond, retour, connexion)
        closed = true;
        modalOpen = false;
        clearInterval(captchaWait);        // CNX-08
        clearTimeout(captchaSlowTimer);
        stopAuthWatch?.();
        if (captchaWidgetId !== null && window.hcaptcha) {
            try { window.hcaptcha.reset(captchaWidgetId); } catch (e) {}
        }
        deactivateFocusTrap(dialog);
        overlay.remove();
        popLayer('auth');   // fermee par l'UI : retire son entree (sans effet apres « retour »)
        onClose(success);
    };

    activateFocusTrap(dialog, () => close(false));
    pushLayer('auth', () => close(false));   // CNX-02 : « retour » ferme la fenetre, pas la fiche dessous
    overlay.querySelector('.auth-modal-close').addEventListener('click', () => close(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });

    const form = overlay.querySelector('form');
    const input = overlay.querySelector('input[type=email]');
    const submit = overlay.querySelector('.auth-modal-submit');
    const status = overlay.querySelector('.auth-modal-status');
    const codeForm = overlay.querySelector('.auth-modal-otp');
    const codeInput = codeForm.querySelector('#auth-modal-code');
    const codeSubmit = codeForm.querySelector('.auth-modal-code-submit');
    let sentEmail = '';

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = input.value.trim();
        if (!email) return;
        if (!isLocalhost() && !captchaToken) {
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
            sentEmail = email;
            status.style.display = 'block';
            status.className = 'auth-modal-status success';
            status.innerHTML = standalone
                ? `Code envoyé à <strong>${escapeHTML(email)}</strong>.<br>Entre ici le code reçu par e-mail pour te connecter dans l’app.`
                : `Lien envoyé à <strong>${escapeHTML(email)}</strong>.<br>Ouvre le lien de l’e-mail, ou entre ici le code reçu.`;
            submit.style.display = 'none';
            input.disabled = true;
            codeForm.hidden = false;
            if (standalone) codeInput.focus();
        } catch (err) {
            status.style.display = 'block';
            status.className = 'auth-modal-status error';
            console.warn('[Auth] Envoi de l’e-mail refuse :', err?.status, err?.code, err?.message);
            status.textContent = describeAuthError(err, navigator.onLine);   // CNX-07 : en francais
            // Reset captcha pour permettre une nouvelle tentative
            if (captchaWidgetId !== null && window.hcaptcha) {
                try { window.hcaptcha.reset(captchaWidgetId); } catch (e) {}
            }
            captchaToken = null;
            submit.disabled = true;
            submit.textContent = sendLabel;
        }
    });

    // Code recu par e-mail (BUG-05) : connexion sur place, sans quitter l'app
    codeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const token = codeInput.value.replace(/\s/g, '');
        if (!/^\d{6,10}$/.test(token)) {
            status.style.display = 'block';
            status.className = 'auth-modal-status error';
            status.textContent = 'Entre les chiffres du code reçu par e-mail.';
            return;
        }
        codeSubmit.disabled = true;
        codeSubmit.textContent = 'Vérification...';
        try {
            await verifyEmailCode(sentEmail, token);
            // En general l'ecouteur onAuthChange ci-dessous a deja ferme la fenetre
            if (overlay.isConnected) close(true);
        } catch (err) {
            status.style.display = 'block';
            status.className = 'auth-modal-status error';
            status.textContent = describeCodeError(err);
            codeSubmit.disabled = false;
            codeSubmit.textContent = 'Valider le code';
        }
    });

    // Connecte (lien ouvert dans un autre onglet, ou code) : CETTE fenetre se ferme.
    // CNX-02 : l'ecouteur est retire a la fermeture ; avant, celui d'une fenetre deja
    // fermee repondait a la place de la fenetre ouverte, qui restait affichee.
    stopAuthWatch = onAuthChange((user) => {
        if (user && !user.is_anonymous) close(true);
    });
}
