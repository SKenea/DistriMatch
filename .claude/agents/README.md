# 🤖 SnackMatch Multi-Agent System

## Architecture

Ce dossier contient les **prompts d'agents spécialisés** utilisés par Claude Code pour développer SnackMatch de manière orchestrée.

## Agents Disponibles

### 1. Coordinator Agent (`coordinator.md`)
- **Rôle** : Chef d'orchestre, décompose les tâches complexes
- **Usage** : Première étape de toute feature complexe
- **Sortie** : Plan d'exécution avec tâches assignées

### 2. UX Agent (`ux_agent.md`)
- **Rôle** : Design UI/UX, HTML, CSS, animations
- **Expertise** : Material Design, accessibilité, cohérence visuelle
- **Fichiers** : `index.html`, `styles.css`

### 3. Data Agent (`data_agent.md`)
- **Rôle** : Structures de données, localStorage, état global
- **Expertise** : Schémas de données, CRUD, migrations
- **Fichiers** : `app.js` (section données)

### 4. Backend Agent (`backend_agent.md`)
- **Rôle** : Logique métier, algorithmes, calculs
- **Expertise** : Filtrage, tri, scoring, validations
- **Fichiers** : `app.js` (fonctions métier)

### 5. Integration Agent (`integration_agent.md`)
- **Rôle** : Connecter UI ↔ Data, event listeners
- **Expertise** : Event binding, state sync, side effects
- **Fichiers** : `app.js` (event handlers)

### 6. Performance Agent (`performance_agent.md`)
- **Rôle** : Optimisations, caching, debouncing
- **Expertise** : Détection bottlenecks, optimisations CPU/mémoire
- **Fichiers** : Tous (optimisations transverses)

### 7. Test Agent (`test_agent.md`)
- **Rôle** : Tests manuels, validation UX, edge cases
- **Expertise** : Test plans, détection bugs, rapports
- **Fichiers** : N/A (analyse seulement)

## Workflow d'Utilisation

### Méthode 1 : Orchestration Manuelle

```bash
# 1. Demander au Coordinator de planifier
User: "Je veux ajouter un système de favoris"

# 2. Coordinator crée le plan
Coordinator → Plan avec 5 tâches (UX, Data, Backend, Integration, Test)

# 3. Exécuter les agents en parallèle (via Task tool)
# Dans un seul message, appeler plusieurs Task tools:
- Task tool: UX Agent (design button)
- Task tool: Data Agent (schema favoris)
- Task tool: Backend Agent (logique save/remove)

# 4. Integration Agent connecte tout
- Task tool: Integration Agent (wire UI ↔ Data)

# 5. Test Agent valide
- Task tool: Test Agent (validation complète)
```

### Méthode 2 : Orchestration Automatique (via Coordinator)

Le Coordinator Agent peut lui-même dispatcher aux autres agents en utilisant plusieurs Task tools dans sa réponse.

## Exemples Concrets

### Exemple 1 : Feature Simple (1 agent)

```
User: "Change la couleur du bouton FAB en bleu"
→ UX Agent directement (pas besoin de Coordinator)
```

### Exemple 2 : Feature Moyenne (2-3 agents)

```
User: "Ajoute un compteur de vues par distributeur"
→ Coordinator → Plan:
  1. Data Agent: Ajoute champ viewCount
  2. Backend Agent: Fonction incrementViews()
  3. Integration Agent: Appel au clic
```

### Exemple 3 : Feature Complexe (5+ agents)

```
User: "Implémente un système de recommandations personnalisées"
→ Coordinator → Plan complet avec tous les agents
```

## Conventions

### Fichiers d'agents
- Chaque agent a un fichier `.md` avec son prompt spécialisé
- Format : Context + Expertise + Constraints + Output Format

### Communication inter-agents
- Via le Coordinator (message bus virtuel)
- Chaque agent reçoit le contexte complet de la conversation
- Les agents documentent leurs changements pour les autres

### Nommage
- `coordinator.md` : Agent coordinateur
- `{domain}_agent.md` : Agents spécialisés
- PascalCase pour les noms dans le code

## Monitoring

### Métriques à tracker
- **Time to feature** : Temps pour implémenter une feature
- **Bugs introduced** : Nombre de bugs par feature
- **Test coverage** : % de code testé
- **Parallelization rate** : % de tâches en parallèle

### Logs
Les agents documentent leurs actions dans leurs réponses pour audit.

## Évolution

### Phase 1 (Actuel) : Manual Orchestration
- L'utilisateur appelle les agents manuellement
- Coordination via Coordinator Agent explicite

### Phase 2 (Future) : Semi-Automatic
- Coordinator dispatche automatiquement via Task tools
- L'utilisateur approuve le plan avant exécution

### Phase 3 (Future) : Fully Automatic
- Le Coordinator détecte automatiquement quand décomposer
- Exécution parallèle automatique
- Self-healing si tests échouent

---

**Créé pour SnackMatch v3.0 - Waze Edition**
