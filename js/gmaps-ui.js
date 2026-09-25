/**
 * DistriMatch - UI Google Maps style
 * Panneau lateral filtres + Modal distributeur a onglets
 */

import { AppState, supabaseClient } from './state.js';
import { escapeHTML, formatDistance, generateStars, calculateDistance, showToast, getUserLocation, isLikelyDesktop, getFreshness } from './utils.js';
import { toggleSubscription, loadDistributorPhotos, renderProductsList } from './distributor.js';
import { uploadDistributorPhotos } from './add-distributor.js';
import { openConversation } from './chat.js';
import { FEATURES } from './config.js';
import { requireAuth, isAuthenticated } from './auth.js';
import { activateFocusTrap, deactivateFocusTrap } from './focus-trap.js';
import { pushLayer, popLayer } from './history.js';
import { loadAvailabilityForDistributor, initFicheSignals, focusSignalFromQr, renderFicheStatus } from './availability.js';
import { logEvent, rememberEntrySource } from './events.js';

// ============================================
// PANNEAU LATERAL (liste filtree)
// ============================================

let currentFilter = null;
// Source de la prochaine ouverture de fiche pour la mesure ('qr' quand elle
// vient du deep link d'un sticker, sinon 'organic'). Remise a 'organic' apres.
let modalOpenSource = 'organic';

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
    // Fraicheur : l'age de la derniere verification, toujours affiche
    // (docs/STRATEGIE.md : la confiance = l'horodatage).
    const fresh = getFreshness(d.lastVerified);
    return `
        <div class="side-panel-item${extraClass ? ' ' + extraClass : ''}" data-id="${escapeHTML(d.id)}">
            <div class="side-panel-item-photo">${photoCell}</div>
            <div class="side-panel-item-info">
                <div class="side-panel-item-name">${escapeHTML(d.name)}</div>
                <div class="side-panel-item-meta">
                    ${(d.reviewCount ?? 0) > 0
                        ? `<span class="side-panel-item-rating">${d.rating?.toFixed(1) || '?'} ★</span>`
                        : `<span class="side-panel-item-new">Nouveau</span>`}
                    ${distance ? `<span class="side-panel-item-distance">${distance}</span>` : ''}
                    ${d.isDemo ? '<span class="demo-tag">Démo</span>' : ''}
                </div>
                <div class="side-panel-item-verified is-${fresh.state}">${escapeHTML(fresh.label)}</div>
            </div>
        </div>`;
}

// Delegation d'evenements : un SEUL listener pose une fois sur le conteneur
// #side-panel-list (cf. initSidePanel) gere a la fois les clics d'items et les
// en-tetes d'accordeon, via closest(). Evite de re-attacher N listeners a
// chaque re-rendu de la liste (innerHTML remplace les noeuds). Le conteneur,
// lui, persiste -> le listener survit aux re-rendus.
function handleSidePanelClick(e) {
    // Accordeon : en-tete de groupe -> ouvre/ferme sa tranche (fermee par
    // defaut, aria-expanded=false, items [hidden]).
    const header = e.target.closest('.side-panel-group-header');
    if (header) {
        const open = header.getAttribute('aria-expanded') === 'true';
        header.setAttribute('aria-expanded', String(!open));
        const items = header.nextElementSibling;
        if (items && items.classList.contains('side-panel-group-items')) {
            items.hidden = open;
        }
        return;
    }

    // Item distributeur -> ouvre la fiche.
    const item = e.target.closest('.side-panel-item');
    if (item) {
        openDistributorModal(item.dataset.id);
    }
}

