# Backlog DistriMatch

> Liste prioritisee des items a traiter en autonomie via `/auto`.
> Plus haut = plus prioritaire. Marque `- [x]` quand un item est fait.
> Ajoute des **acceptance criteria** clairs sous chaque item pour eviter l'ambiguite.
> Le cap produit est dans `docs/STRATEGIE.md`. Les chantiers qui en decoulent sont
> listes dans "Chantiers strategie" et montent en priorite une fois cadres avec Stephane.

## En cours
<!-- Le skill /auto y place l'item actuellement traite -->

## Priorite haute

<!-- Lot 2 (2026-09-15) livre : chantier 2 signal en un tap (PR #93) + auth en
     2 etapes (PR #94). Les tickets notes/avis et onglet Avis ont ete retires du
     lot : le seed est une maquette, la decision se prend a l'import OSM (cf.
     "Chantiers strategie", chantier 4). -->

## Priorite normale

<!-- Lot 3 a11y/UX (audit Nielsen/WCAG du 2026-06-05) ENTIEREMENT LIVRE le
     2026-09-15 : cibles tactiles 44 px (PR #95), contraste texte secondaire
     (PR #96), modale de confirmation maison (PR #97). Backlog /auto vide :
     les prochains items viennent de "Chantiers strategie", a cadrer avec
     Stephane (import OSM en premier). -->

## Chantiers strategie (a cadrer avec Stephane avant passage en priorite)

<!-- Section NON lue par /auto (ni "Priorite haute" ni "Priorite normale").
     Ordre = docs/STRATEGIE.md. Un chantier qui exige une migration Supabase le dit :
     la migration s'execute a la main dans le dashboard AVANT le ticket front. -->

<!-- Decision Stephane 2026-09-16 : avant d'importer du reel, un systeme FONCTIONNEL
     avec des donnees fictives, pour apprehender chaque couche. D'ou l'ordre : mesure
     (008) + jeu de demo (009) -> les 3 tickets front ci-dessous -> import OSM. Les 3
     tickets montent en Priorite haute des que Stephane confirme "Success" sur 008 et
     009 et a lance SELECT seed_demo_signals(). -->

- [ ] Mesure (front) : 5 evenements via la RPC `log_event` - REQUIERT 008 EXECUTEE
  - Contexte : `supabase/008_events_kpi_rhythm.sql` (table `events` sans lecture ni
    ecriture directe, RPC `log_event(p_type, p_device_hash, p_distributor_id, p_source)`
    ouverte a l'anonyme, anti-spam 300/h/appareil). Aucune donnee personnelle :
    `getDeviceId()` de utils.js.
  - Acceptance : nouveau `js/events.js` avec `logEvent(type, { distributorId, source })`
    fire-and-forget (jamais await bloquant, jamais d'erreur visible, no-op si
    `supabaseClient` null). Appels : `app_ouverte` a l'init (source = `distrimatch_src`
    de sessionStorage sinon 'organic') ; `qr_scan` quand l'URL porte `&src=qr` ;
    `fiche_ouverte` dans `openDistributorModal()` (source 'qr' si ouverte par le deep
    link QR, sinon 'organic') ; `signal_envoye` dans availability.js apres
    `inserted > 0` (meme source) ; `itineraire` au clic du bouton Itineraire. Import map
    + nouvelle entree. Tests : unit sur la construction des arguments (type invalide
    rejete, source par defaut), e2e avec `page.route('**/rest/v1/rpc/log_event')` qui
    compte les appels sur un parcours ouverture app -> fiche -> itineraire (aucun vrai
    evenement envoye par les tests).

- [ ] Strategie chantier 6 (front) : rythme infere "Habituellement plein le matin" - REQUIERT 008 EXECUTEE + 009 pour le voir
  - Contexte : vue `product_rhythm` (distributor_id, tranche matin/midi/apres-midi/soir,
    signaux_produit, pct_dispo, signaux_machine_ko), lisible en anonyme.
  - Acceptance : fonction pure `describeRhythm(rows)` dans utils.js -> phrase ou null :
    tranche "pleine" si signaux_produit >= 3 et pct_dispo >= 70, "souvent vide" si
    <= 30 ; ex. "Habituellement plein le matin, souvent vide l'apres-midi et le soir" ;
    null si aucune tranche qualifiee (rien d'affiche : jamais une phrase inventee).
    Affichee dans la fiche sous le badge "Vérifié il y a" (`#dist-modal-rhythm`,
    chargement fire-and-forget avec les autres signaux dans availability.js). Tests :
    unit sur describeRhythm (seuils, ordre des tranches, null), e2e avec `page.route`
    sur `**/rest/v1/product_rhythm*` renvoyant un profil boulangerie -> la phrase
    attendue apparait ; sans lignes -> rien. Import map bumpee.

- [ ] Tableau de bord du pilote (front) : les KPI de docs/STRATEGIE.md lisibles dans l'app - REQUIERT 008 EXECUTEE
  - Contexte : vues `kpi_coverage`, `kpi_contribution`, `kpi_events_daily`,
    `kpi_signals_daily`, `kpi_top_distributors` (agregats, lecture anonyme).
  - Acceptance : vue `#stats-view` (view-page, meme gabarit que Compte, cf.
    [[design-direction]]), ouverte depuis la page Compte par une rangee "Tableau de
    bord du pilote". Cartes : KPI directeur "% de machines avec un signal < 24 h"
    (machines_signal_24h / machines, gros chiffre + seuil pilote 30 % a 7 j rappele),
    taux de contribution (signaux_via_qr_30j / scans_qr_30j, seuil 5 %), QR vs
    organique (fiches_via_qr_30j / fiches_ouvertes_30j), signaux des 7 derniers jours
    (liste jour : n, texte, pas de lib graphique), top 5 fiches consultees. Etat vide
    explicite si Supabase absent. Aucun territoire en dur. Tests : dom sur le rendu a
    partir de donnees fixes (pourcentages, arrondis, etat vide), e2e avec `page.route`
    sur `**/rest/v1/kpi_*` -> les chiffres attendus s'affichent. CSS et import map
    bumpes.

- [x] Chantier 2, partie migration : `supabase/007_availability_signals.sql` ecrite
  (PR #90) et EXECUTEE par Stephane le 2026-09-15, verifiee en anonyme (RPC
  inserted/skipped, insert direct 42501, gardes 22023/P0002, vues, `last_verified`).
  UC11 dans `CLAUDE.md` (PR #90). La partie front est en Priorite haute.

- [ ] Chantier 3 : masquer le chatbot par distributeur et la gamification (points, niveaux)
  - A cadrer : masquer derriere un flag ou retirer le code et ses tests.

- [ ] Chantier 4 : couche 0 - import OpenStreetMap + rythme de remplissage
  - Overpass `amenity=vending_machine` + `vending=*` (32 machines sur la zone pilote
    au 2026-09-14), mapping `vending` -> type, dedup par signature nom+coords
    (existante), attribution ODbL visible dans l'app.
  - Champs de rythme sur `distributors` (horaire de remplissage, creneaux vides) -
    MIGRATION requise ; saisis a l'inventaire, affiches en fiche.
  - Decision a prendre A CE MOMENT, avec Stephane (2026-09-15 : le seed est une
    maquette, ses notes et compteurs d'avis sont inventes au meme titre que ses
    distributeurs) : que deviennent notes, compteurs d'avis et onglet "Avis" quand
    les vraies donnees remplacent la maquette ? Soit un parcours "Laisser un avis"
    (contribution publique -> auth requise) et l'onglet vit avec de vrais chiffres,
    soit masquer l'affichage (champs `rating` / `reviewCount` conserves, mentions
    "Pas encore d'avis" / "Nouveau" de PR #68 retirees, tests e2e "3 onglets" et
    "clic onglet Avis" adaptes). Pas un ticket /auto tant que ce n'est pas tranche.

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
- [x] 2026-09-15 Cache-busting : import map dans index.html versionnant les 14 modules JS d'un seul numero (?v=29), app.js charge via la map (plus de src a part), +5 tests unit "cache-busting" (couverture, version unique, fichiers existants), CLAUDE.md a jour, limite connue levee (PR #87, commit 9ed25aa)
- [x] 2026-09-15 Page Compte verifiee en mobile 390x844 : aucune correction CSS necessaire (pas de debordement, email long tronque, boutons au-dessus de la bottom nav) ; +1 test e2e "page Compte en 390x844" qui verrouille l'etat et clique reellement la rangee Reglages (PR #88, commit 9ff0a08)
- [x] 2026-09-15 Strategie chantier 1 - fraicheur visible : "Vérifié il y a X min/h/j" ou "Pas encore vérifié" en tete de fiche (#dist-modal-verified) et sur chaque item du side panel ; getFreshness() + timeAgo() unifies dans utils.js (vert seulement < 2 h, jamais un vert perime) ; +8 unit, +2 e2e ; import map ?v=30, overlays.css ?v=25 (PR #89, commit f6266fd)
- [x] 2026-09-15 Strategie chantier 2 - "Il reste quoi ?" : signal de dispo en un tap sans compte (UC11). Nouveau js/availability.js : modale maison (segment vu dispo / vu absent / pas regarde par produit + machine vide / en panne exclusifs, Envoyer desactive tant que rien n'est choisi), envoi RPC confirm_availability avec device id aleatoire local, "vu dispo il y a X" sous chaque produit + bandeau "Signalee vide il y a X", badge Verifie au vert apres envoi, deep link ?id=&confirm=1&src=qr. Fix : products(id) manquait au mapping Supabase. +4 unit, +4 e2e (RPC interceptee), import map ?v=31 (PR #93, commit a47e421)
- [x] 2026-09-15 UX auth : la modale "Connexion requise" ouvre la modale email directement (2 etapes au lieu de 3), fiche restee ouverte derriere, bouton de la page Compte conserve (design #84), import switchView retire de gmaps-ui.js, import map ?v=32, test e2e "modale gate" adapte (PR #94, commit a1008e7)
- [x] 2026-09-15 a11y Lot 3 : cibles tactiles >= 44x44 (WCAG 2.5.5) sans changer la taille visuelle : pseudo-element ::after centre de max(100%, 44px) sur tous les petits boutons (regle commune base.css), filter-bar padding 5px, slider en boite 44 px, heures calmes et segments "Il reste quoi ?" min-height 44, marqueur de position non interactif ; +2 e2e (section 14 : mesure de la zone effective sur 10 ecrans en 390 px + preuve elementFromPoint) (PR #95, commit 5122a93)
- [x] 2026-09-15 a11y Lot 3 : contraste du texte secondaire (WCAG 1.4.3 AA). Nouvelle variable --text-muted #7A6C60 (5,07:1 blanc, 4,80:1 creme) pour les 15 declarations color: var(--gray-light) (horodatages, sous-titres, small, icones chevron/chat/suppression) ; --gray-light reserve au non-texte ; les 5 CSS bumpes ; +3 tests unit (ratios calcules, aucune regle color: --gray-light) (PR #96, commit 72be87e)
- [x] 2026-09-15 UX : modale de confirmation maison (js/confirm-dialog.js, role alertdialog, focus-trap, Echap = annuler, focus sur Annuler) a la place des 3 confirm() natifs (Effacer mes donnees, Supprimer un produit, Tout effacer les notifs) ; .btn-danger-clean ; tests dom sur le vrai parcours Confirmer / Annuler, +2 e2e ; import map ?v=34 (PR #97, commit 4e2e78b)
