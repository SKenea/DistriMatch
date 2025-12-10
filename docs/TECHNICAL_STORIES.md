# Technical Stories - SnackMatch V3.0

## 1. Sécurité

### TS-SEC-001: Protection contre les attaques XSS
**Objectif:** Protéger les utilisateurs contre les injections de code malveillant

**Critères d'acceptation:**
- [ ] Une fonction `escapeHTML()` est implémentée
- [ ] Tous les noms de distributeurs sont échappés
- [ ] Toutes les adresses sont échappées
- [ ] Tous les noms de produits sont échappés
- [ ] Les caractères `<`, `>`, `&`, `"`, `'` sont convertis en entités HTML

---

### TS-SEC-002: Validation des coordonnées GPS
**Objectif:** Éviter les injections d'URL malveillantes

**Critères d'acceptation:**
- [ ] Les coordonnées sont parsées en float avant utilisation
- [ ] Une vérification `!isNaN()` est effectuée
- [ ] L'URL Google Maps n'est générée que si les coordonnées sont valides

---

## 2. Performance

### TS-PERF-001: Pas de fuite mémoire sur les event listeners
**Objectif:** Maintenir les performances après consultation de 100+ distributeurs

**Critères d'acceptation:**
- [ ] Les event listeners de swipe sont supprimés avant d'en créer de nouveaux
- [ ] Une référence `currentSwipeHandlers` stocke les handlers pour cleanup
- [ ] Les listeners sur `document` sont correctement nettoyés

---

### TS-PERF-002: Event listeners passifs pour le touch
**Objectif:** Assurer une expérience fluide sur mobile

**Critères d'acceptation:**
- [ ] Les event listeners `touchstart` et `touchmove` utilisent `{ passive: true }`
- [ ] Aucun warning "Added non-passive event listener" dans la console

---

## 3. Persistance des Données

### TS-DATA-001: Sauvegarde automatique
**Objectif:** Ne pas perdre les données utilisateur

**Critères d'acceptation:**
- [ ] Chaque modification de sélection ou favoris déclenche `saveToLocalStorage()`
- [ ] Les données sont stockées sous la clé `snackmatch_user`
- [ ] Le format JSON est valide et complet

---

### TS-DATA-002: Chargement au démarrage
**Objectif:** Restaurer les données au lancement de l'application

**Critères d'acceptation:**
- [ ] `loadFromLocalStorage()` est appelé au `DOMContentLoaded`
- [ ] La sélection et les favoris sont restaurés
- [ ] Les badges affichent les bons compteurs
- [ ] En cas d'erreur de parsing, l'application ne crash pas

---

## Légende

- **TS** = Technical Story
- **SEC** = Sécurité
- **PERF** = Performance
- **DATA** = Données

---

*Document généré le 06/12/2025 - SnackMatch V3.0*
