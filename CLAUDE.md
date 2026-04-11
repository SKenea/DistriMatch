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

Application single-page en 3 fichiers principaux :

- `index.html` - Structure HTML unique, charge Leaflet CDN + `styles.css` + `app.js`
- `styles.css` - CSS variables, mobile-first, ~2500 lignes
- `app.js` - Toute la logique JS dans un seul fichier, ~2500 lignes
- `data/distributors.json` - Donnees des distributeurs (source de verite)
- `sw.js` - Service Worker (desactive, se desinstalle automatiquement)
- `js/` - Fichiers legacy non utilises (tout est dans `app.js`)

### Structure de app.js (sections dans l'ordre)

```
ETAT GLOBAL        - AppState, Conversations, ActivityFeed, UserProfile, AddMode
CONSTANTES         - DISTRIBUTOR_TYPES, cles localStorage (STORAGE_KEY, etc.)
NOTIFICATIONS      - NotificationPrefs, NotificationQueue, NOTIFICATION_TYPES
MESSAGES PROACTIFS - GREETING_MESSAGES (par creneau horaire), ALERT_MESSAGES
UTILITAIRES        - escapeHTML(), showToast(), getTimeSlot(), calculateDistance()
PERSISTANCE        - save/load LocalStorage, profil, conversations, activite, votes
GEOLOCALISATION    - getUserLocation(), watchPosition
CHARGEMENT DONNEES - loadDistributors() (donnees embarquees en fallback file://)
CARTE LEAFLET      - initMainMap(), addDistributorMarkers(), marqueurs custom
CONVERSATIONS      - openConversation(), addMessage(), reponses bot contextuelles
FILTRES            - initFilterChips(), toggleFilter() par type de distributeur
SIDEBAR            - toggleSidebar(), closeSidebar()
MODAL DETAILS      - openDistributorDetails(), signalements, votes
ABONNEMENTS        - toggleSubscription(), messages proactifs a l'abonnement
NOTIFICATIONS      - geofencing, heures calmes, cooldown, produits suivis
PROFIL             - switchView(), stats utilisateur
RECHERCHE          - recherche par nom/ville/type
SIGNALEMENT        - 6 types (rupture stock, panne, prix incorrect, etc.)
FEED ACTIVITE      - activites communautaires, filtres
AJOUT DISTRIBUTEUR - mode ajout avec clic carte
INITIALISATION     - DOMContentLoaded, event listeners, demarrage geofence
```

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
- Les donnees distributeurs sont embarquees en dur dans `loadDistributors()` comme fallback pour le mode `file://`. Le JSON dans `data/distributors.json` est la source de verite mais n'est charge que via fetch.
- Le `README.md` decrit la V3.0 et est obsolete (swipe cards, bottom nav 4 onglets). Ne pas s'en inspirer pour l'architecture actuelle.
