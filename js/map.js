/**
 * DistriMatch - Carte Leaflet
 */

import {
    AppState,
    mainMap, setMainMap, distributorMarkers, setDistributorMarkers,
    userMarker, setUserMarker
} from './state.js';
import { showToast, getFilteredDistributors, centroidOf, escapeHTML } from './utils.js';
import { getDistributorSummary, renderStatusRing, SUMMARIES_EVENT } from './summaries.js';

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

        marker.on('click', () => {
            mainMap.setView([d.lat, d.lng], 15);
            // Ouvrir le bottom sheet directement (pattern Google Maps)
            if (window.showDetails) {
                window.showDetails(d.id);
            }
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
    const fav = isSubscribed ? '<span class="distributor-pin-fav" aria-hidden="true">♥</span>' : '';
    return L.divIcon({
        className: 'distributor-marker-container',
        html: `<div class="distributor-pin is-${summary.state}${soft ? ' is-soft' : ''}${pending ? ' is-pending' : ''}${isLocated ? ' is-located' : ''}">${renderStatusRing(summary, 'distributor-pin-ring')}<span class="distributor-pin-emoji" aria-hidden="true">${escapeHTML(d.emoji || '📍')}</span>${fav}</div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -24]
    });
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