export function initSidePanel() {
    const closeBtn = document.getElementById('side-panel-close');
    closeBtn?.addEventListener('click', closeSidePanel);
    document.getElementById('side-panel-list')?.addEventListener('click', handleSidePanelClick);
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
        title.textContent = `${labels.length} catégories : ${labels.join(', ')}`;
    }

    const matches = types.length === 0
        ? AppState.distributors
        : AppState.distributors.filter(d => types.includes(d.type));
    // Le titre porte le compte (plus de toast de comptage) et le rappel « Tous »
    // n'apparait que si un filtre est actif (audit UX-11/12).
    title.textContent += ` · ${matches.length}`;
    const allBtn = document.getElementById('side-panel-all');
    if (allBtn) allBtn.hidden = types.length === 0;

    if (matches.length === 0) {
        list.innerHTML = `<div class="side-panel-empty">Aucun distributeur dans cette catégorie</div>`;
    } else if (!AppState.userLocation) {
        // Sans position (audit UX-02) : liste plate triee par nom, avec un rappel
        // discret ; les distances viendront quand l'utilisateur activera la
        // localisation. (Clics geres par delegation, cf. initSidePanel.)
        const byName = [...matches].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
        list.innerHTML = '<div class="side-panel-hint">Active la localisation pour trier par distance</div>'
            + byName.map(d => renderSidePanelItem(d)).join('');
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

        // Accordeon : les 3 groupes sont toujours affiches ; le premier groupe non
        // vide est ouvert d'emblee (audit UX-03/12), les autres fermes.
        // L'utilisateur clique une en-tete pour deplier ou replier sa tranche.
        const firstOpen = buckets.findIndex(b => b.length > 0);
        list.innerHTML = DISTANCE_GROUPS.map((group, gi) => {
            const items = buckets[gi];
            if (items.length === 0) return '';   // tranche vide : pas de groupe (audit UX-12)
            const header = `
                <button type="button" class="side-panel-group-header" aria-expanded="${gi === firstOpen}">
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
            return `<div class="side-panel-group">${header}<div class="side-panel-group-items"${gi === firstOpen ? '' : ' hidden'}>${rows}</div></div>`;
        }).join('');
        // Clics items + accordeon : delegation sur le conteneur (initSidePanel).
    }

    // Couche d'historique (audit UX-04) : le bouton retour ferme le panneau
    if (!sidebar.classList.contains('open')) pushLayer('panel', closeSidePanel);
    sidebar.classList.add('open');
}

export function closeSidePanel() {
    document.getElementById('sidebar')?.classList.remove('open');
    popLayer('panel');
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

    // « Il reste quoi ? » se dit sur les aliments et les boutons d'etat de la
    // machine (EPIC-T2), reserves aux comptes connectes (EPIC-T5)
    initFicheSignals();
    // Visiteur : « Connecte-toi pour informer » ouvre la connexion par e-mail
    document.getElementById('dist-login-invite-btn')?.addEventListener('click', () => requireAuth());

    // Boutons d'action
    document.getElementById('dist-action-directions')?.addEventListener('click', () => {
        const d = AppState.currentDistributor;
        if (!d) return;
        logEvent('itineraire', { distributorId: d.id });   // mesure (008) : intention de deplacement
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`, '_blank');
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

    // Bouton stylo "Modifier" : visible sur toute fiche. Identifie ->
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
                showToast('Active la géolocalisation pour ajouter une photo', 'warning');
                return;
            }
        }
        const distKm = calculateDistance(userLoc.lat, userLoc.lng, d.lat, d.lng);
        if (distKm > MAX_DIST_KM) {
            showToast(
                `Tu dois être près de ${d.name} pour ajouter une photo (tu es a ${formatDistance(distKm)})`,
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
            showToast('Lien copié dans le presse-papier', 'success');
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

    // Origine du lien (sticker QR sur la machine : &src=qr), memorisee pour
    // la session avant le nettoyage de l'URL. Aucune donnee personnelle.
    const src = rememberEntrySource(window.location.search);

    if (AppState.distributors.find(d => d.id === id)) {
        modalOpenSource = src || 'organic';
        openDistributorModal(id);
        // &confirm=1 : le QR colle sur la machine mene a la liste « Il reste
        // quoi ? » (ou a l'etat de la machine si elle n'a pas de produit).
        if (params.get('confirm') === '1') focusSignalFromQr();
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
    // Mesure (008) : une ouverture de fiche = un evenement. Le passage en mode
    // edition re-rend la meme fiche : pas recompte.
    if (!editMode) logEvent('fiche_ouverte', { distributorId: id, source: modalOpenSource });
    modalOpenSource = 'organic';

    const typeConfig = AppState.typeConfig[distributor.type] || {};
    const distance = distributor.distance ? formatDistance(distributor.distance) : '';

    // Header
    document.getElementById('dist-modal-name').textContent = distributor.name;
    // Fiche fictive (distributors.is_demo, migration 010) : tag « Démo », frere du h2
    const demoTag = document.getElementById('dist-modal-demo');
    if (demoTag) demoTag.hidden = !distributor.isDemo;
    // Rating : on n'affiche pas "5.0 ★★★★★ (0)" quand il n'y a aucun
    // avis, c'est trompeur (les user-added partent a 5.0 par defaut). A
    // la place : "Pas encore d'avis" explicite.
    const ratingEl = document.getElementById('dist-modal-rating');
    const reviewsEl = document.getElementById('dist-modal-reviews');
    if ((distributor.reviewCount || 0) > 0) {
        ratingEl.textContent = `${(distributor.rating || 0).toFixed(1)} ${generateStars(distributor.rating || 0)}`;
        ratingEl.classList.remove('no-reviews');
        reviewsEl.textContent = `(${distributor.reviewCount})`;
        reviewsEl.style.display = '';
    } else {
        ratingEl.textContent = 'Pas encore d\'avis';
        ratingEl.classList.add('no-reviews');
        reviewsEl.textContent = '';
        reviewsEl.style.display = 'none';
    }
    document.getElementById('dist-modal-type').textContent = `${distributor.emoji} ${typeConfig.label || distributor.type}`;
    // Fraicheur : age de la derniere verification, toujours affiche
    // (docs/STRATEGIE.md : la confiance = l'horodatage, jamais un vert perime).
    const verifiedEl = document.getElementById('dist-modal-verified');
    if (verifiedEl) {
        const fresh = getFreshness(distributor.lastVerified);
        verifiedEl.textContent = fresh.label;
        verifiedEl.className = `dist-modal-verified is-${fresh.state}`;
    }
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
    // « Ajouté par la communauté » ne s'affiche pas pour une fiche fictive : la demo prime
    const addedRow = document.getElementById('dist-apropos-added-row');
    if (addedRow) addedRow.style.display = (distributor.isUserAdded && !distributor.isDemo) ? 'flex' : 'none';
    const demoRow = document.getElementById('dist-apropos-demo-row');
    if (demoRow) demoRow.style.display = distributor.isDemo ? 'flex' : 'none';

    // Produits : mode edit (boutons CRUD) ou readonly
    renderProductsList(distributor, 'dist-products-list', { readonly: !editMode, canInform: isAuthenticated() });
    applyFicheAuthState();
    // Signaux de dispo (UC11) : "vu dispo il y a X" par produit + bandeau
    // machine. Fire-and-forget, jamais await : Supabase absent = rien.
    loadAvailabilityForDistributor(distributor.id);

    // En mode edit, afficher la section "+ Ajouter produit" + "Discuter"
    const addSection = document.getElementById('dist-products-add-section');
    if (addSection) addSection.style.display = editMode ? 'block' : 'none';
    const chatSection = document.getElementById('dist-chat-section');
    if (chatSection) chatSection.style.display = (FEATURES.chat && editMode) ? 'block' : 'none';

    // Photos (EPIC-T4) : la 1re passe en fond assombri du bandeau d'etat, la
    // galerie complete dans l'onglet « À propos ». Sans photo : bandeau uni.
    showDistributorPhotos([]);
    loadDistributorPhotos(distributor.id).then(photos => {
        if (AppState.currentDistributor?.id === distributor.id) showDistributorPhotos(photos);
    });

    // Boutons
    updateFavoriteButton();

    // Stylo « Modifier » et « Photo » : privileges de compte (EPIC-T5), poses
    // par applyFicheAuthState() ci-dessus.

    // Ouvrir l'onglet Produits par defaut
    switchDistTab('produits');

    // Afficher la modal
    const overlay = document.getElementById('dist-modal-overlay');
    // Couche d'historique (audit UX-04) : le bouton retour ferme la fiche
    if (overlay && !overlay.classList.contains('active')) pushLayer('fiche', closeDistModal);
    overlay?.classList.add('active');
    if (overlay) activateFocusTrap(overlay, closeDistModal);
}

export function closeDistModal() {
    const overlay = document.getElementById('dist-modal-overlay');
    overlay?.classList.remove('active');
    popLayer('fiche');
    if (overlay) deactivateFocusTrap(overlay);
    // CustomEvent de la fenetre du document (en test jsdom, le global est celui de Node)
    document.dispatchEvent(new (document.defaultView?.CustomEvent || CustomEvent)('distmodal:closed'));
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
            `${uploaded.length} photo${uploaded.length > 1 ? 's' : ''} ajoutée${uploaded.length > 1 ? 's' : ''}`,
            'success'
        );

        // Recharge la galerie de la fiche (remplace le fallback ou les
        // photos existantes par les vraies photos approuvees a jour).
        const photos = await loadDistributorPhotos(distributor.id);
        if (photos.length > 0) showDistributorPhotos(photos);

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
            <button class="webcam-fallback-link" type="button">Choisir un fichier à la place</button>
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
        }, 'image/jpeg', 0.80); // aligne sur compressImage() pour coherence taille
    });
}

