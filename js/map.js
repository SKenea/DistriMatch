/**
 * DistriMatch - Carte Leaflet
 */

import {
    AppState,
    mainMap, setMainMap, distributorMarkers, setDistributorMarkers,
    userMarker, setUserMarker
} from './state.js';
import { showToast, getFilteredDistributors, centroidOf, escapeHTML, pinsNear, zoomFromDrag } from './utils.js';
import { getDistributorSummary, renderStatusRing, SUMMARIES_EVENT } from './summaries.js';
import { isSheetLayout } from './fiche-sheet.js';

// ============================================
// CARTE LEAFLET
// ============================================

export function initMainMap() {
    if (mainMap) return;

    // Centre : la position de l'utilisateur ; sinon la fiche ouverte par deep
    // link (on est devant la machine) ; sinon le centre des distributeurs
    // charges, dezoome (audit UX-02 : la carte est utilisable sans position,
    // et aucune coordonnee n'est codee en dur).
    const current = AppState.currentDistributor;
    let center = AppState.userLocation;
    let zoom = 15;
    if (!center && current && Number.isFinite(current.lat) && Number.isFinite(current.lng)) {
        center = { lat: current.lat, lng: current.lng };
    } else if (!center) {
        center = centroidOf(AppState.distributors);
        zoom = center ? 12 : 2;
        center = center || { lat: 0, lng: 0 };
    }
    const map = L.map('main-map', {
        zoomControl: false
    }).setView([center.lat, center.lng], zoom);

    setMainMap(map);
    AppState.mapInitialized = true;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
    }).addTo(mainMap);

    L.control.zoom({ position: 'bottomleft' }).addTo(mainMap);
    enableOneFingerZoom(mainMap);   // EPIC-T26
    // Toucher la carte hors pastille (pas un glisser) : la fiche ouverte se ferme (gmaps-ui.js)
    mainMap.on('click', () => document.dispatchEvent(new CustomEvent('distrimatch:map-tap')));

    if (AppState.userLocation) {
        const userIcon = L.divIcon({
            className: 'user-marker-container',
            html: '<div class="user-marker"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        // Non interactif : ce marqueur n'a aucune action au clic, il ne doit
        // pas etre annonce comme un bouton (ni compte comme cible tactile).
        setUserMarker(L.marker([AppState.userLocation.lat, AppState.userLocation.lng], {
            icon: userIcon,
            zIndexOffset: 1000,
            interactive: false,
            keyboard: false
        }).addTo(mainMap));

        userMarker.bindPopup('<strong>Vous etes ici</strong>');
    }

    // fitBounds=false : on garde le zoom 15 sur la position user
    // (sinon Leaflet re-zoom pour englober tous les markers)
    updateMapMarkers(false);
    console.log('[DistriMatch] Carte initialisee avec', AppState.distributors.length, 'distributeurs');
}

// EPIC-T26 : zoom d'un seul doigt, comme Google Maps : double toucher, doigt
// maintenu, glisser (vers le bas = zoom avant), zoom continu centre sous le doigt.
// Un double toucher simple zoome toujours d'un cran ; le pincement et les boutons
// ne changent pas. Sur ecran tactile, ce geste remplace le double toucher de
// Leaflet (qui ne sait pas glisser) ; a la souris, rien ne change.
const DOUBLE_TAP_MS = 300;     // delai max entre les deux touchers
const DOUBLE_TAP_PX = 40;      // ecart max entre les deux touchers
const TAP_MOVE_PX = 12;        // en dessous : un toucher, pas un glisser

function enableOneFingerZoom(map) {
    const el = map.getContainer();
    const zoomSnap = map.options.zoomSnap;
    const touches = new Set();
    let lastTap = null;
    let down = null;
    let gesture = null;
    let swallowClick = false;

    if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) {
        map.doubleClickZoom.disable();
    }

    function finish(e, apply) {
        const g = gesture;
        gesture = null;
        map.options.zoomSnap = zoomSnap;
        map.dragging.enable();
        lastTap = null;
        if (apply) {
            // Glisse : on arrondit au cran le plus proche ; simple double toucher : un cran de plus
            const target = g.moved ? Math.round(map.getZoom()) : map.getZoom() + 1;
            map.setZoomAround(g.point, Math.min(map.getMaxZoom(), target));
            swallowClick = true;   // le toucher ne doit pas ouvrir une pastille ni fermer quoi que ce soit
            setTimeout(() => { swallowClick = false; }, 400);
        }
        if (e) { e.stopPropagation(); e.preventDefault(); }
    }

    el.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch') return;
        touches.add(e.pointerId);
        if (touches.size > 1) {            // pincement : Leaflet s'en charge
            if (gesture) finish(null, false);
            return;
        }
        down = { x: e.clientX, y: e.clientY, t: e.timeStamp };
        const second = lastTap && e.timeStamp - lastTap.t < DOUBLE_TAP_MS
            && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_TAP_PX;
        if (!second) return;
        const rect = el.getBoundingClientRect();
        gesture = { id: e.pointerId, y: e.clientY, zoom: map.getZoom(), point: L.point(e.clientX - rect.left, e.clientY - rect.top), moved: false };
        map.dragging.disable();
        map.options.zoomSnap = 0;           // zoom continu pendant le geste
        e.stopPropagation();
        e.preventDefault();
    }, true);

    el.addEventListener('pointermove', (e) => {
        if (!gesture || e.pointerId !== gesture.id) return;
        const dy = e.clientY - gesture.y;
        if (!gesture.moved && Math.abs(dy) < TAP_MOVE_PX) return;
        gesture.moved = true;
        map.setZoomAround(gesture.point, zoomFromDrag(gesture.zoom, dy, map.getMinZoom(), map.getMaxZoom()), { animate: false });
        e.stopPropagation();
        e.preventDefault();
    }, true);

    el.addEventListener('pointerup', (e) => {
        if (e.pointerType !== 'touch') return;
        touches.delete(e.pointerId);
        if (gesture && e.pointerId === gesture.id) {
            finish(e, true);
            return;
        }
        const isTap = down && e.timeStamp - down.t < 250
            && Math.hypot(e.clientX - down.x, e.clientY - down.y) < TAP_MOVE_PX;
        lastTap = isTap ? { t: e.timeStamp, x: e.clientX, y: e.clientY } : null;
        down = null;
    }, true);

    el.addEventListener('pointercancel', (e) => {
        touches.delete(e.pointerId);
        if (gesture && e.pointerId === gesture.id) finish(null, false);
        down = null;
    }, true);

    el.addEventListener('click', (e) => {
        if (!swallowClick) return;
        swallowClick = false;
        e.stopPropagation();
        e.preventDefault();
    }, true);
}

