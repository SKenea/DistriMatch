/**
 * DistriMatch - UI Google Maps style
 * Panneau lateral filtres + Modal distributeur a onglets
 */

import { AppState, supabaseClient } from './state.js';
import { escapeHTML, formatDistance, generateStars, calculateDistance, showToast, getUserLocation, isLikelyDesktop } from './utils.js';
import { toggleSubscription, loadDistributorPhotos, renderProductsList } from './distributor.js';
import { uploadDistributorPhotos } from './add-distributor.js';
import { openConversation } from './chat.js';
import { requireAuth, isAuthenticated } from './auth.js';
import { switchView } from './navigation.js';

// ============================================
// PANNEAU LATERAL (liste filtree)
// ============================================

let currentFilter = null;

// Verrou de re-entrance pour l'upload de photos depuis la fiche
// (handler async : double-clic / multi-selection rapide -> doublons).
let isAddingPhoto = false;

// Tranches de distance pour le regroupement du panneau lateral.
// La liste est deja triee par distance croissante (sortByDistance, PR #43).
const DISTANCE_GROUPS = [
    { label: 'À proximité', range: "moins d'1 km", transport: '🚶',    transportLabel: 'à pied',            max: 1 },        // < 1 km
    { label: 'À côté',      range: '1 à 5 km',     transport: '🚴',    transportLabel: 'en vélo',           max: 5 },        // 1–5 km
    { label: 'Plus loin',   range: 'plus de 5 km', transport: '🚗 🚌', transportLabel: 'en voiture ou bus', max: Infinity }, // ≥ 5 km
];

// Markup d'un item de liste. Identique entre le rendu plat (sans geoloc)
// et le rendu groupe pour ne pas casser le binding .side-panel-item / le CSS.
function renderSidePanelItem(d, extraClass = '') {
    const distance = d.distance ? formatDistance(d.distance) : '';
    // Vignette : 1ere photo reelle si dispo (cache prefetch), sinon emoji.
    // L'emoji de categorie reste TOUJOURS visible : seul (pas de photo) ou
    // en pastille superposee a la photo (repere visuel du type conserve).
    // onerror : si l'image casse, on retombe sur l'emoji seul.
    const emoji = escapeHTML(d.emoji || '📍');
    const thumb = AppState.photoThumbs && AppState.photoThumbs[d.id];
    const photoCell = thumb
        ? `<img src="${escapeHTML(thumb)}" alt="" loading="lazy" onerror="this.parentNode.textContent='${emoji}'"><span class="side-panel-item-cat" aria-hidden="true">${emoji}</span>`
        : emoji;
    return `
        <div class="side-panel-item${extraClass ? ' ' + extraClass : ''}" data-id="${escapeHTML(d.id)}">
            <div class="side-panel-item-photo">${photoCell}</div>
            <div class="side-panel-item-info">
                <div class="side-panel-item-name">${escapeHTML(d.name)}</div>
                <div class="side-panel-item-meta">
                    <span class="side-panel-item-rating">${d.rating?.toFixed(1) || '?'} ★</span>
                    ${distance ? `<span class="side-panel-item-distance">${distance}</span>` : ''}
                </div>
            </div>
        </div>`;
}

function bindSidePanelItemClicks(list) {
    list.querySelectorAll('.side-panel-item').forEach(item => {
        item.addEventListener('click', () => {
            openDistributorModal(item.dataset.id);
        });
    });
}

// Accordeon : chaque en-tete de groupe ouvre/ferme sa liste d'items.
// Les 3 groupes sont fermes par defaut (aria-expanded=false, items [hidden]).
function bindGroupAccordion(list) {
    list.querySelectorAll('.side-panel-group-header').forEach(header => {
        header.addEventListener('click', () => {
            const open = header.getAttribute('aria-expanded') === 'true';
            header.setAttribute('aria-expanded', String(!open));
            const items = header.nextElementSibling;
            if (items && items.classList.contains('side-panel-group-items')) {
                items.hidden = open;
            }
        });
    });
}

