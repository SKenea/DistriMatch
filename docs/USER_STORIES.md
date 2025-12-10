# User Stories - SnackMatch V3.0

## 1. Ma Sélection (swipe droite = "ça m'intéresse")

### US-SEL-001: Ajouter un distributeur à ma sélection via swipe droite
**En tant qu'** utilisateur de l'application
**Je veux** pouvoir swiper une carte vers la droite
**Afin d'** indiquer que ce distributeur m'intéresse et l'ajouter à ma sélection

**Critères d'acceptation:**
- [ ] Le swipe à droite (> 100px) ajoute le distributeur à "Ma Sélection"
- [ ] Un indicateur visuel ✓ apparaît pendant le geste
- [ ] Une notification temporaire "✓ [Nom] ajouté à votre sélection" s'affiche
- [ ] Le badge compteur de sélection s'incrémente
- [ ] La carte suivante s'affiche automatiquement
- [ ] Les données sont sauvegardées dans localStorage

---

### US-SEL-002: Ajouter un distributeur à ma sélection via bouton "Sélectionner"
**En tant qu'** utilisateur de l'application
**Je veux** pouvoir cliquer sur le bouton "Sélectionner" ✓ en bas de la carte
**Afin d'** ajouter ce distributeur à ma sélection et passer au suivant

**Critères d'acceptation:**
- [ ] Le clic sur le bouton "Sélectionner" ✓ ajoute le distributeur à "Ma Sélection"
- [ ] Le badge compteur s'incrémente
- [ ] Une notification temporaire de confirmation s'affiche
- [ ] La carte suivante s'affiche automatiquement
- [ ] Le distributeur n'est pas ajouté deux fois (prévention des doublons)

---

### US-SEL-003: Consulter ma sélection
**En tant qu'** utilisateur de l'application
**Je veux** pouvoir voir tous les distributeurs de ma sélection sur une page dédiée
**Afin de** les comparer et choisir mes favoris

**Critères d'acceptation:**
- [ ] Le clic sur l'icône ✓ de la barre de navigation ouvre la page "Ma Sélection"
- [ ] La liste affiche tous les distributeurs sélectionnés avec : nom, adresse, distance, note, statut
- [ ] Si aucune sélection, un état vide s'affiche avec message explicatif
- [ ] Le bouton "← Retour" ferme la page

---

### US-SEL-004: Retirer un distributeur de ma sélection
**En tant qu'** utilisateur de l'application
**Je veux** pouvoir retirer un distributeur de ma sélection
**Afin de** garder ma liste à jour

**Critères d'acceptation:**
- [ ] Un swipe gauche sur la carte permet de retirer le distributeur
- [ ] La carte disparaît de la liste avec une animation (300ms)
- [ ] Le badge compteur décrémente
- [ ] Une notification temporaire confirme le retrait
- [ ] Les données sont mises à jour dans localStorage

---

## 2. Mes Favoris (les meilleurs parmi ma sélection)

### US-FAV-001: Ajouter un distributeur aux favoris depuis ma sélection
**En tant qu'** utilisateur de l'application
**Je veux** pouvoir marquer un distributeur de ma sélection comme favori
**Afin de** distinguer mes meilleurs choix

**Critères d'acceptation:**
- [ ] Un bouton ❤️ est présent à côté du nom sur chaque carte de ma sélection
- [ ] Le clic sur ❤️ ajoute le distributeur aux favoris
- [ ] L'icône ❤️ devient pleine/colorée pour indiquer le statut favori
- [ ] Une notification temporaire confirme l'ajout
- [ ] Le badge compteur de favoris s'incrémente

---

### US-FAV-002: Consulter mes favoris
**En tant qu'** utilisateur de l'application
**Je veux** pouvoir voir uniquement mes distributeurs favoris
**Afin de** accéder rapidement à mes meilleurs choix

**Critères d'acceptation:**
- [ ] Le clic sur l'icône ❤️ de la barre de navigation ouvre la page "Mes Favoris"
- [ ] La liste affiche uniquement les distributeurs marqués comme favoris
- [ ] Si aucun favori, un état vide s'affiche avec 💔 "Aucun favori"
- [ ] Le bouton "← Retour" ferme la page

---

### US-FAV-003: Retirer un distributeur des favoris
**En tant qu'** utilisateur de l'application
**Je veux** pouvoir retirer un distributeur de mes favoris
**Afin de** mettre à jour mes préférences

**Critères d'acceptation:**
- [ ] Le clic sur ❤️ (déjà favori) retire le distributeur des favoris
- [ ] L'icône ❤️ redevient vide/grise
- [ ] Le distributeur reste dans "Ma Sélection"
- [ ] Une notification temporaire confirme le retrait
- [ ] Le badge compteur de favoris décrémente

---

### US-FAV-004: Accéder aux détails depuis ma sélection ou mes favoris
**En tant qu'** utilisateur de l'application
**Je veux** pouvoir cliquer sur un distributeur pour voir ses détails
**Afin d'** accéder aux informations complètes

**Critères d'acceptation:**
- [ ] Le clic sur une carte ouvre le modal de détails
- [ ] Le modal affiche : nom, adresse, note, distance, liste des produits, disponibilité
- [ ] Le bouton "Itinéraire" ouvre Google Maps

---

### US-FAV-005: Persistance des données
**En tant qu'** utilisateur de l'application
**Je veux** que ma sélection et mes favoris soient sauvegardés
**Afin de** les retrouver lors de ma prochaine visite

