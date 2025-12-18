---
name: vanilla-js-ui
description: Creates UI components in vanilla JavaScript without frameworks. Use when building modals, toasts, filters, navigation, or interactive elements in SnackMatch.
---

# Vanilla JS UI Components

## Patterns du Projet

### Toast Notifications

```javascript
function showToast(message, type = 'default') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Types: 'default', 'success', 'warning', 'error'
```

### Modals

```javascript
// Ouvrir
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

// Fermer
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Fermer avec Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAllModals();
    }
});
```

### Filter Chips (Multi-selection)

```javascript
function setFilter(type) {
    if (type === 'all') {
        AppState.activeFilters = [];
    } else {
        const index = AppState.activeFilters.indexOf(type);
        if (index === -1) {
            AppState.activeFilters.push(type);
        } else {
            AppState.activeFilters.splice(index, 1);
        }
    }

    // Mettre a jour UI
    document.querySelectorAll('.filter-chip').forEach(chip => {
        const isAll = chip.dataset.type === 'all';
        const isActive = isAll
            ? AppState.activeFilters.length === 0
            : AppState.activeFilters.includes(chip.dataset.type);
        chip.classList.toggle('active', isActive);
    });
}
```

### Event Delegation

```javascript
// CORRECT - Un seul listener sur le conteneur
document.getElementById('list').addEventListener('click', (e) => {
    const btn = e.target.closest('.item-btn');
    if (btn) {
        handleItemClick(btn.dataset.id);
    }
});

// EVITER - Multiple listeners
items.forEach(item => item.addEventListener('click', handler));
```

### DOM Batch Updates

```javascript
// CORRECT - Une seule mise a jour
const html = items.map(item => `
    <div class="item">${escapeHTML(item.name)}</div>
`).join('');
container.innerHTML = html;

// EVITER - Multiple updates
items.forEach(item => {
    container.innerHTML += `<div>${item.name}</div>`;
});
```

## Securite XSS

Toujours echapper le contenu utilisateur :

```javascript
function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Usage
const html = `<p>${escapeHTML(userInput)}</p>`;
```

## Accessibilite

Ajouter `aria-label` aux boutons interactifs :

```javascript
const button = `
    <button
        onclick="action('${id}')"
        aria-label="Action pour ${escapeHTML(name)}">
        Cliquer
    </button>
`;
```
