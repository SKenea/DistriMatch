# 📖 Guide d'Utilisation - Multi-Agent System

## 🚀 Quick Start

### Scénario Simple (1 agent)
```
User: "Change la couleur du bouton FAB en bleu"

→ Appeler directement UX Agent (pas besoin de Coordinator)
```

### Scénario Moyen (2-3 agents)
```
User: "Ajoute un système de favoris"

Étape 1: Demander le plan au Coordinator
User: "@coordinator Planifie l'ajout d'un système de favoris"

Étape 2: Exécuter les agents selon le plan
[Coordinator retourne un plan avec 4 tâches]

Étape 3: Appeler les agents en parallèle (Batch 1)
User: (en un seul message)
- "@data_agent Implémenter Task 1.1"
- "@ux_agent Implémenter Task 1.2"

Étape 4: Appeler les agents suivants (Batch 2)
User: "@integration_agent Implémenter Task 2.1"

Étape 5: Validation
User: "@test_agent Valider le système de favoris"
```

### Scénario Complexe (5+ agents)
```
User: "Implémente des recommandations personnalisées avec ML"

→ Coordinator orchestre automatiquement tous les agents
→ Plan détaillé avec 8+ tâches
→ Exécution en 3-4 batches
```

---

## 📋 Comment Utiliser les Agents

### Méthode 1 : Appel Direct (Simple Task)

Pour les tâches simples qui nécessitent 1 seul agent :

```
User: "Ajoute une animation au bouton like"
→ Directement: Je vais utiliser UX Agent pour cette modification simple
```

**Pas besoin de** :
- Coordinator (trop simple)
- Plan formel
- Multiple agents

### Méthode 2 : Avec Coordinator (Complex Task)

Pour les features complètes qui touchent plusieurs domaines :

**Étape 1 : Demander un plan**
```
User: "Je veux ajouter un système de filtres avancés"

Claude (via Coordinator prompt):
[Lit le fichier .claude/agents/coordinator.md]
[Analyse la demande]
[Génère un plan détaillé avec batches]
```

**Étape 2 : Exécuter Batch 1 (Parallèle)**
```
Claude utilise Task tool en parallèle:
- Task(subagent_type='general-purpose', prompt='[UX Agent prompt] + Task 1.1')
- Task(subagent_type='general-purpose', prompt='[Data Agent prompt] + Task 1.2')
- Task(subagent_type='general-purpose', prompt='[Backend Agent prompt] + Task 1.3')

[Les 3 agents travaillent en même temps]
```

**Étape 3 : Exécuter Batch 2 (Séquentiel)**
```
Claude utilise Task tool:
- Task(subagent_type='general-purpose', prompt='[Integration Agent prompt] + Task 2.1 + Résultats Batch 1')
```

**Étape 4 : Validation**
```
Claude utilise Task tool:
- Task(subagent_type='general-purpose', prompt='[Test Agent prompt] + Feature complète')
```

---

## 🔧 Comment Claude Code Exécute les Agents

### Architecture Technique

```
┌─────────────────────────────────────────────────┐
│         Claude Code (Main Conversation)         │
│  - Reçoit demande utilisateur                   │
│  - Décide si utiliser Coordinator ou agent direct│
└────────────────┬────────────────────────────────┘
                 │
                 ├─ Si simple → Appel direct
                 │              └─> UX/Data/Backend Agent
                 │
                 └─ Si complexe → Coordinator Agent
                                  └─> Génère Plan
                                      └─> Dispatch via Task tools
                                          ├─> Task 1 (UX Agent)
                                          ├─> Task 2 (Data Agent)
                                          ├─> Task 3 (Backend Agent)
                                          ├─> Task 4 (Integration Agent)
                                          └─> Task 5 (Test Agent)
```

### Utilisation du Task Tool

Chaque agent est invoqué via le **Task tool** avec :

```javascript
Task({
    subagent_type: 'general-purpose',
    description: 'UX Agent - Design filter panel',
    prompt: `
        ${UX_AGENT_PROMPT} // Contenu de ux_agent.md

        === SPECIFIC TASK ===
        Design a filter panel with 3 controls:
        - Distance slider (0-50km)
        - Price select (€, €€, €€€)
        - Type multiselect

        Context: SnackMatch uses Material Design bottom sheets
        Files: index.html, styles.css
    `
})
```

### Parallélisation Automatique

Claude Code peut envoyer **plusieurs Task tools dans un seul message** :

```javascript
// Un seul message avec 3 Task calls
Response: {
    text: "J'exécute le Batch 1 en parallèle...",
    tool_calls: [
        Task({ ... UX Agent ... }),
        Task({ ... Data Agent ... }),
        Task({ ... Backend Agent ... })
    ]
}

// Claude Code exécute les 3 en parallèle automatiquement
```