export function initSidePanel() {
    const closeBtn = document.getElementById('side-panel-close');
    closeBtn?.addEventListener('click', closeSidePanel);
}

export function openSidePanelForType(type) {
    openSidePanelForFilters(type === 'all' ? [] : [type]);
}

export function openSidePanelForFilters(types = []) {
    currentFilter = types;
    const sidebar = document.getElementById('sidebar');
    const title = document.getElementById('side-panel-title');
    const list = document.getElementById('side-panel-list');

    if (!sidebar || !list) return;

    // Construction du titre
    if (types.length === 0) {
        title.textContent = 'Tous les distributeurs';
    } else if (types.length === 1) {
        const tc = AppState.typeConfig[types[0]] || {};
        title.textContent = `${tc.emoji || '📍'} ${tc.label || types[0]}`;
    } else {
        const labels = types.map(t => AppState.typeConfig[t]?.label || t);
        title.textContent = `${labels.length} categories : ${labels.join(', ')}`;
    }

    const matches = types.length === 0
        ? AppState.distributors
        : AppState.distributors.filter(d => types.includes(d.type));

    if (matches.length === 0) {
        list.innerHTML = `<div class="side-panel-empty">Aucun distributeur dans cette categorie</div>`;
    } else if (!AppState.userLocation) {
        // Sans geoloc : pas de distance -> liste plate, comportement inchange.
        list.innerHTML = matches.map(d => renderSidePanelItem(d)).join('');
        bindSidePanelItemClicks(list);
    } else {
        // Avec geoloc : la liste est deja triee par distance croissante.
        // On la decoupe en tranches via DISTANCE_GROUPS.
        const sorted = [...matches].sort(
            (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)
        );

        const buckets = DISTANCE_GROUPS.map(() => []);
        sorted.forEach(d => {
            const dist = d.distance ?? Infinity;
            const idx = DISTANCE_GROUPS.findIndex(g => dist < g.max);
            buckets[idx === -1 ? DISTANCE_GROUPS.length - 1 : idx].push(d);
        });

        // Accordeon : les 3 groupes sont toujours affiches, fermes par defaut.
        // L'utilisateur clique une en-tete pour deplier sa tranche.
        list.innerHTML = DISTANCE_GROUPS.map((group, gi) => {
            const items = buckets[gi];
            const header = `
                <button type="button" class="side-panel-group-header" aria-expanded="false">
                    <span class="spg-chevron" aria-hidden="true">▸</span>
                    <span class="spg-main">
                        <span class="spg-label">${escapeHTML(group.label)}</span>
                        <span class="spg-sub">${escapeHTML(group.range)} · <span class="spg-transport" title="${escapeHTML(group.transportLabel)}" aria-label="${escapeHTML(group.transportLabel)}">${escapeHTML(group.transport)}</span></span>
                    </span>
                    <span class="spg-count">${items.length}</span>
                </button>`;
            const rows = items.length === 0
                ? `<div class="side-panel-empty">Aucun distributeur dans cette tranche</div>`
                : items.map((d, i) =>
                    renderSidePanelItem(d, i === items.length - 1 ? 'side-panel-item--group-end' : '')
                  ).join('');
            return `<div class="side-panel-group">${header}<div class="side-panel-group-items" hidden>${rows}</div></div>`;
        }).join('');

        bindGroupAccordion(list);

        bindSidePanelItemClicks(list);
    }

    sidebar.classList.add('open');
}

export function closeSidePanel() {
    document.getElementById('sidebar')?.classList.remove('open');
    // Le chip "Tous" (= aucun filtre) ne doit pas rester selectionne quand
    // le panneau est ferme : evite la desync (le clic "Tous" suivant ouvrait
    // le panneau en deselectionnant le chip). Sans effet sur la carte.
    document.querySelector('.filter-chip[data-type="all"]')
        ?.classList.remove('active');
}