// EPIC-T19 : etat et stock arrives (ou signal envoye) -> les pastilles suivent
document.addEventListener(SUMMARIES_EVENT, () => updateMapMarkers(false));

export function updateMapMarkers(fitBounds = true) {
    if (!mainMap || !AppState.mapInitialized) return;

    distributorMarkers.forEach(m => mainMap.removeLayer(m));
    const newMarkers = [];

    const filteredDistributors = getFilteredDistributors();

    filteredDistributors.forEach(d => {
        const isSubscribed = AppState.subscriptions.includes(d.id);

        const marker = L.marker([d.lat, d.lng], {
            icon: createDistributorIcon(d, isSubscribed),
            title: markerTitle(d),
            alt: markerTitle(d)
        }).addTo(mainMap);

        marker.distributorId = d.id;
        if (selectedId === d.id) marker.setZIndexOffset(1500);   // au-dessus du point bleu (1000)

        // EPIC-T26 : des pastilles se chevauchent sous le doigt -> petit menu de choix
        marker.on('click', () => {
            const ids = overlappingPinIds(marker);
            if (ids.length > 1) openPinChooser(marker.getLatLng(), ids);
            else openFromMap(d);
        });

        newMarkers.push(marker);
    });

    setDistributorMarkers(newMarkers);

    if (fitBounds && newMarkers.length > 0) {
        const group = new L.featureGroup(newMarkers);
        mainMap.fitBounds(group.getBounds().pad(0.1));
    }
}