---

## 📝 Exemples Pratiques

### Exemple 1 : Feature "Favoris" (Complet)

**User Input:**
```
"Ajoute un système pour que les utilisateurs puissent mettre des distributeurs en favoris"
```

**Claude Code Process:**

1️⃣ **Détection de complexité**
```javascript
// Claude analyse:
complexity = "medium" // Touche UI, Data, Integration
agents_needed = ["ux", "data", "backend", "integration", "test"]
use_coordinator = true
```

2️⃣ **Appel Coordinator**
```javascript
// Claude lit .claude/agents/coordinator.md
// Génère le plan:

Plan {
    Batch 1: [
        Task 1.1: UX Agent - Design favorite button
        Task 1.2: Data Agent - Schema + CRUD
        Task 1.3: Backend Agent - Toggle logic
    ],
    Batch 2: [
        Task 2.1: Integration Agent - Wire UI ↔ Data
    ],
    Batch 3: [
        Task 3.1: Test Agent - Validate feature
    ]
}
```

3️⃣ **Exécution Batch 1 (Parallèle)**
```javascript
// Claude envoie 3 Task tools en parallèle:

await Promise.all([
    Task({
        subagent_type: 'general-purpose',
        prompt: UX_AGENT_PROMPT + `
            Task: Design favorite button in distributor card
            - Icon: ❤️ (outline when inactive, filled when active)
            - Position: Top-right corner
            - Animation: Scale on click
            Files: index.html, styles.css
        `
    }),

    Task({
        subagent_type: 'general-purpose',
        prompt: DATA_AGENT_PROMPT + `
            Task: Create favorites data structure
            - Add favorites: number[] to User schema
            - Implement: addFavorite(id), removeFavorite(id), getFavorites()
            - Persist in localStorage
            Files: app.js
        `
    }),

    Task({
        subagent_type: 'general-purpose',
        prompt: BACKEND_AGENT_PROMPT + `
            Task: Implement toggle favorite logic
            - toggleFavorite(distributorId) function
            - Check if already favorited
            - Update user state
            - Return success/error
            Files: app.js
        `
    })
]);

// Les 3 agents travaillent simultanément
// Temps: ~10min au lieu de 30min séquentiel
```

4️⃣ **Exécution Batch 2 (Séquentiel)**
```javascript
// Attend que Batch 1 soit terminé
// Puis exécute Integration Agent

await Task({
    subagent_type: 'general-purpose',
    prompt: INTEGRATION_AGENT_PROMPT + `
        Task: Connect favorite UI to data functions

        Context from Batch 1:
        - UX Agent created: .btn-favorite button with id="btn-favorite"
        - Data Agent created: toggleFavorite(id) function
        - Backend Agent created: Toggle logic

        Your task:
        - Add click event listener to .btn-favorite
        - Call toggleFavorite() on click
        - Update UI (icon state)
        - Show toast notification

        Files: app.js
    `
});
```

5️⃣ **Exécution Batch 3 (Validation)**
```javascript
await Task({
    subagent_type: 'general-purpose',
    prompt: TEST_AGENT_PROMPT + `
        Task: Validate favorites system

        Test:
        - Functional: Add/remove favorites works
        - Edge cases: Empty state, 100+ favorites
        - UX: Icon state clear, animation smooth
        - Persistence: Survives page reload

        Create test report with pass/fail status
    `
});
```

6️⃣ **Rapport Final**
```markdown
## ✅ Feature "Favoris" - Implémentée

### Fichiers modifiés
- index.html: +15 lignes (bouton favoris)
- styles.css: +42 lignes (styling + animation)
- app.js: +68 lignes (data + logic + integration)

### Temps d'exécution
- Batch 1 (parallèle): 10min
- Batch 2: 8min
- Batch 3: 5min
- **Total: 23min** (vs 45min séquentiel)

### Tests
- ✅ 12/12 tests passed
- ⚠️ 1 recommendation: Add bulk remove

### Status
🎉 Ready for production
```

---

### Exemple 2 : Fix Simple (Direct Agent Call)

**User Input:**
```
"Le bouton FAB est trop petit sur mobile"
```

**Claude Code Process:**

```javascript
// Claude analyse:
complexity = "simple" // UI only, 1 file, <10 lignes
agent_needed = "ux"
use_coordinator = false // Pas nécessaire

// Appel direct (sans Task tool, juste lecture du prompt)
// Claude lit .claude/agents/ux_agent.md
// Applique directement:

Edit({
    file_path: 'styles.css',
    old_string: `
        .fab-add {
            width: 56px;
            height: 56px;
        }
    `,
    new_string: `
        .fab-add {
            width: 64px;
            height: 64px;
        }
    `
});

// Done en 1min
```

