# Backlog DistriMatch

> Liste prioritisee des items a traiter en autonomie via `/auto`.
> Plus haut = plus prioritaire. Marque `- [x]` quand un item est fait.
> Ajoute des **acceptance criteria** clairs sous chaque item pour eviter l'ambiguite.
> Le cap produit est dans `docs/STRATEGIE.md`. Les chantiers qui en decoulent sont
> listes dans "Chantiers strategie" et montent en priorite une fois cadres avec Stephane.

## En cours
<!-- Le skill /auto y place l'item actuellement traite -->

## Priorite haute

<!-- Lot 1 (2026-09-14) : socle + premiere brique de la strategie. Front seul,
     aucune migration Supabase, executable en autonomie. -->

- [ ] Socle : cache-busting des modules JS (un seul numero de version pour app.js ET ses imports)
  - Constat : `index.html` versionne `js/app.js?v=N` et les 5 CSS, mais les `import`
    ES entre modules (`utils.js`, `gmaps-ui.js`, `focus-trap.js`, `notifications.js`...)
    ne le sont pas. Apres un deploiement, un client peut charger le nouvel `app.js`
    avec un vieux module en cache (fenetre max-age GitHub Pages ~10 min) -> bundle
    incoherent.
  - Acceptance : un seul numero de version dans `index.html` s'applique a `app.js`
    et a tous les modules de `js/` (import map dans `index.html` avec une entree par
    module, OU suffixe `?v=N` sur chaque import ; l'import map est preferee : un seul
    endroit a bumper). Un test unit ou dom echoue si un fichier de `js/` importe par
    un autre n'est pas couvert par le mecanisme. `npm test` + e2e verts, l'app charge
    sans erreur console en local. Mettre a jour la section "Cache-busting" de
    `CLAUDE.md` (la limite connue disparait).

- [ ] Socle : page Compte verifiee et corrigee en mobile 390 px
  - Constat : la refonte de la page Compte (PR #84) n'a ete validee qu'en 1280 px
    desktop, sur une app mobile-first.
  - Acceptance : en viewport 390x844 (Playwright), la vue Compte n'a aucun
    debordement horizontal (`scrollWidth <= clientWidth` sur le conteneur de la vue),
    un email long est tronque avec ellipsis sans casser la mise en page, tous les
    boutons (connexion, reglages notifs, reinitialisation) sont visibles et
    cliquables sans chevaucher la bottom nav. Corriger le CSS si besoin (bumper le
    `?v=` du CSS modifie). Ajouter un test e2e en viewport 390 qui verrouille le
    non-debordement. Capture d'ecran 390 px verifiee visuellement.

- [ ] Strategie chantier 1 : fraicheur visible ("Verifie il y a X") sur fiche et side panel
  - Contexte : `docs/STRATEGIE.md`. La confiance = l'horodatage. Le champ existe
    deja (`lastVerified` dans le JSON, `last_verified` Supabase mappe dans
    `loadDistributorsFromSupabase()`) et n'est affiche nulle part.
  - Acceptance : en tete de la fiche distributeur et sur chaque item du side panel,
    afficher "Verifie il y a X min / h / j" a partir de `lastVerified`. Reutiliser
    le formatage relatif de `notifications.js` (`il y a N min / h / j`, vers la
    ligne 251) en l'extrayant dans `utils.js` (une seule implementation). Si
    `lastVerified` est absent ou invalide : "Pas encore verifie", jamais un faux
    etat. Code couleur : vert seulement si < 2 h, neutre sinon (jamais un vert
    perime). Aucune ville, langue ni territoire code en dur au-dela des chaines UI
    existantes. `escapeHTML` sur toute valeur injectee. Tests : unit sur le
    formatage (bornes 59 min / 60 min / 24 h / absent), e2e : le texte est present
    sur une fiche ouverte via `window.openDistributorModal`.

- [ ] Nettoyage confiance (1/3) : retirer les notes et compteurs d'avis de l'affichage
  - Contexte : `docs/STRATEGIE.md`, "Ce qu'on retire". Les 25 fiches de seed portent
    des notes (4.8) et des compteurs (203 avis) inventes ; un produit qui vend de la
    confiance n'affiche pas de faux chiffres. Decision Stephane 2026-09-14 : retirer
    de l'affichage, garder les fiches et les colonnes (aucune migration).
  - Acceptance : plus aucune note, etoile ni compteur d'avis affiches (fiche, side
    panel, favoris, message d'accueil du chat, formulaire d'ajout le cas echeant).
    Les mentions "Pas encore d'avis" / "Nouveau" issues de PR #68 disparaissent
    avec. CSS et tests devenus morts supprimes ; tests unit/dom/e2e mis a jour et
    verts. Les champs `rating` / `reviewCount` restent dans les donnees et le
    mapping Supabase.

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
  - Constat : la fiche affiche un onglet "Avis" qui ne contient qu'un placeholder
    "Aucun avis", sans aucun moyen d'en ajouter.
  - Acceptance : `docs/STRATEGIE.md` tranche : masquer l'onglet tant qu'aucun
    parcours "Laisser un avis" n'existe (un tel parcours serait une contribution
    publique -> auth requise). Tests mis a jour.