// ============================================
// MODAL DISTRIBUTEUR (onglets)
// ============================================

export function initDistModal() {
    const overlay = document.getElementById('dist-modal-overlay');
    const closeBtn = document.getElementById('dist-modal-close');

    closeBtn?.addEventListener('click', closeDistModal);

    // Clic sur l'overlay (en dehors du modal) ferme
    overlay?.addEventListener('click', (e) => {
        if (e.target === overlay) closeDistModal();
    });

    // Onglets
    document.querySelectorAll('.dist-tab').forEach(tab => {
        tab.addEventListener('click', () => switchDistTab(tab.dataset.tab));
    });

    // Boutons d'action
    document.getElementById('dist-action-directions')?.addEventListener('click', () => {
        const d = AppState.currentDistributor;
        if (d) window.open(`https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`, '_blank');
    });

    document.getElementById('dist-action-favorite')?.addEventListener('click', async () => {
        if (AppState.currentDistributor) {
            await toggleSubscription(AppState.currentDistributor.id);
            updateFavoriteButton();
            // Animation pulse 200ms apres toggle
            const btn = document.getElementById('dist-action-favorite');
            btn?.classList.remove('pulsing');
            // reflow pour relancer l'animation si on clique a nouveau
            void btn?.offsetWidth;
            btn?.classList.add('pulsing');
            btn?.addEventListener('animationend', () => btn.classList.remove('pulsing'), { once: true });
        }
    });

    // Bouton stylo "Modifier" : toujours visible (canEdit). Identifie ->
    // mode edition. Non identifie -> modale d'explication invitant a se
    // connecter via la page Compte (point d'entree unique de la connexion).
    document.getElementById('dist-action-edit')?.addEventListener('click', () => {
        const d = AppState.currentDistributor;
        if (!d) return;
        if (isAuthenticated()) {
            openDistributorModal(d.id, true, true);
        } else {
            showEditAuthGate();
        }
    });

    // Bouton Discuter avec le bot (mode edit)
    document.getElementById('dist-open-chat')?.addEventListener('click', () => {
        if (AppState.currentDistributor) {
            openConversation(AppState.currentDistributor.id);
        }
    });

    // Bouton "Photo" : ajoute une photo a un distributeur existant. Non
    // identifie -> modale "Connexion requise" (meme parcours que Modifier).
    // Identifie -> selecteur de fichier -> upload Supabase -> rechargement
    // de la galerie + mise a jour du cache vignette pour le side panel.
    document.getElementById('dist-action-add-photo')?.addEventListener('click', async () => {
        const d = AppState.currentDistributor;
        if (!d) return;
        if (!isAuthenticated()) {
            showEditAuthGate();
            return;
        }
        if (isAddingPhoto) return;

        // Geofence : preuve de presence sommaire. Bloque les contributions
        // "depuis le canape" sans verrouiller l'app (tolere l'erreur GPS
        // urbaine ~10-15m). Cache AppState.userLocation prioritaire pour
        // eviter un re-prompt OS quand l'onboarding l'a deja fourni ;
        // fallback sur une requete fraiche si manquant.
        const MAX_DIST_KM = 0.1; // 100m
        let userLoc = AppState.userLocation;
        if (!userLoc) {
            try {
                userLoc = await getUserLocation();
            } catch (e) {
                showToast('Active la geolocalisation pour ajouter une photo', 'warning');
                return;
            }
        }
        const distKm = calculateDistance(userLoc.lat, userLoc.lng, d.lat, d.lng);
        if (distKm > MAX_DIST_KM) {
            showToast(
                `Tu dois etre pres de ${d.name} pour ajouter une photo (tu es a ${formatDistance(distKm)})`,
                'warning'
            );
            return;
        }

        // Routing : sur desktop avec webcam dispo, on ouvre la modale de
        // capture (l'attribut HTML capture="environment" est ignore sur
        // desktop). Sur mobile, on garde le prompt OS natif (superieur a
        // toute UI custom).
        if (isLikelyDesktop() && navigator.mediaDevices?.getUserMedia) {
            openWebcamCapture(d);
        } else {
            document.getElementById('dist-add-photo-input')?.click();
        }
    });

    document.getElementById('dist-add-photo-input')?.addEventListener('change', async (ev) => {
        const input = ev.target;
        const files = Array.from(input.files || []).slice(0, 3);
        input.value = ''; // reset pour re-selection du meme fichier ulterieurement
        const d = AppState.currentDistributor;
        if (!d || files.length === 0) return;
        await processPhotoUpload(d, files);
    });

    // Bouton Partager : copie URL avec ?id=<distId>
    document.getElementById('dist-action-share')?.addEventListener('click', async () => {
        const dist = AppState.currentDistributor;
        if (!dist) return;
        const url = buildShareUrl(dist.id);
        try {
            await navigator.clipboard.writeText(url);
            showToast('Lien copie dans le presse-papier', 'success');
        } catch (e) {
            // Fallback : prompt
            window.prompt('Copie ce lien :', url);
        }
    });
}

