# 🏗️ Architecture Multi-Agent System

## Vue d'Ensemble

```
                    ┌──────────────────────────────────┐
                    │         UTILISATEUR              │
                    │   "Ajoute des filtres avancés"   │
                    └────────────┬─────────────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────────────┐
                    │       CLAUDE CODE (Main)         │
                    │   - Analyse complexité           │
                    │   - Décide stratégie             │
                    └────────────┬─────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                Simple                    Complexe
                    │                         │
                    ▼                         ▼
        ┌───────────────────────┐   ┌─────────────────────┐
        │   APPEL DIRECT        │   │  COORDINATOR AGENT  │
        │   (1 agent)           │   │  - Lit coordinator.md│
        │                       │   │  - Décompose task    │
        │   • UX Agent          │   │  - Crée plan batches │
        │   • Data Agent        │   │  - Dispatche agents  │
        │   • Backend Agent     │   └──────────┬──────────┘
        └───────────────────────┘              │
                                                │
                    ┌───────────────────────────┴───────────────────────────┐
                    │                                                       │
                    ▼                                                       ▼
        ┌───────────────────────────────────────┐         ┌──────────────────────────────┐
        │        BATCH 1 (Parallèle)            │         │   BATCH N (Séquentiel)       │
        ├───────────────────────────────────────┤         ├──────────────────────────────┤
        │  ┌─────────────┐  ┌────────────────┐ │         │  ┌────────────────────────┐  │
        │  │  UX Agent   │  │  Data Agent    │ │         │  │  Integration Agent     │  │
        │  │  (Task 1.1) │  │  (Task 1.2)    │ │───┬────→│  │  (Task 2.1)            │  │
        │  └─────────────┘  └────────────────┘ │   │     │  └────────────────────────┘  │
        │  ┌─────────────────────────────────┐ │   │     └──────────────┬───────────────┘
        │  │     Backend Agent (Task 1.3)    │ │   │                    │
        │  └─────────────────────────────────┘ │   │                    ▼
        └───────────────────────────────────────┘   │     ┌──────────────────────────────┐
                                                    │     │    BATCH N+1                 │
                                                    │     ├──────────────────────────────┤
                                                    │     │  ┌────────────────────────┐  │
                                                    ├────→│  │  Performance Agent     │  │
                                                    │     │  │  (Task 3.1)            │  │
                                                    │     │  └────────────────────────┘  │
                                                    │     └──────────────┬───────────────┘
                                                    │                    │
                                                    │                    ▼
                                                    │     ┌──────────────────────────────┐
                                                    │     │    BATCH FINAL               │
                                                    │     ├──────────────────────────────┤
                                                    └────→│  ┌────────────────────────┐  │
                                                          │  │  Test Agent            │  │
                                                          │  │  (Validation)          │  │
                                                          │  └────────────────────────┘  │
                                                          └──────────────┬───────────────┘
                                                                         │
                                                                         ▼
                                                          ┌──────────────────────────────┐
                                                          │   RAPPORT FINAL              │
                                                          │   - Files modified           │
                                                          │   - Tests passed             │
                                                          │   - Time elapsed             │
                                                          │   - Recommendations          │
                                                          └──────────────────────────────┘
```

---

## 🤖 Les Agents en Détail

### Coordinator Agent (Chef d'Orchestre)
```
┌─────────────────────────────────────────────────┐
│           COORDINATOR AGENT                     │
├─────────────────────────────────────────────────┤
│  INPUT:  Demande utilisateur complexe           │
│  READS:  .claude/agents/coordinator.md          │
│                                                 │
│  PROCESS:                                       │
│    1. Analyse complexité                        │
│    2. Identifie agents nécessaires              │
│    3. Crée DAG de dépendances                   │
│    4. Génère plan avec batches                  │
│                                                 │
│  OUTPUT: Plan d'exécution structuré             │
│    • Batch 1: Tasks parallèles                  │
│    • Batch 2: Tasks dépendantes                 │
│    • Batch N: Validation                        │
└─────────────────────────────────────────────────┘
```

