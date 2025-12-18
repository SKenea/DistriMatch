# CLAUDE.md - SnackMatch Project Configuration

## Project Overview

**SnackMatch** est une PWA de decouverte de distributeurs automatiques (Cote Basque).
Style "Waze des distributeurs" avec interface chatbot par distributeur.

## Stack Technique

- **Frontend** : HTML5, CSS3, Vanilla JavaScript (ES6+)
- **Cartes** : Leaflet.js 1.9.4 + OpenStreetMap
- **Persistence** : LocalStorage API
- **PWA** : manifest.json + Service Worker

## Architecture Fichiers

```
/
├── index.html      # Structure HTML unique
├── styles.css      # Styles CSS (variables, responsive)
├── app.js          # Logique application (single file)
├── data/           # Donnees JSON (distributeurs, config)
├── icons/          # Icones PWA
└── docs/           # Documentation technique
```

## Regles de Developpement

Standards de code detailles : @.claude/rules/development_standards.md

### Principes Cles

1. **Vanilla JS uniquement** - Pas de frameworks (React, Vue, etc.)
2. **Single file app.js** - Tout le code JS dans un seul fichier
3. **Mobile-first** - Design responsive, touch-friendly
4. **UX Gen Z** - Interface directe, pas d'intermediaires inutiles
5. **Francais** - UI et commentaires en francais (sans accents dans le code)

### Conventions de Nommage

- **Fonctions** : camelCase (`updateMapMarkers`, `showToast`)
- **Constantes** : UPPER_SNAKE_CASE (`STORAGE_KEY`, `API_URL`)
- **CSS Classes** : kebab-case (`filter-chip`, `map-popup`)
- **IDs HTML** : kebab-case (`chat-modal`, `favorites-list`)

### Structure app.js

```javascript
/**
 * SnackMatch VX.X - Description
 */

// ETAT GLOBAL
const AppState = { ... };
const Conversations = { ... };
const UserProfile = { ... };

// VARIABLES GLOBALES
let mainMap = null;
// ...

// UTILITAIRES
// PERSISTANCE
// GEOLOCALISATION
// CHARGEMENT DONNEES
// CARTE LEAFLET
// SYSTEME CONVERSATIONS
// MODALS
// FAVORIS
// RECHERCHE
// FILTRES
// SIDEBAR
// PROFIL
// SIGNALEMENTS
// INITIALISATION
```

## Commandes Git

```bash
# Branches
main                    # Production
feature/*               # Nouvelles fonctionnalites

# Commit format
feat: description       # Nouvelle fonctionnalite
fix: description        # Correction bug
refactor: description   # Refactoring
docs: description       # Documentation
```

## Tests

- Ouvrir `index.html` dans Chrome
- DevTools > Console pour erreurs
- DevTools > Application > LocalStorage pour donnees
- Test mobile : DevTools > Toggle device toolbar

## Points d'Attention

1. **XSS** : Toujours utiliser `escapeHTML()` pour le contenu utilisateur
2. **Performance** : Eviter de recreer les marqueurs Leaflet inutilement
3. **Accessibilite** : Ajouter `aria-label` aux boutons interactifs
4. **Offline** : L'app doit fonctionner sans connexion (LocalStorage)
