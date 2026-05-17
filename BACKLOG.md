# Backlog DistriMatch

> Liste prioritisee des items a traiter en autonomie via `/auto`.
> Plus haut = plus prioritaire. Marque `- [x]` quand un item est fait.
> Ajoute des **acceptance criteria** clairs sous chaque item pour eviter l'ambiguite.

## En cours
<!-- Le skill /auto y place l'item actuellement traite -->

## Priorite haute

## Priorite normale

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
- [x] 2026-05-04 Tests unit chat.js (getTimeSlot edges + generateGreetingMessage) (PR #34, commit dac64e6)
- [x] 2026-05-04 Aria-labels sur tous les boutons icon-only (PR #35, commit 1f899d1)
- [x] 2026-05-04 5 fix post-review /auto 5 (XSS aria-label, saveProfile, multi-user counter, URL cleanup, mock Date) (PR #36, commit cefb38b)
- [x] 2026-05-04 Deep link ?id= ouvre la modal avant consentement geoloc (PR #37, commit c6d0a1b)
- [x] 2026-05-04 Bypass hCaptcha sur localhost + banner dev (PR #38, commit 8426f40)
- [x] 2026-05-06 Marqueur user en bleu Google au lieu de rouge (PR #39, commit 65e9d37)
- [x] 2026-05-13 Decoupage styles.css 4038 lignes en 5 modules thematiques (PR #40, commit 2ffd56d)
- [x] 2026-05-14 Head polish : OG meta tags + favicon + PWA icons + manifest fix (PR #41, commit a84eac8)
- [x] 2026-05-14 Retrait signInAnonymously() automatique (dead code depuis activation hCaptcha) (PR #42, commit ae7f1f8)
- [x] 2026-05-14 Side panel : distance affichee + tri par distance + separateurs visuels (PR #43, commit d0bd63a)
- [x] 2026-05-17 Bug : dedup distributeurs par id (local + remote Supabase) (PR #44, commit ca4f4fa)