### UX Agent (Expert UI/UX)
```
┌─────────────────────────────────────────────────┐
│              UX AGENT                           │
├─────────────────────────────────────────────────┤
│  EXPERTISE: HTML, CSS, Animations, A11y         │
│  FILES:     index.html, styles.css              │
│  READS:     .claude/agents/ux_agent.md          │
│                                                 │
│  RESPONSIBILITIES:                              │
│    • Design composants UI                       │
│    • Styling cohérent (Material Design)         │
│    • Animations (60fps)                         │
│    • Accessibility (ARIA, keyboard)             │
│    • Responsive (mobile-first)                  │
│                                                 │
│  OUTPUT:                                        │
│    • HTML structure                             │
│    • CSS styling                                │
│    • Design decisions doc                       │
└─────────────────────────────────────────────────┘
```

### Data Agent (Expert Données)
```
┌─────────────────────────────────────────────────┐
│              DATA AGENT                         │
├─────────────────────────────────────────────────┤
│  EXPERTISE: Schemas, localStorage, State        │
│  FILES:     app.js (data section)               │
│  READS:     .claude/agents/data_agent.md        │
│                                                 │
│  RESPONSIBILITIES:                              │
│    • Design data schemas                        │
│    • CRUD functions                             │
│    • localStorage persistence                   │
│    • Data validation                            │
│    • Migrations                                 │
│                                                 │
│  OUTPUT:                                        │
│    • Schema definitions                         │
│    • CRUD functions                             │
│    • Storage logic                              │
└─────────────────────────────────────────────────┘
```

### Backend Agent (Expert Logique)
```
┌─────────────────────────────────────────────────┐
│            BACKEND AGENT                        │
├─────────────────────────────────────────────────┤
│  EXPERTISE: Algorithms, Business Logic          │
│  FILES:     app.js (functions)                  │
│  READS:     .claude/agents/backend_agent.md     │
│                                                 │
│  RESPONSIBILITIES:                              │
│    • Business logic                             │
│    • Algorithms (sort, filter, score)          │
│    • Calculations (distance, etc.)              │
│    • Validations métier                         │
│                                                 │
│  OUTPUT:                                        │
│    • Business functions                         │
│    • Algorithm implementations                  │
│    • Complexity analysis                        │
└─────────────────────────────────────────────────┘
```

### Integration Agent (Expert Connecteur)
```
┌─────────────────────────────────────────────────┐
│          INTEGRATION AGENT                      │
├─────────────────────────────────────────────────┤
│  EXPERTISE: Event binding, State sync           │
│  FILES:     app.js (event handlers)             │
│  READS:     .claude/agents/integration_agent.md │
│                                                 │
│  RESPONSIBILITIES:                              │
│    • Event listeners                            │
│    • UI ↔ Data binding                          │
│    • State synchronization                      │
│    • Side effects                               │
│                                                 │
│  OUTPUT:                                        │
│    • Event handlers                             │
│    • State sync functions                       │
│    • Integration code                           │
└─────────────────────────────────────────────────┘
```

### Performance Agent (Expert Optimisation)
```
┌─────────────────────────────────────────────────┐
│          PERFORMANCE AGENT                      │
├─────────────────────────────────────────────────┤
│  EXPERTISE: Optimization, Profiling             │
│  FILES:     All (cross-cutting)                 │
│  READS:     .claude/agents/performance_agent.md │
│                                                 │
│  RESPONSIBILITIES:                              │
│    • Detect bottlenecks                         │
│    • Debouncing/throttling                      │
│    • Caching strategies                         │
│    • Memory optimization                        │
│    • Animation performance                      │
│                                                 │
│  OUTPUT:                                        │
│    • Optimized code                             │
│    • Performance metrics                        │
│    • Recommendations                            │
└─────────────────────────────────────────────────┘
```

