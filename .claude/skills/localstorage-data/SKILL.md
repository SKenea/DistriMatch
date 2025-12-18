---
name: localstorage-data
description: Manages localStorage persistence for user data, favorites, profiles, and conversations. Use when saving or loading user preferences, favorites, or session data in SnackMatch.
---

# LocalStorage Data Management

## Cles du Projet

```javascript
const STORAGE_KEY = 'snackmatch_user';        // Favoris, points
const PROFILE_KEY = 'snackmatch_profile';      // Profil utilisateur
const CONVERSATIONS_KEY = 'snackmatch_conversations'; // Historique chat
```

## Patterns de Sauvegarde

### Sauvegarde avec Try/Catch

```javascript
function saveToLocalStorage() {
    const data = {
        favorites: AppState.favorites,
        reports: AppState.reports,
        points: AppState.points,
        lastUpdated: new Date().toISOString()
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Erreur sauvegarde localStorage:', e);
    }
}
```

### Chargement avec Fallback

```javascript
function loadFromLocalStorage() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            AppState.favorites = parsed.favorites || [];
            AppState.reports = parsed.reports || 0;
            AppState.points = parsed.points || 0;
        }
    } catch (e) {
        console.error('Erreur chargement localStorage:', e);
        // Fallback aux valeurs par defaut
        AppState.favorites = [];
        AppState.reports = 0;
        AppState.points = 0;
    }
}
```

## Structure des Donnees

### User Data (STORAGE_KEY)

```javascript
{
    favorites: ['dist-001', 'dist-002'],  // IDs des favoris
    reports: 5,                            // Nombre de signalements
    points: 150,                           // Points gamification
    lastUpdated: '2025-01-15T10:30:00Z'
}
```

### Profile (PROFILE_KEY)

```javascript
{
    preferences: {
        types: { pizza: 3, bakery: 2 },   // Compteur par type
        maxDistance: null,
        priceRange: null
    },
    stats: {
        totalViews: 25,
        totalFavorites: 5,
        conversationsStarted: 3
    },
    history: {
        lastTypes: ['pizza', 'bakery'],
        visitedIds: ['dist-001', 'dist-002']
    }
}
```

### Conversations (CONVERSATIONS_KEY)

```javascript
{
    active: 'dist-001',                    // Conversation active
    history: {
        'dist-001': [
            { type: 'bot', text: 'Salut !', time: 1705312200000 },
            { type: 'user', text: 'Bonjour', time: 1705312260000 }
        ]
    },
    list: ['dist-001', 'dist-003']         // Ordre recent
}
```

## Reset des Donnees

```javascript
function clearUserData() {
    if (confirm('Supprimer toutes tes donnees ?')) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(PROFILE_KEY);
        localStorage.removeItem(CONVERSATIONS_KEY);

        // Reset state
        AppState.favorites = [];
        AppState.points = 0;
        AppState.reports = 0;

        showToast('Donnees supprimees', 'success');
        location.reload();
    }
}
```

## Bonnes Pratiques

1. **Toujours try/catch** - localStorage peut echouer (quota, private mode)
2. **Fallback values** - Definir des valeurs par defaut en cas d'erreur
3. **Sauvegarder apres chaque modification** - Appeler save() apres les changements
4. **Valider les donnees chargees** - Verifier la structure avant d'utiliser