- [ ] UX : confirm() natifs sur actions destructrices
  - Constat : `confirm()` pour effacer donnees, supprimer produit, tout effacer
    notifs -> visuellement etranger au reste du design.
  - Acceptance : modale de confirmation maison reutilisable (titre + message +
    bouton danger/annuler) reutilisant le focus-trap (js/focus-trap.js) ; OU
    decision assumee de garder `confirm()` pour "Effacer mes donnees".

## Chantiers strategie (a cadrer avec Stephane avant passage en priorite)

<!-- Section NON lue par /auto (ni "Priorite haute" ni "Priorite normale").
     Ordre = docs/STRATEGIE.md. Un chantier qui exige une migration Supabase le dit :
     la migration s'execute a la main dans le dashboard AVANT le ticket front. -->

- [ ] Chantier 2 : signal de disponibilite en un tap (UC11, anonyme) - MIGRATION 007 requise
  - Table `availability_signals` (distributor_id, product_id, state, source, weight,
    device_hash, created_at), vue "etat courant" par produit, RPC
    `confirm_availability` ouverte a l'anonyme avec rate limit (1 signal / appareil /
    produit / heure). Signaux dans leurs propres tables, separees des donnees
    importees (ODbL).
  - Front : panneau "Il reste quoi ?" (chaque produit de la fiche : vu dispo / vu
    absent / pas regarde par defaut) + boutons machine "vide" / "en panne". Deep link
    `?id=<distId>&confirm=1` ouvre le panneau directement ; `&src=qr` trace
    l'origine. Fiche et marqueur montrent le resume ("3 produits sur 5 vus dispo il
    y a 12 min").
  - Politique d'auth : ajouter UC11 au tableau de `CLAUDE.md`.

- [ ] Chantier 3 (2/3 et 3/3) : masquer le chatbot par distributeur et la gamification (points, niveaux)
  - A cadrer : masquer derriere un flag ou retirer le code et ses tests.

- [ ] Chantier 4 : couche 0 - import OpenStreetMap + rythme de remplissage
  - Overpass `amenity=vending_machine` + `vending=*` (32 machines sur la zone pilote
    au 2026-09-14), mapping `vending` -> type, dedup par signature nom+coords
    (existante), attribution ODbL visible dans l'app.
  - Champs de rythme sur `distributors` (horaire de remplissage, creneaux vides) -
    MIGRATION requise ; saisis a l'inventaire, affiches en fiche.

- [ ] Chantier 5 : alertes reelles "previens-moi quand c'est plein" (Supabase Realtime +
  Web Push), branchees sur les signaux ; fermeture de boucle apres l'alerte ("Tu y es
  alle ? Il en restait ?").

- [ ] Chantier 6 : rythme infere (couche 2) - agregation des signaux par heure et jour
  ("habituellement plein le matin"), affichee quand une machine a assez de signaux.

- [ ] Chantier 7 : producteur optionnel - `owner_user_id` sur `distributors`
  (MIGRATION), revendication de fiche, bouton "rempli" a poids 1.0.

- [ ] Mesure : table `events` (type, distributor_id, source, device_hash, created_at ;
  aucune donnee personnelle) - MIGRATION - alimentee en fire-and-forget, et les 5
  KPI de depart en vues SQL : % machines avec signal < 24 h (directeur), signaux par
  source, ouvertures QR vs organique, taux de contribution (signaux / fiches
  ouvertes), fiches ouvertes par distributeur.

## Idees / a explorer

- [ ] Mode sombre auto (prefers-color-scheme) avec palette adaptee
- [ ] Service Worker reactive (cache offline des distributeurs deja vus)
- [ ] Filtres avances : "ouverts maintenant", "photo verifiee", "ajoute < 7 jours"
- [ ] Side panel : mode de transport comme discriminant de filtre ("a pied / velo / voiture-bus") - reutiliser DISTANCE_GROUPS de gmaps-ui.js (idee notee lors de PR #48)
- [ ] Tutorial premiere visite (3 slides : decouvrir / s'abonner / contribuer)
- [ ] Mode "Itineraire multiple" : selectionner 3 distributeurs et generer un parcours optimal

<!-- Absorbes par docs/STRATEGIE.md le 2026-09-14 : notifications push reelles
     (chantier 5), heatmap analytics (table events), statistiques perso (gamification,
     retiree). Open Graph : fait (PR #41). -->

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