---

## 🎯 Decision Flow : Quel Agent Utiliser?

```
Demande utilisateur
  ↓
Est-ce < 20 lignes && 1 fichier?
  ├─ OUI → Appel direct (pas d'agent formel)
  └─ NON → Continuer
       ↓
Est-ce UI seulement?
  ├─ OUI → UX Agent direct
  └─ NON → Continuer
       ↓
Est-ce Data seulement?
  ├─ OUI → Data Agent direct
  └─ NON → Continuer
       ↓
Est-ce Logique seulement?
  ├─ OUI → Backend Agent direct
  └─ NON → Feature complète → Coordinator
```

---

## ⚙️ Configuration des Agents

### Prompts Locaux (.claude/agents/)

Chaque fichier `.md` contient le **prompt complet** de l'agent :

```
.claude/agents/
├── coordinator.md       (Chef d'orchestre)
├── ux_agent.md         (UI/UX expert)
├── data_agent.md       (Data structures)
├── backend_agent.md    (Business logic)
├── integration_agent.md (Event binding)
├── test_agent.md       (QA testing)
└── README.md           (Documentation)
```

Claude Code **lit ces fichiers** et les utilise comme contexte pour les Task tools.

### Personnalisation

Tu peux **modifier les prompts** pour adapter le comportement :

```markdown
# Dans ux_agent.md, tu peux ajouter:

## SnackMatch Custom Rules
- Toujours utiliser emoji dans les boutons
- Gradients obligatoires pour les cards
- Animations : max 200ms
```

Claude lira automatiquement ces règles lors de l'appel à UX Agent.

---

## 📊 Monitoring & Métriques

### Logs Automatiques

Chaque agent documente ses actions :

```markdown
## UX Agent - Report

**Task**: Design favorite button
**Time**: 8min
**Files modified**:
- index.html (+12 lines)
- styles.css (+35 lines)
**Decisions**:
- Used heart emoji (❤️) for universal recognition
- Positioned top-right (convention)
- Animation: scale(1.1) on hover
```

### Métriques à Tracker

```javascript
{
    feature: "Favorites System",
    agents_used: ["ux", "data", "backend", "integration", "test"],
    execution_time: "23min",
    parallelization_rate: "60%", // Batch 1 en parallèle
    files_modified: 3,
    lines_added: 125,
    tests_passed: "12/12",
    bugs_found: 0
}
```

---

## 🚦 Best Practices

### ✅ DO

1. **Start simple** : Pas besoin d'agents pour les petites tâches
2. **Plan first** : Utilise Coordinator pour features complexes
3. **Parallelize** : Execute les tâches indépendantes ensemble
4. **Test always** : Toujours finir avec Test Agent
5. **Document** : Les agents auto-documentent leurs décisions

### ❌ DON'T

1. **Over-engineer** : Ne pas utiliser 5 agents pour changer 1 ligne
2. **Skip planning** : Features complexes sans plan = chaos
3. **Ignore test feedback** : Si Test Agent trouve des bugs, corriger avant continuer
4. **Modify prompts randomly** : Les prompts sont calibrés, changer avec précaution

---

## 🎓 Apprentissage Progressif

### Semaine 1 : Appels Directs
```
- Utilise les agents individuellement
- Familiarise-toi avec chaque expertise
- Petites tâches isolées
```

### Semaine 2 : Coordinator
```
- Commence à utiliser Coordinator pour features moyennes
- Comprends le système de batches
- Exécute en parallèle manuellement
```

### Semaine 3 : Orchestration Avancée
```
- Features complètes multi-agents
- Optimise la parallélisation
- Ajuste les prompts selon besoins
```

---

## 📞 Support & Debugging

### Agent ne fonctionne pas comme attendu?

1. **Vérifier le prompt** : Lire `.claude/agents/{agent}.md`
2. **Context manquant?** : Ajouter plus de détails dans la task
3. **Dépendances** : Assurer que les tâches prereq sont complétées
4. **Feedback loop** : Demander à Test Agent de valider

### Exemple Debug
```
User: "L'UX Agent n'a pas utilisé le bon gradient"

Fix:
1. Lire ux_agent.md
2. Vérifier section "SnackMatch Design System > Gradients"
3. Ajouter plus d'exemples si nécessaire
4. Re-run l'agent avec contexte enrichi
```

---

**Créé pour SnackMatch v3.0**
**Version**: 1.0
**Date**: 2025-01-24