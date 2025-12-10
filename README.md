# 🍿 SnackMatch v3.0 - "Waze des Distributeurs"

**Application web collaborative pour trouver et signaler des distributeurs automatiques en temps réel.**

---

## 🎯 Vue d'ensemble

**SnackMatch** est une maquette opérationnelle complète inspirée de Waze, mais pour les distributeurs automatiques.

### Fonctionnalités clés
- 🔍 Interface swipe type Tinder pour découvrir les distributeurs
- ⚠️ Signalements temps réel (6 types) style Waze
- 🗺️ Carte interactive avec statuts visuels
- 🌍 Feed communautaire des activités
- 🏆 Gamification avec points et badges
- 👤 Profil utilisateur et leaderboard
- 💾 Persistence LocalStorage

---

## 🚀 Installation

```bash
# Ouvrir directement dans le navigateur
start index.html  # Windows
open index.html   # macOS
```

Aucune dépendance à installer. L'application est 100% statique.

---

## ✨ Fonctionnalités Principales

### 🧭 Navigation
- **Bottom navigation** à 4 onglets : Explorer | Carte | Activité | Profil
- **Recherche rapide** de produits
- **Interface swipe** intuitive

### ⚠️ Signalements (Style Waze)
- ❌ Rupture de stock (+10 pts)
- ⚠️ Machine en panne (+15 pts)
- 💰 Prix modifié (+10 pts)
- ✨ Nouveau produit (+15 pts)
- 🔒 Distributeur fermé (+10 pts)
- ✅ Tout est OK (+5 pts)

### 🗺️ Carte Interactive
- Markers colorés par statut (✅ vert, ⚠️ orange, ❓ gris)
- Ajout de distributeurs en 1 clic
- Popups détaillées avec distance et note

### 🔔 Notifications
- Badge avec compteur non-lues
- Panel slide-in
- Notifications aléatoires simulées

### 🌍 Feed Communautaire
- Activité temps réel
- 4 filtres : Tout | Vérifications | Signalements | Nouveaux spots
- Actions cliquables

### 👤 Profil & Gamification
- Système de points avec badges
  - 🥉 Bronze (0-199 pts)
  - 🥈 Argent (200-499 pts)
  - 🥇 Or (500+ pts)
- Statistiques détaillées
- Leaderboard top 5

---

## 🛠️ Technologies

- **HTML5 + CSS3 + Vanilla JavaScript (ES6+)**
- **Leaflet.js 1.9.4** pour les cartes
- **OpenStreetMap** pour les tiles
- **LocalStorage API** pour la persistence

---

## 📂 Architecture

```
SnackFoodGeoEvaluator/
├── index.html           # 270 lignes
├── styles.css           # 1488 lignes
├── app.js               # 1168 lignes ✨ Optimisé (-27%)
└── README.md            # Documentation complète
```

---

## 📱 Utilisation

### Démarrage
1. **Géolocalisation** : Activer | Passer | ESC
2. **Explorer** : Swiper les cartes (← passer, → favoris, ℹ️ détails)
3. **Signaler** : Clic FAB rouge → Type → Produit → Envoyer

### Raccourcis
- `ESC` : Fermer modals/overlays
- `🔍` : Recherche rapide

---

## 🗺️ Roadmap

### Phase 1 : MVP Android (1-2 mois)
- [ ] React Native
- [ ] SQLite local
- [ ] Notifications push FCM
- [ ] GPS natif

### Phase 2 : Backend (2-3 mois)
- [ ] API Node.js + Express
- [ ] PostgreSQL + PostGIS
- [ ] WebSockets temps réel
- [ ] Auth JWT

### Phase 3 : Features Avancées
- [ ] Upload photos
- [ ] Chat distributeurs
- [ ] ML prédiction disponibilité
- [ ] PWA offline
- [ ] Dark mode
- [ ] i18n

---

## 📊 Métriques

- **Total** : ~2926 lignes de code
- **Réduction v3.0** : -27% JavaScript après refactoring
- **Perf** : < 1s First Paint, < 2s Interactive
- **Bundle** : ~50KB (non minifié) + Leaflet 140KB

---

## 📝 Changelog

### v3.0 (2025-01) - WAZE EDITION ✨
- Signalements temps réel (6 types)
- Notifications push simulées
- Feed communautaire + filtres
- Profil + gamification complète
- Bottom navigation
- Carte avec statuts
- LocalStorage complet
- Refactoring code (-27%)
- Fix modal géolocalisation
- Fix CSS swipe-view

### v2.1
- Fix bouton fermeture carte
- Fix formulaire ajout

### v2.0
- Simplification (-46% code)
- Card unique 80% écran
- Suppression agents IA

---

## 👨‍💻 Auteur

**SnackMatch** - Side-project personnel
- GitHub : [@username](https://github.com/username)

---

## 📄 License

MIT License

---

**Made with ❤️ and 🍿 in Paris**

*Version 3.0 - Janvier 2025*