### Test Agent (Expert QA)
```
┌─────────────────────────────────────────────────┐
│              TEST AGENT                         │
├─────────────────────────────────────────────────┤
│  EXPERTISE: Testing, Validation, QA             │
│  FILES:     None (analysis only)                │
│  READS:     .claude/agents/test_agent.md        │
│                                                 │
│  RESPONSIBILITIES:                              │
│    • Create test plans                          │
│    • Functional testing                         │
│    • Edge case testing                          │
│    • UX validation                              │
│    • Bug reports                                │
│                                                 │
│  OUTPUT:                                        │
│    • Test report (pass/fail)                    │
│    • Bug list                                   │
│    • Recommendations                            │
│    • Approval status                            │
└─────────────────────────────────────────────────┘
```

---

## 🔄 Flow de Communication

### Message Format
```javascript
{
    id: "msg_123",
    from: "coordinator",
    to: "ux_agent",
    type: "task",
    priority: "high",
    payload: {
        action: "design_filter_panel",
        context: {
            project: "SnackMatch",
            files: ["index.html", "styles.css"],
            design_system: { /* ... */ }
        },
        constraints: {
            style: "Material Design",
            responsive: true,
            animation: "< 300ms"
        },
        dependencies: [] // Task IDs
    },
    timestamp: 1706097600000
}
```

### Dependency Graph (DAG)
```
Task 1.1 (UX)  ────┐
                   │
Task 1.2 (Data) ───┼──→ Task 2.1 (Integration) ──→ Task 3.1 (Perf) ──→ Task 4.1 (Test)
                   │
Task 1.3 (Backend) ┘

• Tasks 1.1, 1.2, 1.3 : Parallèle (aucune dépendance)
• Task 2.1 : Dépend de [1.1, 1.2, 1.3]
• Task 3.1 : Dépend de [2.1]
• Task 4.1 : Dépend de [3.1]
```

---

## 📦 Structure des Fichiers

```
SnackMatch/
├── index.html                    # UI Structure
├── styles.css                    # Styling
├── app.js                        # Logic
│
└── .claude/                      # Claude Code config
    └── agents/                   # 🤖 Multi-Agent System
        │
        ├── README.md             # Documentation générale
        ├── QUICKSTART.md         # Démarrage rapide
        ├── USAGE_GUIDE.md        # Guide complet
        ├── DEMO.md               # Exemple concret
        ├── ARCHITECTURE.md       # Ce fichier
        │
        ├── coordinator.md        # Prompt: Coordinator Agent
        ├── ux_agent.md          # Prompt: UX Agent
        ├── data_agent.md        # Prompt: Data Agent
        ├── backend_agent.md     # Prompt: Backend Agent
        ├── integration_agent.md # Prompt: Integration Agent
        ├── performance_agent.md # Prompt: Performance Agent
        └── test_agent.md        # Prompt: Test Agent
```

---

## ⚙️ Fonctionnement Interne

### 1. Detection de Complexité
```javascript
function analyzeComplexity(userRequest) {
    const factors = {
        linesExpected: estimateLines(userRequest),
        filesImpacted: countFilesImpacted(userRequest),
        domainsInvolved: countDomains(userRequest), // UI, Data, Logic, etc.
        integrationNeeded: needsIntegration(userRequest)
    };

    if (factors.linesExpected < 20 && factors.filesImpacted === 1) {
        return "simple"; // Direct agent call
    } else if (factors.domainsInvolved <= 2) {
        return "medium"; // 2-3 agents
    } else {
        return "complex"; // Coordinator + all agents
    }
}
```

### 2. Task Distribution
```javascript
function distributeTask(complexity, userRequest) {
    switch(complexity) {
        case "simple":
            return directAgentCall(identifyAgent(userRequest));

        case "medium":
            return {
                agents: identifyRequiredAgents(userRequest),
                batches: createSimplePlan(userRequest)
            };

        case "complex":
            return coordinator.createFullPlan(userRequest);
    }
}
```