// Modale d'explication affichee quand on clique "Modifier" ou "Photo" sans
// etre identifie. Garde la pedagogie ("Connexion requise pour..."), mais son
// bouton "Se connecter" lance DIRECTEMENT la modale email (requireAuth) :
// 2 etapes au lieu de 3 (gate -> page Compte -> bouton -> email). La fiche
// distributeur reste ouverte derriere ; le bouton "Se connecter" de la page
// Compte, lui, est conserve (design PR #84).
function showEditAuthGate() {
    if (document.getElementById('edit-auth-gate')) return;

    const overlay = document.createElement('div');
    overlay.id = 'edit-auth-gate';
    overlay.className = 'auth-modal-overlay';
    overlay.innerHTML = `
        <div class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="edit-auth-gate-title" tabindex="-1">
            <button class="auth-modal-close" aria-label="Fermer">&times;</button>
            <div class="auth-modal-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
            </div>
            <h2 id="edit-auth-gate-title">Connexion requise</h2>
            <p class="auth-modal-subtitle">Pour faire une modification ou une mise &agrave; jour, il faut que tu sois connect&eacute;. Clique sur le bouton ci-dessous pour te connecter, puis reviens sur ce distributeur.</p>
            <button class="auth-modal-submit" id="edit-auth-gate-go" type="button">Se connecter</button>
        </div>
    `;
    document.body.appendChild(overlay);

    const dialog = overlay.querySelector('.auth-modal');
    const remove = () => {
        deactivateFocusTrap(dialog);
        overlay.remove();
    };
    activateFocusTrap(dialog, remove);
    overlay.querySelector('.auth-modal-close').addEventListener('click', remove);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) remove(); });
    overlay.querySelector('#edit-auth-gate-go').addEventListener('click', () => {
        remove();
        // Modale email directement (pas de detour par la page Compte). La fiche
        // reste ouverte derriere ; apres le magic link, la page se recharge et
        // l'utilisateur reprend son action.
        requireAuth();
    });
}

