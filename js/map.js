/**
 * DistriMatch - Carte Leaflet
 */

import {
    AppState,
    mainMap, setMainMap, distributorMarkers, setDistributorMarkers,
    userMarker, setUserMarker
} from './state.js';
import { showToast, getFilteredDistributors, centroidOf } from './utils.js';

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

export function updateMapMarkers(fitBounds = true) {
    if (!mainMap || !AppState.mapInitialized) return;

    distributorMarkers.forEach(m => mainMap.removeLayer(m));
    const newMarkers = [];

    const filteredDistributors = getFilteredDistributors();

    filteredDistributors.forEach(d => {
        const isSubscribed = AppState.subscriptions.includes(d.id);

        const marker = L.marker([d.lat, d.lng], {
            icon: createDistributorIcon(d, isSubscribed)
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

function createDistributorIcon(d, isSubscribed) {
    // Favori = rouge brand (--primary), coherent avec le coeur "Favori"
    // de la fiche qui devient rouge quand actif. Non favori = orange
    // terracotta (--warning).
    const color = isSubscribed ? '#E63946' : '#F4A261';

    return L.divIcon({
        className: 'distributor-marker-container',
        html: `<div class="distributor-marker-icon" style="background:${color};width:36px;height:36px;">${d.emoji}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20]
    });
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

export function highlightOnMap(id) {
    const d = AppState.distributors.find(d => d.id === id);
    if (d && mainMap) {
        mainMap.setView([d.lat, d.lng], 16);

        const marker = distributorMarkers.find(m => m.distributorId === id);
        if (marker) {
            marker.openPopup();
        }
    }
}
