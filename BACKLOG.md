# Backlog DistriMatch

> Liste prioritisee des items a traiter en autonomie via `/auto`.
> Plus haut = plus prioritaire. Marque `- [x]` quand un item est fait.
> Ajoute des **acceptance criteria** clairs sous chaque item pour eviter l'ambiguite.

## En cours
<!-- Le skill /auto y place l'item actuellement traite -->

## Priorite haute

## Priorite normale

<!-- Lot 3 du chantier a11y/UX (issu de l'audit Nielsen/WCAG du 2026-06-05).
     Non bloquant : Lot 1 + Lot 2 livres = objectif "fini" atteint. Items de
     polish a traiter au fil de l'eau. -->

- [ ] a11y : cibles tactiles >= 44px (WCAG 2.5.5 / iOS HIG / Material)
  - Constat : `.icon-btn` 40x40, `.btn-zoom` 40x40, croix de fermeture 36/32px.
  - Acceptance : tout element tactile >= 44x44 (taille reelle OU zone etendue via
    padding/pseudo-element) ; aucune regression visuelle desktop.

- [ ] a11y : contraste du texte secondaire (WCAG 1.4.3 AA)
  - Constat : `--gray-light #A89B8C` (~2.6:1 sur blanc) utilise pour horodatages
    (`conversation-time`), `small`, hints -> sous le 4.5:1 requis pour petit texte.
  - Acceptance : assombrir `--gray-light` (ou reserver son usage au non-texte)
    jusqu'a >= 4.5:1 ; verifier au contrast checker.

- [ ] UX : onglet "Avis" = cul-de-sac (fausse affordance)
  - Constat : la fiche affiche une note + un onglet "Avis" qui ne contient qu'un
    placeholder "Aucun avis", sans aucun moyen d'en ajouter.
  - Acceptance : soit masquer l'onglet tant que non implemente, soit ouvrir un
    parcours "Laisser un avis" (contribution publique -> auth requise, cf.
    politique d'auth UC).

- [ ] UX : confirm() natifs sur actions destructrices
  - Constat : `confirm()` pour effacer donnees, supprimer produit, tout effacer
    notifs -> visuellement etranger au reste du design.
  - Acceptance : modale de confirmation maison reutilisable (titre + message +
    bouton danger/annuler) reutilisant le focus-trap (js/focus-trap.js) ; OU
    decision assumee de garder `confirm()` pour "Effacer mes donnees".

## Idees / a explorer

- [ ] Mode sombre auto (prefers-color-scheme) avec palette adapter
- [ ] Service Worker reactive (cache offline des distributeurs deja vus)
- [ ] Notifications push reelles via Supabase Realtime + Web Push API
- [ ] Filtres avances : "ouverts maintenant", "photo verifiee", "ajoute < 7 jours"
- [ ] Heatmap des distributeurs les plus consultes (analytics)
- [ ] Side panel : mode de transport comme discriminant de filtre ("a pied / velo / voiture-bus") - reutiliser DISTANCE_GROUPS de gmaps-ui.js (idee notee lors de PR #48)
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
- [x] 2026-05-17 Bug : dedup doublons internes localStorage - upsert saveUserDistributor + merge robuste (PR #45, commit d477978)
- [x] 2026-05-17 Bug : CAUSE RACINE doublons - garde anti double-submit confirmAddDistributor + filet dedup par contenu (PR #46, commit 72da3ac)
- [x] 2026-05-17 UX : separateur visuel net entre distributeurs (side panel) - option C inset iOS/Material (PR #47, commit 3e383ee)
- [x] 2026-05-17 UX : side panel accordeon par distance (3 tranches fermees, sticky, plage + mode de transport en icones) (PR #48, commit 30b1017)
- [x] 2026-05-17 Favoris : edition distributeur via stylo (page Favoris, auth requise) + favori purement local sans email + fix z-index modale auth (PR #49, commit 83064fc)
- [x] 2026-05-18 Bug PWA : manifest start_url/scope relatifs (install ecran d'accueil cassee sur GitHub Pages sous-chemin) (PR #50, commit 7ff093e)
- [x] 2026-05-19 Produits : plus de prix par produit + niveau de prix distributeur €/€€/€€€ (header + edition + creation) + UI dispo/suppr (pastille + corbeille + confirm) + bypass auth localhost dev (PR #51)
- [x] 2026-05-19 Notifications : vraies notifs navigateur (Notification API + fallback in-app) + centre de notifs cloche (badge non-lus, vue liste, decouple favoris) + suppression (corbeille item + tout effacer) (PR #52)
- [x] 2026-05-19 Bug filtre : chip "Tous" desync apres fermeture du panneau (closeSidePanel nettoie le chip) (PR #53, commit 0864b3c)
- [x] 2026-05-19 Profil : refonte Local Guides (niveau + barre progression + contribution compacte) + menu deroulant avatar (Mon profil/Compte/Connexion) + nouvelle vue Compte (etat + reglages notifs + zone danger) (PR #54, commit 09b9c7f)
- [x] 2026-05-19 Compte : connexion centralisee (bouton "Se connecter" primaire) + retrait du mot "danger" -> bloc "Reinitialisation" sobre + flux Modifier : stylo conserve, clic non identifie -> modale "Connexion requise" -> page Compte (PR #55, commit 23f6c2c)
- [x] 2026-05-20 Coherence couleur marker : favori en rouge brand (#E63946), non-favori en orange terracotta (#F4A261) - cohere avec le coeur "Favori" rouge de la fiche (PR #58, commit 14ecd05)
- [x] 2026-05-20 Photos distributeur (1/2) : vignette photo reelle dans le side panel + badge emoji categorie en pastille + bandeau fallback degrade dans la fiche + prefetch groupe (loadPhotoThumbnails, 1 requete Supabase) + cache AppState.photoThumbs (PR #56, commit c2e4f03)
- [x] 2026-05-20 Photos distributeur (2/2) : bouton "Photo" dans la fiche pour ajouter une photo a un distributeur existant (auth requise via la modale "Connexion requise") + upload Supabase + rechargement immediat galerie/vignette + verrou de re-entrance (PR #60, commit d7e68a6)
- [x] 2026-05-20 Photo geofence 100m : preuve de presence avant upload (cache AppState.userLocation prioritaire, fallback getUserLocation, toast explicite si refus geoloc ou distance > 100m) (PR #62, commit a2878ee)
- [x] 2026-05-20 Refactor KISS polish : --primary-rgb + swap 11 rgba en dur vers vars CSS + suppression code mort (VOTES_KEY, ACTIVITY_KEY doublon) + try/catch inutile dans initSupabase (PR #64, commit 9a610f2)
- [x] 2026-05-26 Capture webcam desktop : isLikelyDesktop() + modale getUserMedia (preview live + Capturer / Annuler / lien fallback fichier) + refacto processPhotoUpload commun avec file picker + cleanup MediaStream tracks sur toutes les sorties (LED propre) + auto-fallback file picker si camera refusee (PR #66, commit 6b583a0)
- [x] 2026-05-30 UI rating : ne plus afficher "5.0 ★★★★★ (0)" quand reviewCount=0 (trompeur, user-added partent a 5.0 par defaut). A la place : "Pas encore d'avis" (fiche, chat bot) ou "Nouveau" (side panel, favoris). Classe .no-reviews + .side-panel-item-new + .subscription-rating--new (PR #68, commit 616c63b)
- [x] 2026-05-31 Docs auth : formaliser la politique d'authentification dans CLAUDE.md (matrice 10 use cases : UC1-4 contributions publiques = auth obligatoire ; UC5-10 actions sociales locales + prefs perso = libre). Commentaire en tete de js/auth.js + maj memoire projet_auth_architecture (PR #70, commit d338c9c)
- [x] 2026-05-31 Tests auth : section 10 dans tests/e2e.spec.js avec 6 tests verrouillant la politique (UC1-4 gating : modale email ou gate "Connexion requise" ; UC5 favori + UC8 slider geofence = aucune modale, anti-regression regle #7). 56 + 1 flaky onboarding (PR #71, commit 12cd4da)
- [x] 2026-06-01 Securite RLS : audit Supabase via pentest anonyme (10/12 actions bloquees par RLS code 42501) revele une faille RPC submit_report (SECURITY DEFINER sans check auth.uid IS NOT NULL -> insertion signalements anonymes possible). Migration 004_rls_hardening.sql ajoute le check defensif a submit_report ET cast_vote. Applique en prod, verifie : appel anonyme retourne maintenant error 42501 "Authentification requise". Notes hors scope (products / distributors UPDATE/DELETE / distributor_photos DELETE) documentees dans le SQL pour arbitrage futur (PR #72, commit 2380878)
- [x] 2026-06-19 a11y Lot 1 : focus clavier visible global (:focus-visible), toasts annonces aux lecteurs d'ecran (role/aria-live + role=alert sur erreurs), prefers-reduced-motion, pinch-zoom reactive (retrait user-scalable=no) (PR #78, commit 41cad61)
- [x] 2026-06-19 Fix resilience : init resiliente quand Supabase est injoignable (DNS/offline/pause free-tier). Les enrichissements non critiques (photos, signalements) passent en fire-and-forget pour ne plus geler l'UI (carte + listeners). Bonus : playwright.config en headless par defaut. e2e 41->57 (PR #79, commit 47a2eb6)
- [x] 2026-06-19 a11y Lot 2.1 : focus-trap + semantique dialog sur les 5 modales (fiche, chat, signalement, auth, "Connexion requise"). Nouveau js/focus-trap.js (focus piege, Echap, retour focus, [autofocus], modales imbriquees). +5 dom, +2 e2e (PR #80, commit 99b3924)
- [x] 2026-06-19 a11y Lot 2.2 : modale maison "Suivre un produit" remplace le prompt() natif (modal-clean + focus-trap + validation non vide/maxlength). +4 dom, +2 e2e (PR #81, commit 9e5669e)