**Critères d'acceptation:**
- [ ] La sélection et les favoris sont sauvegardés dans localStorage
- [ ] Au chargement de l'application, les données sont restaurées
- [ ] Les badges affichent les bons compteurs au démarrage

---

## 3. Affichage des Cartes (Explorer)

### US-CARD-001: Afficher les informations du distributeur
**En tant qu'** utilisateur de l'application
**Je veux** voir les informations essentielles d'un distributeur sur sa carte
**Afin de** décider rapidement si je veux y aller

**Critères d'acceptation:**
- [ ] La carte affiche : type (emoji + gradient), nom, distance, note avec étoiles, nombre d'avis
- [ ] Le statut (Vérifié/Signalé) est visible avec code couleur
- [ ] La fraîcheur des données est indiquée
- [ ] La fourchette de prix est affichée

---

### US-CARD-002: Naviguer entre les distributeurs
**En tant qu'** utilisateur de l'application
**Je veux** pouvoir passer au distributeur suivant
**Afin de** parcourir tous les distributeurs disponibles

**Critères d'acceptation:**
- [ ] Le bouton "PASSER" ou swipe gauche passe à la carte suivante
- [ ] Le bouton "SÉLECTIONNER" ✓ ou swipe droite ajoute à "Ma Sélection" et passe à la suivante
- [ ] Le geste de swipe affiche un indicateur visuel (✓ ou ✕)
- [ ] La transition entre cartes est fluide (animation 300ms)

---

### US-CARD-003: Voir les détails d'un distributeur
**En tant qu'** utilisateur de l'application
**Je veux** pouvoir voir les détails complets d'un distributeur
**Afin de** connaître les produits disponibles et leur prix

**Critères d'acceptation:**
- [ ] Le bouton "Détails" ou "INFO" ouvre le modal de détails
- [ ] Le modal liste tous les produits avec : nom, prix, disponibilité
- [ ] Les produits indisponibles sont marqués visuellement
- [ ] Le bouton "Itinéraire" ouvre Google Maps avec les coordonnées

---

### US-CARD-004: Signaler un problème
**En tant qu'** utilisateur de l'application
**Je veux** pouvoir signaler un problème sur un distributeur
**Afin d'** aider la communauté à avoir des informations à jour

**Critères d'acceptation:**
- [ ] Le bouton "Signaler" ouvre le modal de signalement
- [ ] Je peux choisir le type de problème (rupture, prix, machine HS, etc.)
- [ ] Je peux sélectionner le produit concerné si applicable
- [ ] Le signalement est enregistré et j'obtiens des points

---

## 4. Modal Détails

### US-MODAL-001: Afficher les informations complètes
**En tant qu'** utilisateur de l'application
**Je veux** voir toutes les informations d'un distributeur dans un modal
**Afin de** prendre une décision éclairée

**Critères d'acceptation:**
- [ ] Le modal affiche : nom, adresse, note avec étoiles, distance
- [ ] La liste des produits est complète avec prix et disponibilité
- [ ] Les produits disponibles sont marqués ✓, les indisponibles ✗
- [ ] Le modal peut être fermé avec le bouton ✕

---

### US-MODAL-002: Obtenir l'itinéraire
**En tant qu'** utilisateur de l'application
**Je veux** pouvoir obtenir l'itinéraire vers un distributeur
**Afin de** m'y rendre facilement

**Critères d'acceptation:**
- [ ] Le bouton "Itinéraire" ouvre Google Maps dans un nouvel onglet
- [ ] L'URL contient les coordonnées GPS exactes du distributeur
- [ ] Les coordonnées sont validées avant construction de l'URL

---

### US-MODAL-003: Ajouter à ma sélection depuis le modal
**En tant qu'** utilisateur de l'application
**Je veux** pouvoir ajouter un distributeur à ma sélection depuis le modal détails
**Afin de** ne pas devoir fermer le modal pour le faire

**Critères d'acceptation:**
- [ ] Un bouton "Ajouter à ma sélection" est présent dans le modal
- [ ] Le clic ajoute/retire de la sélection (toggle)
- [ ] Le badge compteur se met à jour
- [ ] Une notification temporaire confirme l'action

---

## 5. Interface Utilisateur

### US-UI-001: Feedback visuel sur les actions
**En tant qu'** utilisateur de l'application
**Je veux** avoir un retour visuel sur mes actions
**Afin de** savoir que mon action a été prise en compte

**Critères d'acceptation:**
- [ ] Une notification temporaire s'affiche pour chaque action importante
- [ ] L'icône cœur change avec animation heartbeat
- [ ] Le badge compteur se met à jour en temps réel
- [ ] Les indicateurs de swipe (❤️/✕) s'affichent pendant le geste

---

### US-UI-002: États vides
**En tant qu'** utilisateur de l'application
**Je veux** voir un message clair quand il n'y a pas de contenu
**Afin de** comprendre la situation

**Critères d'acceptation:**
- [ ] Sélection vide : message "Aucun distributeur sélectionné" avec explication
- [ ] Favoris vides : 💔 "Aucun favori" avec message explicatif
- [ ] Fin de la queue : message "Plus de distributeurs à découvrir"

---

## Légende

- **US** = User Story
- **SEL** = Ma Sélection (distributeurs qui m'intéressent)
- **FAV** = Mes Favoris (les meilleurs parmi ma sélection)
- **CARD** = Cartes Explorer
- **MODAL** = Modals
- **UI** = Interface Utilisateur

> Les aspects techniques (Sécurité, Performance, Persistance) sont documentés dans [TECHNICAL_STORIES.md](TECHNICAL_STORIES.md)

---

*Document généré le 01/12/2025 - SnackMatch V3.0*