// EPIC-T19 (maquette 2-feuille) : emoji sur fond blanc, anneau de la couleur
// de l'etat qui se remplit selon le stock, pointille gris sans info, pale
// au-dela de 2 h ; le favori est un petit coeur (la couleur dit l'etat).
function createDistributorIcon(d, isSubscribed) {
    const summary = getDistributorSummary(d);
    const soft = summary.state !== 'unknown' && !summary.fresh;
    const pending = d.reviewStatus === 'pending';   // EPIC-T21 : vu par l'auteur et l'admin seulement
    const isLocated = located.id === d.id && Date.now() < located.until;   // EPIC-T23
    const isSelected = selectedId === d.id;   // EPIC-T26 : fiche ouverte
    const fav = isSubscribed ? '<span class="distributor-pin-fav" aria-hidden="true">♥</span>' : '';
    return L.divIcon({
        className: 'distributor-marker-container',
        html: `<div class="distributor-pin is-${summary.state}${soft ? ' is-soft' : ''}${pending ? ' is-pending' : ''}${isLocated ? ' is-located' : ''}${isSelected ? ' is-selected' : ''}">${renderStatusRing(summary, 'distributor-pin-ring')}<span class="distributor-pin-emoji" aria-hidden="true">${escapeHTML(d.emoji || '📍')}</span>${fav}</div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -24]
    });
}

// Ouvrir une fiche depuis la carte : centrer sans jamais dezoomer (au-dela du
// zoom 15, la carte garde le zoom choisi pour separer des pastilles proches).
function openFromMap(d) {
    const zoom = Math.max(mainMap.getZoom(), 15);
    mainMap.setView(centerAboveSheet([d.lat, d.lng], zoom), zoom);
    if (window.showDetails) window.showDetails(d.id);   // bottom sheet (pattern Google Maps)
}

// EPIC-T26 : sur telephone, la fiche couvre le bas de l'ecran (58 %) : on centre
// la pastille dans la partie de carte qui reste visible au-dessus.
const SHEET_RATIO = 0.64;
function centerAboveSheet(latlng, zoom) {
    if (!isSheetLayout()) return latlng;
    const rect = mainMap.getContainer().getBoundingClientRect();
    const area = document.getElementById('dist-modal-overlay')?.getBoundingClientRect();
    const sheetTop = area && area.height ? area.top + area.height * (1 - SHEET_RATIO) : window.innerHeight * (1 - SHEET_RATIO);
    const visibleCenter = (rect.top + Math.min(sheetTop, rect.bottom)) / 2;
    const mapCenter = (rect.top + rect.bottom) / 2;
    const shift = Math.max(0, mapCenter - visibleCenter);
    return mainMap.unproject(mainMap.project(latlng, zoom).add([0, shift]), zoom);
}

// Pastille de la fiche ouverte (EPIC-T26) : mise en avant, survit a une
// re-creation des pastilles (arrivee des etats, filtre).
let selectedId = null;
export function setSelectedPin(id) {
    selectedId = id || null;
    distributorMarkers.forEach(m => {
        const pin = m.getElement()?.querySelector('.distributor-pin');
        const on = m.distributorId === selectedId;
        pin?.classList.toggle('is-selected', on);
        m.setZIndexOffset(on ? 1500 : 0);
    });
}

// Rayon de toucher : plus large au doigt qu'a la souris (une pastille fait 44 px).
function tapRadius() {
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    return coarse ? 40 : 24;
}

function overlappingPinIds(marker) {
    const center = mainMap.latLngToContainerPoint(marker.getLatLng());
    const points = distributorMarkers.map(m => {
        const p = mainMap.latLngToContainerPoint(m.getLatLng());
        return { id: m.distributorId, x: p.x, y: p.y };
    });
    return pinsNear(points, center.x, center.y, tapRadius());
}

function describePinChoice(d) {
    if (d.reviewStatus === 'pending') return 'En attente de validation';
    const s = getDistributorSummary(d);
    return s.stock ? `${s.label} · ${s.stock}` : s.label;
}

function openPinChooser(latlng, ids) {
    const items = ids.map(id => AppState.distributors.find(x => x.id === id)).filter(Boolean);
    const menu = document.createElement('div');
    menu.className = 'pin-chooser';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', `${items.length} distributeurs ici`);
    menu.innerHTML = `<p class="pin-chooser-title">${items.length} distributeurs ici</p>` + items.map(d => `
        <button type="button" class="pin-choice" role="menuitem" data-id="${escapeHTML(d.id)}">
            <span class="pin-choice-emoji" aria-hidden="true">${escapeHTML(d.emoji || '📍')}</span>
            <span class="pin-choice-text"><b>${escapeHTML(d.name)}</b><small>${escapeHTML(describePinChoice(d))}</small></span>
        </button>`).join('');
    menu.addEventListener('click', (e) => {
        const btn = e.target.closest('.pin-choice');
        if (!btn) return;
        const d = AppState.distributors.find(x => x.id === btn.dataset.id);
        mainMap.closePopup();
        if (d) openFromMap(d);
    });
    L.popup({ closeButton: false, className: 'pin-chooser-popup', offset: [0, -18], autoPanPadding: [16, 16], maxWidth: 300 })
        .setLatLng(latlng)
        .setContent(menu)
        .openOn(mainMap);
    menu.querySelector('.pin-choice')?.focus({ preventScroll: true });
}

function markerTitle(d) {
    if (d.reviewStatus === 'pending') return `${d.name} : en attente de validation`;
    const s = getDistributorSummary(d);
    return `${d.name} : ${s.label}${s.stock ? `, ${s.stock}` : ''}`;
}

export function centerMapOnUser() {
    if (!mainMap) {
        showToast('Carte non initialisee', 'warning');
        return;
    }
    if (!navigator.geolocation) {
        showToast('Géolocalisation non supportée par ton navigateur', 'warning');
        return;
    }

    showToast('Localisation en cours...', 'default');

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            // Mettre a jour la position dans l'etat
            AppState.userLocation = { lat, lng };

            // Mettre a jour le marker existant ou en creer un (ne PAS en creer un 2eme)
            if (userMarker) {
                userMarker.setLatLng([lat, lng]);
            } else {
                const userIcon = L.divIcon({
                    className: 'user-marker-container',
                    html: '<div class="user-marker"></div>',
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                });
                const newMarker = L.marker([lat, lng], {
                    icon: userIcon,
                    zIndexOffset: 1000
                }).addTo(mainMap);
                newMarker.bindPopup('<strong>Vous etes ici</strong>');
                setUserMarker(newMarker);
            }

            // Centrer la carte
            mainMap.setView([lat, lng], 15);
            showToast('Centre sur ta position', 'success');
        },
        (err) => {
            let msg = 'Position indisponible';
            if (err.code === 1) msg = 'Autorisation géoloc refusée';
            else if (err.code === 3) msg = 'Géoloc trop lente, réessaie';
            showToast(msg, 'warning');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

export function zoomIn() {
    if (mainMap) mainMap.zoomIn();
}

export function zoomOut() {
    if (mainMap) mainMap.zoomOut();
}

// Pastille localisee (EPIC-T23) : le halo survit si les pastilles sont recreees
// (arrivee des etats, filtre) pendant qu'il pulse.
let located = { id: null, until: 0 };

// EPIC-T23 : « Voir sur la carte » depuis la fiche. Centre la carte (zoom de
// rue), leve un filtre de type qui masquait la pastille, la fait pulser. Retour :
// false si la carte n'existe pas encore (deep link avant la geolocalisation).
export function locateOnMap(id) {
    const d = AppState.distributors.find(x => x.id === id);
    if (!d || !mainMap || !AppState.mapInitialized) return false;
    let marker = distributorMarkers.find(m => m.distributorId === id);
    if (!marker && AppState.activeFilters.length) {
        AppState.activeFilters = [];
        document.querySelectorAll('.filter-chip').forEach(chip => chip.classList.remove('active'));
        updateMapMarkers(false);
        marker = distributorMarkers.find(m => m.distributorId === id);
    }
    mainMap.setView([d.lat, d.lng], Math.max(mainMap.getZoom(), 17), { animate: true });
    located = { id, until: Date.now() + 3200 };
    if (marker) {
        const pin = marker.getElement()?.querySelector('.distributor-pin');
        if (pin) {
            pin.classList.remove('is-located');
            void pin.offsetWidth;   // relancer l'animation
            pin.classList.add('is-located');
        }
        marker.setZIndexOffset(1000);
    }
    setTimeout(() => {
        located = { id: null, until: 0 };
        document.querySelectorAll('.distributor-pin.is-located').forEach(el => el.classList.remove('is-located'));
    }, 3200);
    return true;
}

// Ancien nom (non utilise) garde pour compatibilite
export const highlightOnMap = locateOnMap;