/**
 * Construit l'URL partageable d'un distributeur.
 * Exporte pour test unitaire.
 */
export function buildShareUrl(distId) {
    const base = (typeof window !== 'undefined' && window.location)
        ? `${window.location.origin}${window.location.pathname}`
        : 'https://skenea.github.io/DistriMatch/';
    return `${base}?id=${encodeURIComponent(distId)}`;
}

export function openModalFromUrlParam() {
    if (typeof window === 'undefined' || !window.location) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) return;

    if (AppState.distributors.find(d => d.id === id)) {
        openDistributorModal(id);
    } else {
        showToast('Distributeur introuvable', 'error');
    }

    // Nettoyer l'URL pour eviter une re-ouverture au rafraichissement
    if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname);
    }
}

export function openDistributorModal(id, editMode = false, canEdit = false) {
    const distributor = AppState.distributors.find(d => d.id === id);
    if (!distributor) return;

    AppState.currentDistributor = distributor;
    AppState.modalEditMode = editMode;
    AppState.modalCanEdit = canEdit;

    const typeConfig = AppState.typeConfig[distributor.type] || {};
    const distance = distributor.distance ? formatDistance(distributor.distance) : '';

    // Header
    document.getElementById('dist-modal-name').textContent = distributor.name;
    document.getElementById('dist-modal-rating').textContent =
        `${(distributor.rating || 0).toFixed(1)} ${generateStars(distributor.rating || 0)}`;
    document.getElementById('dist-modal-reviews').textContent = `(${distributor.reviewCount || 0})`;
    document.getElementById('dist-modal-type').textContent = `${distributor.emoji} ${typeConfig.label || distributor.type}`;
    // Niveau de prix : valeur bornee a € / €€ / €€€ (defaut €€)
    const PRICE_LEVELS = ['€', '€€', '€€€'];
    const priceRange = PRICE_LEVELS.includes(distributor.priceRange) ? distributor.priceRange : '€€';
    const prEl = document.getElementById('dist-modal-pricerange');
    if (prEl) prEl.textContent = priceRange;
    const prSelect = document.getElementById('dist-edit-pricerange');
    if (prSelect) prSelect.value = priceRange;

    // A propos
    document.getElementById('dist-apropos-address').textContent = distributor.address || 'Adresse inconnue';
    document.getElementById('dist-apropos-distance').textContent = distance || 'Distance non disponible';
    const addedRow = document.getElementById('dist-apropos-added-row');
    if (addedRow) addedRow.style.display = distributor.isUserAdded ? 'flex' : 'none';

    // Produits : mode edit (boutons CRUD) ou readonly
    renderProductsList(distributor, 'dist-products-list', { readonly: !editMode });

    // En mode edit, afficher la section "+ Ajouter produit" + "Discuter"
    const addSection = document.getElementById('dist-products-add-section');
    if (addSection) addSection.style.display = editMode ? 'block' : 'none';
    const chatSection = document.getElementById('dist-chat-section');
    if (chatSection) chatSection.style.display = editMode ? 'block' : 'none';

    // Photos : bandeau toujours visible. Par defaut un fallback degrade +
    // emoji + label type (la fiche n'est jamais "vide" en haut), remplace
    // par les vraies photos si Supabase en renvoie.
    const photoSection = document.getElementById('dist-modal-photo');
    const photoGallery = document.getElementById('dist-modal-photos-gallery');
    photoGallery.innerHTML = `
        <div class="dist-photo-fallback" style="background:${escapeHTML(typeConfig.gradient || '#E63946')}">
            <span class="dist-photo-fallback-emoji">${escapeHTML(distributor.emoji || '📍')}</span>
            <span class="dist-photo-fallback-label">${escapeHTML(typeConfig.label || distributor.type || '')}</span>
        </div>`;
    photoSection.style.display = 'block';

    loadDistributorPhotos(distributor.id).then(photos => {
        if (photos.length > 0) {
            photoGallery.innerHTML = photos.map(p =>
                `<div class="photo-gallery-item"><img src="${escapeHTML(p.url)}" alt="Photo distributeur" loading="lazy"></div>`
            ).join('');
        }
    });

    // Boutons
    updateFavoriteButton();

    // Stylo "Modifier" : visible si ouvert depuis Favoris (canEdit) ET en
    // lecture. La verification d'identite se fait au clic (modale gate).
    const editBtn = document.getElementById('dist-action-edit');
    if (editBtn) editBtn.style.display = (canEdit && !editMode) ? '' : 'none';

    // Ouvrir l'onglet Produits par defaut
    switchDistTab('produits');

    // Afficher la modal
    document.getElementById('dist-modal-overlay')?.classList.add('active');
}

