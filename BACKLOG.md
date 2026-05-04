# Backlog DistriMatch

> Liste prioritisee des items a traiter en autonomie via `/auto`.
> Plus haut = plus prioritaire. Marque `- [x]` quand un item est fait.
> Ajoute des **acceptance criteria** clairs sous chaque item pour eviter l'ambiguite.

## En cours
<!-- Le skill /auto y place l'item actuellement traite -->

## Priorite haute

- [ ] UX : ajouter un loader visible pendant le chargement initial des distributeurs (Supabase peut prendre 5-10s)
  - Reproduire : reseau lent, ouvrir l'app
  - Attendu : spinner + texte "Chargement des distributeurs..." sur la carte
  - Acceptance : loader visible si fetch > 1s, disparait au chargement complete

- [ ] UX : feedback visuel quand on s'abonne (heart se remplit avec animation pulse)
  - Reproduire : ouvrir une modal distributeur, cliquer le coeur
  - Attendu : animation 200ms du coeur (scale 1 -> 1.3 -> 1) + couleur passe au rouge
  - Acceptance : animation smooth + le toast existant reste

## Priorite normale

- [ ] Feature : bouton "Partager" sur la modal distributeur (copie un lien vers le distributeur dans le presse-papier)
  - Reproduire : ouvrir une modal, scroll, cliquer Partager
  - Attendu : copie URL `https://skenea.github.io/DistriMatch/?id=<distId>` + toast "Lien copie"
  - Acceptance : test unitaire de la generation d'URL + integration clipboard
  - Bonus : a l'ouverture de l'app avec ce param, ouvrir directement la modal

- [ ] Feature : compteur "Mes contributions" dans le profil (distributeurs ajoutes, photos, signalements)
  - Acceptance : 3 stats visibles, mis a jour au fil des actions

- [ ] UX : skeleton loading dans le panneau lateral pendant le tri par distance
  - Acceptance : 5 skeleton items visibles le temps du tri

- [ ] Qualite : ajouter des tests unit pour `js/notifications.js` (isQuietHours, canNotify, processQueuedNotifications)
  - Acceptance : 5+ tests, couverture > 80% du module

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

## Done
<!-- Items completes au format : [x] YYYY-MM-DD - Description (PR #N, commit abc1234) -->

- [x] 2026-04-27 Empty state Activite centre verticalement (PR #27, commit 3657115)
- [x] 2026-04-27 Geoloc refusee : message explicite + instructions OS-specifiques (PR a venir)