### 3. Parallel Execution
```javascript
async function executeBatch(batch) {
    // Toutes les tasks du batch en parallèle
    const promises = batch.tasks.map(task =>
        executeAgent(task.agent, task.prompt)
    );

    const results = await Promise.all(promises);

    return aggregateResults(results);
}
```

### 4. Result Aggregation
```javascript
function aggregateResults(results) {
    return {
        files_modified: mergeFileChanges(results),
        decisions_made: collectDecisions(results),
        time_elapsed: calculateTotalTime(results),
        next_batch: identifyNextBatch(results)
    };
}
```

---

## 📊 Métriques & Monitoring

### Métriques par Agent
```javascript
{
    agent: "ux_agent",
    tasks_completed: 47,
    avg_time: "8min",
    files_modified: ["index.html", "styles.css"],
    success_rate: "98%",
    common_patterns: [
        "button design",
        "modal styling",
        "responsive layout"
    ]
}
```

### Métriques Globales
```javascript
{
    features_completed: 12,
    total_time_saved: "18 hours",
    parallelization_rate: "65%",
    bugs_prevented: 23,
    test_coverage: "94%",
    most_used_agents: ["ux_agent", "integration_agent"],
    avg_feature_time: "32min"
}
```

---

## 🔐 Sécurité & Best Practices

### Validation des Inputs
```javascript
function validateAgentInput(task) {
    // Prevent code injection
    if (containsDangerousCode(task.prompt)) {
        throw new Error("Dangerous code detected");
    }

    // Validate file paths
    if (!isWithinProjectRoot(task.files)) {
        throw new Error("File access denied");
    }

    // Check agent permissions
    if (!agentHasPermission(task.agent, task.action)) {
        throw new Error("Permission denied");
    }

    return true;
}
```

### Sandboxing
```javascript
// Chaque agent a accès uniquement à ses fichiers
const agentPermissions = {
    ux_agent: ["index.html", "styles.css"],
    data_agent: ["app.js"], // Section data seulement
    backend_agent: ["app.js"], // Section functions seulement
    integration_agent: ["app.js"], // Section events seulement
    performance_agent: ["*"], // Lecture seule partout
    test_agent: ["*"] // Lecture seule partout
};
```

---

## 🚀 Évolution Future

### Phase 1 (Actuel) : Manual Orchestration ✅
- Prompts d'agents dans `.claude/agents/`
- Coordination via Coordinator Agent
- Exécution parallèle manuelle

### Phase 2 (Next) : Semi-Automatic
- Auto-detection de features complexes
- Dispatch automatique en parallèle
- Self-healing (retry on failure)

### Phase 3 (Future) : Fully Autonomous
- Apprentissage des patterns
- Optimisation automatique des plans
- Predictive task distribution
- Auto-scaling (plus d'agents si nécessaire)

---

## 🎯 Philosophie de Design

### Principes Clés

1. **Spécialisation** : Chaque agent est expert dans son domaine
2. **Autonomie** : Les agents prennent des décisions techniques
3. **Collaboration** : Communication via Coordinator
4. **Parallélisation** : Maximiser les tâches simultanées
5. **Quality** : Test Agent valide systématiquement
6. **Documentation** : Auto-génération de docs

### Trade-offs

| Décision | Avantage | Inconvénient |
|----------|----------|--------------|
| **Prompts locaux** (.md files) | Facile à modifier | Pas de versioning automatique |
| **General-purpose subagent** | Simple à implémenter | Moins optimisé qu'agents natifs |
| **Manual dispatch** | Contrôle total | Nécessite compréhension |
| **LocalStorage** | Pas de backend nécessaire | Limité à 5-10MB |

---

**Architecture Version** : 1.0
**Last Updated** : 2025-01-24
**Maintainer** : SnackMatch Team