export function closeDistModal() {
    document.getElementById('dist-modal-overlay')?.classList.remove('active');
}

// Pipeline commun d'upload de photo(s) pour un distributeur : pose le
// verrou anti-doublon, fait l'upload Supabase (max 3), rafraichit la
// galerie de la fiche, met a jour le cache vignette du side panel, et
// gere les toasts + cleanup. Reutilise par le change handler du file
// picker et par la capture webcam (voir openWebcamCapture).
async function processPhotoUpload(distributor, files) {
    if (!distributor || !files || files.length === 0) return;
    if (isAddingPhoto) return;

    isAddingPhoto = true;
    const btn = document.getElementById('dist-action-add-photo');
    btn?.setAttribute('disabled', 'true');
    btn?.classList.add('is-loading');

    try {
        const uploaded = await uploadDistributorPhotos(distributor.id, files);
        if (uploaded.length === 0) {
            showToast('Erreur lors de l\'envoi des photos', 'error');
            return;
        }
        showToast(
            `${uploaded.length} photo${uploaded.length > 1 ? 's' : ''} ajoutee${uploaded.length > 1 ? 's' : ''}`,
            'success'
        );

        // Recharge la galerie de la fiche (remplace le fallback ou les
        // photos existantes par les vraies photos approuvees a jour).
        const photos = await loadDistributorPhotos(distributor.id);
        const photoGallery = document.getElementById('dist-modal-photos-gallery');
        if (photos.length > 0 && photoGallery) {
            photoGallery.innerHTML = photos.map(p =>
                `<div class="photo-gallery-item"><img src="${escapeHTML(p.url)}" alt="Photo distributeur" loading="lazy"></div>`
            ).join('');
        }

        // Met a jour le cache vignette pour que le side panel affiche
        // immediatement la 1ere photo (sans reload de la page).
        if (supabaseClient && uploaded[0]) {
            const { data } = supabaseClient.storage
                .from('distributor-photos')
                .getPublicUrl(uploaded[0]);
            if (data?.publicUrl) {
                AppState.photoThumbs = AppState.photoThumbs || {};
                if (!AppState.photoThumbs[distributor.id]) {
                    AppState.photoThumbs[distributor.id] = data.publicUrl;
                }
            }
        }
    } catch (e) {
        console.warn('[DistriMatch] addPhoto error:', e.message);
        showToast('Erreur lors de l\'envoi des photos', 'error');
    } finally {
        isAddingPhoto = false;
        btn?.removeAttribute('disabled');
        btn?.classList.remove('is-loading');
    }
}

