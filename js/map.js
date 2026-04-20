/**
 * DistriMatch - Carte Leaflet
 */

import {
    AppState, Conversations,
    mainMap, setMainMap, distributorMarkers, setDistributorMarkers,
    userMarker, setUserMarker
} from './state.js';
import { escapeHTML, formatDistance, showToast, getFilteredDistributors } from './utils.js';

// ============================================
// CARTE LEAFLET
// ============================================

export function initMainMap() {
    if (mainMap) return;

    const defaultCenter = AppState.userLocation || { lat: 43.4929, lng: -1.4748 };

    const map = L.map('main-map', {
        zoomControl: false
    }).setView([defaultCenter.lat, defaultCenter.lng], 13);

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

        setUserMarker(L.marker([AppState.userLocation.lat, AppState.userLocation.lng], {
            icon: userIcon,
            zIndexOffset: 1000
        }).addTo(mainMap));

        userMarker.bindPopup('<strong>Vous etes ici</strong>');
    }

    updateMapMarkers();
    console.log('[DistriMatch] Carte initialisee avec', AppState.distributors.length, 'distributeurs');
}

export function updateMapMarkers(fitBounds = true) {
    if (!mainMap || !AppState.mapInitialized) return;

    distributorMarkers.forEach(m => mainMap.removeLayer(m));
    const newMarkers = [];

    const filteredDistributors = getFilteredDistributors();

    filteredDistributors.forEach(d => {
        const isSubscribed = AppState.subscriptions.includes(d.id);
        const hasConversation = Conversations.list.includes(d.id);

        const marker = L.marker([d.lat, d.lng], {
            icon: createDistributorIcon(d, isSubscribed)
        }).addTo(mainMap);

        marker.distributorId = d.id;
        marker.bindPopup(createPopupContent(d, hasConversation));

        marker.on('click', () => {
            mainMap.setView([d.lat, d.lng], 15);
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
    const color = isSubscribed ? '#ef4444' : '#6366f1';

    return L.divIcon({
        className: 'distributor-marker-container',
        html: `<div class="distributor-marker-icon" style="background:${color};width:36px;height:36px;">${d.emoji}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20]
    });
}

function createPopupContent(d, hasConversation) {
    const distance = d.distance ? formatDistance(d.distance) : '';
    const isSubscribed = AppState.subscriptions.includes(d.id);

    return `
        <div class="map-popup">
            <strong>${d.emoji} ${escapeHTML(d.name)}</strong>
            <p>${escapeHTML(d.address)}</p>
            <p>★ ${d.rating} ${distance ? '- ' + distance : ''}</p>
            ${isSubscribed ? '<p style="color:#6366f1;font-weight:600;">🔔 Abonne</p>' : ''}
            <button onclick="showDetails('${d.id}')" class="btn-popup-details" aria-label="Voir la fiche de ${escapeHTML(d.name)}">
                Voir la fiche
            </button>
            <button onclick="openConversation('${d.id}')" class="btn-popup-chat" aria-label="${hasConversation ? 'Reprendre la conversation avec' : 'Discuter avec'} ${escapeHTML(d.name)}">
                ${hasConversation ? 'Reprendre' : 'Discuter'}
            </button>
        </div>
    `;
}

export function centerMapOnUser() {
    if (mainMap && AppState.userLocation) {
        mainMap.setView([AppState.userLocation.lat, AppState.userLocation.lng], 14);
        showToast('Centre sur ta position', 'success');
    } else {
        showToast('Position non disponible', 'warning');
    }
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
