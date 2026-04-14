# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

SnackMatch - PWA "Waze des distributeurs automatiques" pour la Cote Basque.
Interface carte Leaflet + chatbot par distributeur avec robots proactifs et notifications intelligentes.

## Stack

- HTML5, CSS3, Vanilla JavaScript (ES6+) - **pas de frameworks, pas de build system**
- Leaflet.js 1.9.4 + OpenStreetMap
- LocalStorage pour la persistance
- PWA (manifest.json, service worker desactive en dev)

## Architecture

Application single-page modulaire en ES modules (`<script type="module">`) :

- `index.html` - Structure HTML, charge Leaflet/Supabase CDN + `styles.css` + `js/app.js`
- `styles.css` - CSS variables, mobile-first, ~2500 lignes
- `data/distributors.json` - Donnees des distributeurs (source de verite)
- `sw.js` - Service Worker (desactive, se desinstalle automatiquement)
- `supabase/` - Schemas SQL (001_schema, 002_seed, 003_photos)

### Modules JS (`js/`)

```
js/app.js             - Point d'entree, Supabase init, chargement donnees, event listeners, window globals
js/state.js           - Etat global (AppState, Conversations, UserProfile...), constantes, donnees embarquees
js/utils.js           - Utilitaires (escapeHTML, calculateDistance, showToast...), persistance localStorage, profil implicite, geolocalisation
js/map.js             - Carte Leaflet (initMainMap, updateMapMarkers, popups, centrage)
js/navigation.js      - Navigation (switchTab, switchView, VIEW_CONFIG), sidebar, recherche, filtres, profil stats
js/distributor.js     - Page distributeur (showDetails), CRUD produits, photos, abonnements, itineraire
js/chat.js            - Conversations (openConversation, messages bot), messages proactifs, non lus
js/activity.js        - Feed activite, signalements (openReportModal, submitReport), votes communautaires
js/notifications.js   - Geofencing, heures calmes, cooldown, produits suivis, parametres UI
js/add-distributor.js - Mode ajout distributeur (clic carte, formulaire, photos, upload Supabase)
```

Les fonctions appelees depuis `onclick` inline dans le HTML dynamique sont exposees sur `window` dans `js/app.js`.

### Objets d'etat globaux cles

- **AppState** : distributeurs charges, abonnements, position, filtres actifs
- **Conversations** : historique messages par distributeur, compteurs non lus
- **NotificationPrefs** : heures calmes (22h-8h), rayon geofence, produits suivis
- **UserProfile** : preferences implicites, stats, historique (pas d'authentification)

### Persistance LocalStorage

8 cles distinctes : `snackmatch_user`, `snackmatch_profile`, `snackmatch_conversations`, `snackmatch_activity`, `snackmatch_votes`, `snackmatch_user_distributors`, `snackmatch_notification_prefs`, `snackmatch_notification_queue`

Migration automatique `favorites` -> `subscriptions` dans `loadFromLocalStorage()`.

### Types de distributeurs

9 types avec filtres : `pizza`, `bakery`, `fries`, `meals`, `cheese`, `dairy`, `meat`, `terroir`, `general`. Chaque type a un emoji, un label et un gradient CSS definis dans `data/distributors.json` (champ `typeConfig`).

### Donnees distributeurs (format JSON)

Chaque distributeur : `id`, `name`, `type`, `emoji`, `address`, `city`, `lat`, `lng`, `rating`, `reviewCount`, `status` (verified/warning), `priceRange`, `products[]` (name, price, available).

## Conventions

### Nommage
- Fonctions JS : `camelCase`
- Constantes JS : `UPPER_SNAKE_CASE`
- CSS classes/IDs : `kebab-case`

### JavaScript
- `const`/`let` uniquement, jamais `var`
- Fonctions nommees (pas arrow pour les declarations)
- Early return pour lisibilite
- Try/catch obligatoire pour localStorage et fetch

### Securite
- **XSS** : Toujours `escapeHTML()` pour tout contenu utilisateur affiche dans le DOM
- Valider les donnees externes avant utilisation

### Performance
- Batch DOM updates (pas de `innerHTML +=` en boucle)
- Event delegation sur conteneurs
- Stocker ID sur marqueurs Leaflet (`marker.distributorId`), pas de comparaison lat/lng

### UI
- Francais pour l'interface (sans accents dans le code source)
- Mobile-first, touch-friendly
- Toasts pour le feedback utilisateur (`showToast()`)

## Commandes

```bash
# Lancer en local (pas de build)
# Ouvrir index.html dans Chrome, ou :
npx http-server -p 8080 -c-1

# Tester avec Playwright MCP
# Naviguer vers http://localhost:8080 via browser_navigate
# Utiliser browser_snapshot et browser_screenshot pour verifier l'UI

# Debug
# DevTools > Console (erreurs JS)
# DevTools > Application > LocalStorage (donnees persistees)

# Git
git checkout -b feature/nom
git commit -m "feat: description"
```

## Points d'attention

- Le service worker est volontairement desactive (`sw.js` se desinstalle). Ne pas le reactiver sans plan de cache.
- Les donnees distributeurs sont embarquees en dur dans `js/state.js` (EMBEDDED_DATA) comme fallback pour le mode `file://`. Le JSON dans `data/distributors.json` est la source de verite mais n'est charge que via fetch. Supabase est prioritaire quand disponible.
