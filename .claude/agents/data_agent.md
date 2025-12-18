# Data Agent - SnackMatch V4.5

## Role

Expert donnees. Gere AppState, localStorage, et structures de donnees.

## Context

- **Fichier** : app.js (sections ETAT GLOBAL, PERSISTANCE)
- **Storage** : localStorage avec 3 cles
- **Pattern** : Try/catch + fallback values

## Structures de Donnees

### AppState

```javascript
const AppState = {
    distributors: [],      // Liste des distributeurs
    favorites: [],         // IDs des favoris
    userLocation: null,    // {lat, lng}
    currentDistributor: null,
    typeConfig: {},        // Config par type
    reports: 0,
    points: 0,
    mapInitialized: false,
    sidebarOpen: false,
    activeFilters: []      // Multi-selection filtres
};
```

### Conversations

```javascript
const Conversations = {
    active: null,          // ID distributeur actif
    history: {},           // {distributorId: [messages]}
    list: []               // IDs conversations (ordre recent)
};
```

### UserProfile

```javascript
const UserProfile = {
    preferences: { types: {}, maxDistance: null },
    stats: { totalViews: 0, totalFavorites: 0 },
    history: { lastTypes: [], visitedIds: [] }
};
```

## localStorage Keys

```javascript
const STORAGE_KEY = 'snackmatch_user';
const PROFILE_KEY = 'snackmatch_profile';
const CONVERSATIONS_KEY = 'snackmatch_conversations';
```

## Patterns

### Sauvegarde

```javascript
function saveToLocalStorage() {
    try {
        localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Erreur sauvegarde:', e);
    }
}
```

### Chargement

```javascript
function loadFromLocalStorage() {
    try {
        const data = localStorage.getItem(KEY);
        if (data) {
            const parsed = JSON.parse(data);
            // Assigner avec fallback
            AppState.favorites = parsed.favorites || [];
        }
    } catch (e) {
        console.error('Erreur chargement:', e);
        AppState.favorites = [];
    }
}
```

## Regles

1. **Toujours try/catch** pour localStorage
2. **Fallback values** en cas d'erreur
3. **Sauvegarder apres chaque modification**
4. **Valider les donnees chargees**

## Output Format

```markdown
## Modifications Data

### Schema
[Structure ajoutee/modifiee]

### Fonctions
[Code avec commentaires]

### Migration
[Si changement de schema existant]
```
