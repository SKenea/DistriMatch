# Development Standards - SnackMatch

## 1. JavaScript Standards

### 1.1 Structure du Code

```javascript
// ============================================
// NOM DE LA SECTION EN MAJUSCULES
// ============================================

function nomFonction(param1, param2) {
    // Implementation
}
```

### 1.2 Declarations

```javascript
// CORRECT - const pour les valeurs immutables
const STORAGE_KEY = 'snackmatch_user';
const AppState = { ... };

// CORRECT - let pour les valeurs mutables
let mainMap = null;
let distributorMarkers = [];

// INTERDIT - var (scope issues)
var oldStyle = 'non';
```

### 1.3 Fonctions

```javascript
// CORRECT - Fonctions nommees (hoisting, stack traces clairs)
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    // ...
    return distance;
}

// CORRECT - Arrow functions pour callbacks courts
distributors.forEach(d => {
    // ...
});

// CORRECT - Early return pour lisibilite
function getDistributor(id) {
    if (!id) return null;
    return AppState.distributors.find(d => d.id === id);
}
```

### 1.4 Gestion d'Erreurs

```javascript
// CORRECT - Try/catch pour operations risquees
function loadFromLocalStorage() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            // ...
        }
    } catch (e) {
        console.error('Erreur chargement localStorage:', e);
        AppState.favorites = [];
    }
}

// CORRECT - Validation des parametres
function showDetails(id) {
    const distributor = AppState.distributors.find(d => d.id === id);
    if (!distributor) return;
    // ...
}
```

### 1.5 Async/Await

```javascript
// CORRECT - async/await pour operations asynchrones
async function loadDistributors() {
    try {
        const response = await fetch('data/distributors.json');
        const data = await response.json();
        AppState.distributors = data.distributors;
    } catch (e) {
        console.error('Erreur chargement:', e);
        AppState.distributors = [];
    }
}
```

## 2. HTML Standards

### 2.1 Structure

```html
<!-- CORRECT - Semantique HTML5 -->
<header class="top-nav">...</header>
<main id="map-zone">...</main>
<footer class="bottom-nav">...</footer>

<!-- CORRECT - IDs pour JS, classes pour CSS -->
<div id="chat-modal" class="modal-overlay">
    <div class="modal-content">...</div>
</div>
```

### 2.2 Accessibilite

```html
<!-- CORRECT - Labels et ARIA -->
<button
    onclick="openConversation('${id}')"
    class="btn-popup-chat"
    aria-label="Discuter avec ${name}">
    Discuter
</button>

<!-- CORRECT - Alt pour images -->
<img src="icon.png" alt="Icone distributeur">

<!-- CORRECT - Roles semantiques -->
<nav role="navigation" aria-label="Navigation principale">
```

### 2.3 Data Attributes

```html
<!-- CORRECT - data-* pour donnees JS -->
<button class="filter-chip" data-type="pizza">
    <span class="chip-emoji">🍕</span>
    <span class="chip-label">Pizza</span>
</button>
```

## 3. CSS Standards

### 3.1 Variables CSS

```css
:root {
    /* Couleurs */
    --primary: #6366f1;
    --primary-dark: #4f46e5;
    --secondary: #ec4899;
    --success: #22c55e;
    --warning: #f59e0b;
    --danger: #ef4444;

    /* Neutres */
    --white: #ffffff;
    --light: #f1f5f9;
    --gray: #64748b;
    --dark: #1e293b;

    /* Espacements */
    --spacing-xs: 4px;
    --spacing-sm: 8px;
    --spacing-md: 16px;
    --spacing-lg: 24px;

    /* Rayons */
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
    --radius-full: 9999px;

    /* Ombres */
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.1);
    --shadow-lg: 0 8px 24px rgba(0,0,0,0.15);

    /* Z-index */
    --z-base: 1;
    --z-dropdown: 100;
    --z-sticky: 200;
    --z-modal: 1000;
    --z-toast: 2000;
}
```

### 3.2 Ordre des Proprietes

