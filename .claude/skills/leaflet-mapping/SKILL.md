---
name: leaflet-mapping
description: Manages Leaflet.js map markers, popups, and interactions. Use when working with map features, markers, popups, geolocation, or map-related UI in SnackMatch.
---

# Leaflet Mapping

## Quick Reference

```javascript
// Initialiser la carte
const map = L.map('map-container').setView([43.48, -1.55], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// Creer un marqueur custom
const marker = L.marker([lat, lng], {
    icon: L.divIcon({
        className: 'marker-container',
        html: `<div class="marker-icon">${emoji}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20]
    })
}).addTo(map);

// Stocker l'ID sur le marqueur
marker.distributorId = id;

// Bindre un popup
marker.bindPopup(`<div class="popup">${content}</div>`);
```

## Patterns du Projet

### Structure des Marqueurs

Toujours stocker l'ID du distributeur sur le marqueur :
```javascript
marker.distributorId = distributor.id;
```

Rechercher un marqueur par ID (pas par lat/lng) :
```javascript
const marker = distributorMarkers.find(m => m.distributorId === id);
```

### Mise a Jour des Marqueurs

Pattern pour eviter le flickering :
```javascript
function updateMapMarkers(fitBounds = true) {
    // Supprimer les anciens
    distributorMarkers.forEach(m => mainMap.removeLayer(m));
    distributorMarkers = [];

    // Filtrer selon les filtres actifs
    const filtered = getFilteredDistributors();

    // Recreer les marqueurs
    filtered.forEach(d => {
        const marker = createMarker(d);
        distributorMarkers.push(marker);
    });

    // Ajuster la vue si demande
    if (fitBounds && distributorMarkers.length > 0) {
        const group = new L.featureGroup(distributorMarkers);
        mainMap.fitBounds(group.getBounds().pad(0.1));
    }
}
```

### Icones Custom

```javascript
function createDistributorIcon(d, isFavorite) {
    const color = isFavorite ? '#ef4444' : '#6366f1';
    return L.divIcon({
        className: 'distributor-marker-container',
        html: `<div style="background:${color}">${d.emoji}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });
}
```

## Z-Index

- Carte : z-index base (1)
- Marqueurs : z-index auto Leaflet
- Popups : z-index Leaflet (400+)
- Filter bar au-dessus : z-index 1000
