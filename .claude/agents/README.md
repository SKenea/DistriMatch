# Agents SnackMatch V4.5

## Agents Disponibles

| Agent | Role | Fichiers |
|-------|------|----------|
| `coordinator` | Chef d'orchestre, decompose les taches | - |
| `ux_agent` | UI/UX, composants visuels | index.html, styles.css |
| `data_agent` | AppState, localStorage | app.js |
| `map_agent` | Leaflet, marqueurs, popups | app.js |
| `chatbot_agent` | Conversations, bots distributeurs | app.js |
| `test_agent` | Validation, edge cases | - |

## Workflow

```
Demande utilisateur
      |
      v
[Coordinator] --> Analyse complexite
      |
      +-- Simple --> Agent direct
      |
      +-- Complexe --> Plan multi-agents
              |
              v
         [Batch 1] Parallele
              |
              v
         [Batch 2] Integration
              |
              v
         [Batch 3] Validation
```

## Usage

### Feature Simple
```
"Change la couleur du bouton" --> ux_agent directement
```

### Feature Moyenne
```
"Ajoute un nouveau type de filtre"
--> coordinator --> plan:
    1. ux_agent (chip HTML/CSS)
    2. data_agent (activeFilters)
    3. map_agent (updateMapMarkers)
```

### Feature Complexe
```
"Ajoute un systeme de notifications push"
--> coordinator --> plan complet multi-agents
```

## Conventions

- Agents concis (~100 lignes)
- Output format standardise
- Pas de code par le coordinator (planification seulement)