// Modale de capture webcam (desktop uniquement). Ouvre un <video> sur le
// flux camera, propose Capturer / Annuler / Choisir un fichier. Sur
// capture : drawImage sur canvas off-screen -> Blob JPEG -> File ->
// processPhotoUpload. Tout chemin de sortie arrete le MediaStream pour
// eviter une LED camera orpheline.
async function openWebcamCapture(distributor) {
    if (document.getElementById('webcam-modal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'webcam-modal';
    overlay.className = 'webcam-modal-overlay';
    overlay.innerHTML = `
        <div class="webcam-modal" role="dialog" aria-label="Prendre une photo">
            <button class="webcam-modal-close" aria-label="Fermer">&times;</button>
            <h3 class="webcam-modal-title">Prendre une photo</h3>
            <video class="webcam-video" autoplay muted playsinline></video>
            <div class="webcam-actions">
                <button class="webcam-cancel-btn" type="button">Annuler</button>
                <button class="webcam-capture-btn" type="button">Capturer</button>
            </div>
            <button class="webcam-fallback-link" type="button">Choisir un fichier a la place</button>
        </div>`;
    document.body.appendChild(overlay);

    const videoEl = overlay.querySelector('.webcam-video');
    let stream = null;

    function closeWebcam() {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
        }
        document.removeEventListener('keydown', onEscape);
        overlay.remove();
    }

    function onEscape(e) {
        if (e.key === 'Escape') closeWebcam();
    }

    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        videoEl.srcObject = stream;
    } catch (e) {
        console.warn('[DistriMatch] getUserMedia error:', e.message);
        closeWebcam();
        showToast('Camera inaccessible - choisis un fichier', 'warning');
        document.getElementById('dist-add-photo-input')?.click();
        return;
    }

    // Listeners
    document.addEventListener('keydown', onEscape);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeWebcam();
    });
    overlay.querySelector('.webcam-modal-close').addEventListener('click', closeWebcam);
    overlay.querySelector('.webcam-cancel-btn').addEventListener('click', closeWebcam);
    overlay.querySelector('.webcam-fallback-link').addEventListener('click', () => {
        closeWebcam();
        document.getElementById('dist-add-photo-input')?.click();
    });

    overlay.querySelector('.webcam-capture-btn').addEventListener('click', () => {
        // Capture une frame du flux video courant.
        const w = videoEl.videoWidth || 1280;
        const h = videoEl.videoHeight || 720;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoEl, 0, 0, w, h);
        canvas.toBlob(async (blob) => {
            if (!blob) {
                closeWebcam();
                showToast('Erreur lors de la capture', 'error');
                return;
            }
            const file = new File([blob], `webcam_${Date.now()}.jpg`, { type: 'image/jpeg' });
            closeWebcam();
            await processPhotoUpload(distributor, [file]);
        }, 'image/jpeg', 0.92);
    });
}