```css
.element {
    /* 1. Positionnement */
    position: absolute;
    top: 0;
    left: 0;
    z-index: var(--z-modal);

    /* 2. Box Model */
    display: flex;
    width: 100%;
    padding: var(--spacing-md);
    margin: 0;

    /* 3. Typographie */
    font-size: 14px;
    font-weight: 600;
    color: var(--dark);

    /* 4. Visuel */
    background: var(--white);
    border: 1px solid var(--light);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);

    /* 5. Animations */
    transition: all 0.2s ease;
}
```

### 3.3 Mobile First

```css
/* Base = mobile */
.container {
    padding: var(--spacing-sm);
}

/* Tablet */
@media (min-width: 768px) {
    .container {
        padding: var(--spacing-md);
    }
}

/* Desktop */
@media (min-width: 1024px) {
    .container {
        padding: var(--spacing-lg);
        max-width: 1200px;
        margin: 0 auto;
    }
}
```

### 3.4 Animations

```css
/* CORRECT - Transitions fluides */
.button {
    transition: transform 0.2s ease, background-color 0.2s ease;
}

.button:active {
    transform: scale(0.95);
}

/* CORRECT - Keyframes pour animations complexes */
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

.toast {
    animation: fadeIn 0.3s ease forwards;
}
```

## 4. Securite

### 4.1 XSS Prevention

```javascript
// OBLIGATOIRE - Echapper le contenu utilisateur
function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// CORRECT - Utilisation
const html = `<p>${escapeHTML(userInput)}</p>`;

// INTERDIT - Injection directe
const html = `<p>${userInput}</p>`; // DANGER XSS
```

### 4.2 Validation

```javascript
// CORRECT - Valider les donnees externes
function processDistributor(data) {
    if (!data || typeof data !== 'object') return null;
    if (!data.id || !data.name) return null;

    return {
        id: String(data.id),
        name: escapeHTML(data.name),
        lat: Number(data.lat) || 0,
        lng: Number(data.lng) || 0
    };
}
```

## 5. Performance

### 5.1 DOM Manipulation

```javascript
// CORRECT - Batch DOM updates
const html = items.map(item => `<li>${item}</li>`).join('');
container.innerHTML = html;

// INTERDIT - Multiple DOM updates
items.forEach(item => {
    container.innerHTML += `<li>${item}</li>`; // LENT
});
```

### 5.2 Event Delegation

```javascript
// CORRECT - Event delegation
document.getElementById('list').addEventListener('click', (e) => {
    if (e.target.matches('.item-btn')) {
        handleItemClick(e.target.dataset.id);
    }
});

// EVITER - Multiple listeners
items.forEach(item => {
    item.addEventListener('click', handleClick); // MEMOIRE
});
```

### 5.3 Debounce/Throttle

```javascript
// CORRECT - Debounce pour recherche
let searchTimeout;
function performSearch(query) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        // Recherche effective
    }, 300);
}
```

## 6. Commentaires

### 6.1 Sections

```javascript
// ============================================
// NOM DE SECTION
// ============================================
```

### 6.2 Fonctions Complexes

```javascript
/**
 * Calcule la distance entre deux points GPS (formule Haversine)
 * @param {number} lat1 - Latitude point 1
 * @param {number} lng1 - Longitude point 1
 * @param {number} lat2 - Latitude point 2
 * @param {number} lng2 - Longitude point 2
 * @returns {number} Distance en kilometres
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
    // ...
}
```

### 6.3 TODOs

```javascript
// TODO: Implementer la pagination
// FIXME: Bug sur iOS Safari
// HACK: Workaround pour Leaflet z-index
```

## 7. Versioning

### 7.1 Fichiers

```html
<!-- Cache busting avec version -->
<link rel="stylesheet" href="styles.css?v=13">
<script src="app.js?v=11"></script>
```

### 7.2 Header app.js

```javascript
/**
 * SnackMatch V4.5 - Description courte
 * Description fonctionnalites principales
 */
```

### 7.3 Console logs

```javascript
console.log('SnackMatch V4.5 - Initialisation...');
// ...
console.log('SnackMatch V4.5 - Pret !');
```
