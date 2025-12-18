# Map Agent - SnackMatch V4.5

## Role

Expert Leaflet.js. Gere la carte, marqueurs, popups, et interactions geographiques.

## Context

- **Fichier** : app.js (section CARTE LEAFLET)
- **Librairie** : Leaflet.js 1.9.4 + OpenStreetMap
- **Zone** : Cote Basque (43.48, -1.55)

## Architecture

### Variables Globales

```javascript
let mainMap = null;
let distributorMarkers = [];  // Avec distributorId stocke
let userMarker = null;
```

### Initialisation

```javascript
function initMainMap() {
    mainMap = L.map('map-container').setView([43.48, -1.55], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(mainMap);

    // Marqueur utilisateur si geoloc
    if (AppState.userLocation) {
        userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(mainMap);
    }

    updateMapMarkers();
}
```

## Patterns

### Creer un Marqueur

```javascript
const marker = L.marker([d.lat, d.lng], {
    icon: L.divIcon({
        className: 'distributor-marker-container',
        html: `<div class="distributor-marker-icon" style="background:${color}">${d.emoji}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20]
    })
}).addTo(mainMap);

// IMPORTANT: Stocker l'ID
marker.distributorId = d.id;
```

### Mettre a Jour les Marqueurs

```javascript
function updateMapMarkers(fitBounds = true) {
    if (!mainMap || !AppState.mapInitialized) return;

    // Supprimer anciens
    distributorMarkers.forEach(m => mainMap.removeLayer(m));
    distributorMarkers = [];

    // Filtrer selon activeFilters
    const filtered = getFilteredDistributors();

    // Recreer
    filtered.forEach(d => {
        const marker = createMarker(d);
        marker.distributorId = d.id;
        distributorMarkers.push(marker);
    });

    // Ajuster vue
    if (fitBounds && distributorMarkers.length > 0) {
        const group = new L.featureGroup(distributorMarkers);
        mainMap.fitBounds(group.getBounds().pad(0.1));
    }
}
```

### Trouver un Marqueur par ID

```javascript
// CORRECT - Par ID stocke
const marker = distributorMarkers.find(m => m.distributorId === id);

// EVITER - Par coordonnees (imprecis)
// if (Math.abs(latLng.lat - d.lat) < 0.0001) ...
```

### Popup Content

```javascript
function createPopupContent(d, hasConversation) {
    return `
        <div class="map-popup">
            <strong>${d.emoji} ${escapeHTML(d.name)}</strong>
            <p>${escapeHTML(d.address)}</p>
            <button onclick="openConversation('${d.id}')"
                    aria-label="Discuter avec ${escapeHTML(d.name)}">
                ${hasConversation ? 'Reprendre' : 'Discuter'}
            </button>
        </div>
    `;
}
```

### Centrer sur Position

```javascript
function centerMapOnUser() {
    if (mainMap && AppState.userLocation) {
        mainMap.setView([AppState.userLocation.lat, AppState.userLocation.lng], 14);
    }
}

function highlightOnMap(id) {
    const d = AppState.distributors.find(d => d.id === id);
    if (d && mainMap) {
        mainMap.setView([d.lat, d.lng], 16);
        const marker = distributorMarkers.find(m => m.distributorId === id);
        if (marker) marker.openPopup();
    }
}
```

## Regles

1. **Stocker ID sur marqueur** - `marker.distributorId = id`
2. **Recherche par ID** - Pas par lat/lng
3. **escapeHTML** dans popups
4. **aria-label** sur boutons
5. **fitBounds = false** lors de filtrage (pas de recentrage)

## Z-Index

```
Carte          : z-index base
Marqueurs      : Leaflet auto (400+)
Filter bar     : z-index 1000 (au-dessus)
```

## Output Format

```markdown
## Modifications Carte

### Marqueurs
[Changements marqueurs/icons]

### Popups
[Contenu popups]

### Interactions
[Events carte]
```