// EPIC-T5 : lire pour tous, informer / modifier quand on est connecte.
// Connecte : boutons d'etat de la machine, Photo, Modifier. Visiteur : l'encadre
// « Connecte-toi pour informer » a la place.
function applyFicheAuthState() {
    const authed = isAuthenticated();
    const machineChoices = document.getElementById('dist-machine-choices');
    if (machineChoices) machineChoices.hidden = !authed;
    const invite = document.getElementById('dist-login-invite');
    if (invite) invite.hidden = authed;
    const photoBtn = document.getElementById('dist-action-add-photo');
    if (photoBtn) photoBtn.style.display = authed ? '' : 'none';
    const editBtn = document.getElementById('dist-action-edit');
    if (editBtn) editBtn.style.display = (authed && !AppState.modalEditMode) ? '' : 'none';
}

// Connexion / deconnexion pendant qu'une fiche est ouverte : la fiche bascule
// sans rechargement (controles d'information, lignes touchables).
export function refreshFicheForAuth() {
    const overlay = document.getElementById('dist-modal-overlay');
    const d = AppState.currentDistributor;
    if (!d || !overlay?.classList.contains('active')) return;
    if (!AppState.modalEditMode) {
        renderProductsList(d, 'dist-products-list', { readonly: true, canInform: isAuthenticated() });
    }
    applyFicheAuthState();
    renderFicheStatus();
}

// Photos de la fiche : fond du bandeau d'etat (1re photo) + galerie « À propos ».
function showDistributorPhotos(photos) {
    const hero = document.getElementById('dist-hero');
    const heroPhoto = document.getElementById('dist-hero-photo');
    const section = document.getElementById('dist-modal-photo');
    const gallery = document.getElementById('dist-modal-photos-gallery');
    const has = photos.length > 0;
    hero?.classList.toggle('has-photo', has);
    if (heroPhoto) {
        heroPhoto.hidden = !has;
        if (has) heroPhoto.src = photos[0].url;
        else heroPhoto.removeAttribute('src');
    }
    if (section) section.hidden = !has;
    if (gallery) {
        gallery.innerHTML = photos.map(p =>
            `<div class="photo-gallery-item"><img src="${escapeHTML(p.url)}" alt="Photo du distributeur" loading="lazy"></div>`
        ).join('');
    }
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
        btn.setAttribute('aria-pressed', String(isFav));   // etat accessible (audit UX-19)
    }
    if (label) label.textContent = 'Favori';   // un seul mot, l'etat est porte par le coeur plein et aria-pressed
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

    showToast(`${escapeHTML(name)} ajouté !`, 'success');
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
    showToast('Niveau de prix mis à jour', 'success');
}
