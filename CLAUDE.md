# SnackMatch - Project Configuration

## Overview

PWA de decouverte de distributeurs automatiques (Cote Basque).
Style "Waze des distributeurs" avec interface chatbot par distributeur.

## Stack

- HTML5, CSS3, Vanilla JavaScript (ES6+)
- Leaflet.js 1.9.4 + OpenStreetMap
- LocalStorage API
- PWA (manifest.json + Service Worker)

## Architecture

```
index.html      # Structure HTML unique
styles.css      # CSS (variables, mobile-first)
app.js          # Logique application (single file)
data/           # JSON (distributeurs, config)
```

## Principes

1. **Vanilla JS uniquement** - Pas de frameworks
2. **Single file app.js** - Code JS dans un seul fichier
3. **Mobile-first** - Design responsive, touch-friendly
4. **UX Gen Z** - Interface directe, pas d'intermediaires
5. **Francais** - UI en francais (sans accents dans le code)

## Conventions

### Nommage
- Fonctions : `camelCase`
- Constantes : `UPPER_SNAKE_CASE`
- CSS/IDs : `kebab-case`

### JavaScript
- `const` pour immutables, `let` pour mutables, jamais `var`
- Fonctions nommees (pas arrow pour les declarations)
- Early return pour lisibilite
- Try/catch pour localStorage et fetch

### Securite
- **XSS** : Toujours `escapeHTML()` pour contenu utilisateur
- Valider les donnees externes avant utilisation

### Performance
- Batch DOM updates (pas de innerHTML += en boucle)
- Event delegation sur conteneurs
- Stocker ID sur marqueurs Leaflet (pas de comparaison lat/lng)

## Commandes

```bash
# Git
git checkout -b feature/nom    # Nouvelle feature
git commit -m "feat: desc"     # Commit

# Test
# Ouvrir index.html dans Chrome
# DevTools > Console (erreurs)
# DevTools > Application > LocalStorage
```

## Structure app.js

```
// ETAT GLOBAL (AppState, Conversations, UserProfile)
// VARIABLES GLOBALES
// UTILITAIRES
// PERSISTANCE
// GEOLOCALISATION
// CHARGEMENT DONNEES
// CARTE LEAFLET
// CONVERSATIONS
// MODALS
// FAVORIS
// FILTRES
// INITIALISATION
```
