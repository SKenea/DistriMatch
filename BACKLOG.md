# Backlog DistriMatch

> Liste prioritisee des items a traiter en autonomie via `/auto`.
> Plus haut = plus prioritaire. Marque `- [x]` quand un item est fait.
> Ajoute des **acceptance criteria** clairs sous chaque item pour eviter l'ambiguite.

## En cours
<!-- Le skill /auto y place l'item actuellement traite -->

## Priorite haute

## Priorite normale


- [ ] Qualite : ajouter des tests unit pour `js/chat.js` fonctions pures (getTimeSlot helpers, generateGreetingMessage)
  - Acceptance : 4+ tests

- [ ] Qualite : ajouter des aria-labels aux boutons sans label visible (close, drag handle, navigation)
  - Acceptance : 100% des boutons ont un label ARIA, audit Lighthouse Accessibility >= 95

- [ ] Code : decouper styles.css (3500+ lignes) en 4-5 fichiers concatenes a la build (filter-bar.css, modal.css, etc.)
  - Acceptance : meme rendu, structure plus maintenable, doc dans CLAUDE.md

## Idees / a explorer

- [ ] Mode sombre auto (prefers-color-scheme) avec palette adapter
- [ ] Service Worker reactive (cache offline des distributeurs deja vus)
- [ ] Notifications push reelles via Supabase Realtime + Web Push API
- [ ] Filtres avances : "ouverts maintenant", "photo verifiee", "ajoute < 7 jours"
- [ ] Heatmap des distributeurs les plus consultes (analytics)
- [ ] Tutorial premiere visite (3 slides : decouvrir / s'abonner / contribuer)
- [ ] Open Graph meta tags pour partage social (1 image + description)
- [ ] Mode "Itineraire multiple" : selectionner 3 distributeurs et generer un parcours optimal
- [ ] Statistiques perso : "Tu as parcouru 12 km cette semaine" / "5 nouveaux distributeurs decouverts"

## A clarifier (auto-ajoutes par /auto)
<!-- Le skill /auto place ici les items ambigus qu'il n'a pas pu traiter -->

- [ ] UX : skeleton loading dans le panneau lateral pendant le tri par distance
  - Note /auto 2026-05-04 : le tri actuel est synchrone (<1ms) car les distances
    sont pre-calculees au chargement. Pas de latence reelle a masquer.
    Reformuler : skeleton uniquement si distributors pas encore charges (Supabase
    en cours), ou si le calcul de distance prend du temps lors d'un mouvement
    significatif de l'user ?

## Done
<!-- Items completes au format : [x] YYYY-MM-DD - Description (PR #N, commit abc1234) -->

- [x] 2026-04-27 Empty state Activite centre verticalement (PR #27, commit 3657115)
- [x] 2026-04-27 Geoloc refusee : message explicite + instructions OS-specifiques (PR #28, commit 736cb9d)
- [x] 2026-05-04 Loader pendant chargement initial des distributeurs (PR #29, commit 1e9fc15)
- [x] 2026-05-04 Animation pulse coeur favori (PR #30, commit 03e9847)
- [x] 2026-05-04 Tests unit notifications.js (PR #31, commit 8d0a8a8)
- [x] 2026-05-04 Bouton Partager sur la modal + auto-open via ?id= (PR #32, commit 12c750d)
- [x] 2026-05-04 Compteur "Mes contributions" dans le profil (PR #33, commit 2c95ff2)