// Modale d'explication affichee quand on clique "Modifier" sans etre
// identifie. Invite a se connecter via la page Compte (point d'entree
// unique de la connexion : email + hCaptcha), puis a revenir.
function showEditAuthGate() {
    if (document.getElementById('edit-auth-gate')) return;

    const overlay = document.createElement('div');
    overlay.id = 'edit-auth-gate';
    overlay.className = 'auth-modal-overlay';
    overlay.innerHTML = `
        <div class="auth-modal">
            <button class="auth-modal-close" aria-label="Fermer">&times;</button>
            <div class="auth-modal-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
            </div>
            <h2>Connexion requise</h2>
            <p class="auth-modal-subtitle">Pour faire une modification ou une mise &agrave; jour, il faut que tu sois connect&eacute;. Clique sur le bouton ci-dessous pour te connecter, puis reviens sur ce distributeur.</p>
            <button class="auth-modal-submit" id="edit-auth-gate-go" type="button">Se connecter</button>
        </div>
    `;
    document.body.appendChild(overlay);

    const remove = () => overlay.remove();
    overlay.querySelector('.auth-modal-close').addEventListener('click', remove);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) remove(); });
    overlay.querySelector('#edit-auth-gate-go').addEventListener('click', () => {
        remove();
        closeDistModal();
        switchView('account');
    });
}

function switchDistTab(tabName) {
    document.querySelectorAll('.dist-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    document.querySelectorAll('.dist-tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.dataset.tabPane === tabName);
    });
}

function updateFavoriteButton() {
    const dist = AppState.currentDistributor;
    if (!dist) return;
    const isFav = AppState.subscriptions.includes(dist.id);
    const btn = document.getElementById('dist-action-favorite');
    const label = document.getElementById('dist-action-favorite-label');
    if (btn) {
        btn.classList.toggle('favorited', isFav);
        btn.setAttribute('aria-label', isFav ? 'Retirer des favoris' : 'Ajouter aux favoris');
    }
    if (label) label.textContent = isFav ? 'Retirer' : 'Favori';
}

// ============================================
// FORMULAIRE AJOUT PRODUIT (mode edit)
// ============================================

export function toggleDistAddProductForm() {
    const form = document.getElementById('dist-add-product-form');
    if (!form) return;
    const showing = form.style.display !== 'none';
    form.style.display = showing ? 'none' : 'flex';
    if (!showing) {
        document.getElementById('dist-add-product-name').value = '';
        document.getElementById('dist-add-product-name').focus();
    }
}

export async function submitDistAddProduct() {
    if (!(await requireAuth())) return;

    const name = document.getElementById('dist-add-product-name').value.trim();

    if (!name || !AppState.currentDistributor) return;

    const product = { name, available: true };

    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from('products').insert({
                distributor_id: AppState.currentDistributor.id,
                name: name,
                available: true
            }).select('id').single();
            if (error) throw error;
            product.dbId = data.id;
        } catch (e) {
            console.warn('[DistriMatch] Erreur ajout produit:', e.message);
        }
    }

    AppState.currentDistributor.products.push(product);
    renderProductsList(AppState.currentDistributor, 'dist-products-list', { readonly: false });

    document.getElementById('dist-add-product-name').value = '';
    document.getElementById('dist-add-product-form').style.display = 'none';

    showToast(`${escapeHTML(name)} ajoute !`, 'success');
}

// Maj du niveau de prix du distributeur (select en mode edition).
export async function updateDistributorPriceRange(value) {
    const PRICE_LEVELS = ['€', '€€', '€€€'];
    if (!PRICE_LEVELS.includes(value)) return;
    if (!(await requireAuth())) return;

    const d = AppState.currentDistributor;
    if (!d) return;
    d.priceRange = value;

    if (supabaseClient) {
        try {
            await supabaseClient.from('distributors')
                .update({ price_range: value }).eq('id', d.id);
            console.log('[DistriMatch] Niveau de prix modifie:', value);
        } catch (e) {
            console.warn('[DistriMatch] Erreur maj niveau de prix:', e.message);
        }
    }

    const prEl = document.getElementById('dist-modal-pricerange');
    if (prEl) prEl.textContent = value;
    showToast('Niveau de prix mis a jour', 'success');
}
