# Backlog DistriMatch

> Liste prioritisee des items a traiter en autonomie via `/auto`.
> Plus haut = plus prioritaire. Marque `- [x]` quand un item est fait.
> Ajoute des **acceptance criteria** clairs sous chaque item pour eviter l'ambiguite.
> Le cap produit est dans `docs/STRATEGIE.md`. Les chantiers qui en decoulent sont
> listes dans "Chantiers strategie" et montent en priorite une fois cadres avec Stephane.

## En cours
<!-- Le skill /auto y place l'item actuellement traite -->

## Priorite haute

<!-- Lot 4 (mesure + demo) ENTIEREMENT LIVRE le 2026-09-16 (PR #104, #105, #106).
     Lot 5 (2026-09-18) : audit UX mobile en prod, `docs/AUDIT_UX_2026-09-18.md`.
     Les IDs UX-xx renvoient au rapport ; captures dans docs/audit/2026-09-18/. -->

- [ ] UX-01 Toasts visibles partout : au-dessus des modales et de la bottom nav
  - Contexte : `#toast-container` est en z-index 300, la fiche `#dist-modal-overlay` en
    10500 (confirm 11500) : apres « Envoyer » (Merci !), apres « Partager » (lien copie)
    et en erreur 503, le toast est rendu SOUS la fiche, l'utilisateur ne voit rien
    (capture 10). Sur la carte, le toast (top 551) recouvre la bottom nav (top 604)
    (capture 11). UX-01 / UX-10 / UX-25 du rapport.
  - Acceptance : z-index du conteneur superieur a toutes les modales ; position au-dessus
    de la bottom nav quand elle est visible (variable CSS de hauteur de nav + safe-area) ;
    en erreur 503, un message inline dans la modale de signal en plus du toast ; aucune
    regression desktop. Tests e2e : (1) apres envoi d'un signal (RPC interceptee),
    `document.elementFromPoint` au centre du toast est le toast ; (2) sur la carte,
    `toast.bottom <= bottomNav.top` ; (3) 503 -> `#availability-modal` contient le
    message d'erreur. CSS bumpe.

- [ ] UX-03 Liste « Tous les distributeurs » vide a l'ouverture par le hamburger
  - Contexte : sur mobile, `#sidebar-toggle` ouvre le panneau « Tous les distributeurs »
    avec `#side-panel-list` vide (0 element apres 2,5 s, WebKit et Chromium, capture 05).
    Il faut taper un chip pour peupler. C'est la vue « classes par distance » promise a
    l'accueil.
  - Acceptance : a l'ouverture du panneau, la liste est rendue avec le filtre courant
    (« Tous » par defaut), premier groupe non vide ouvert. Test e2e : tap
    `#sidebar-toggle` -> au moins un `.side-panel-item` visible sans autre action.

- [ ] UX-07/08 Contraste et tailles : rouge texte, vert fraicheur, nav et indices lisibles
  - Contexte : mesures de l'audit (styles calcules) : `--primary` #E63946 sur blanc =
    4,17:1 (< 4,5 AA) en texte 12-14 px sur les 5 boutons d'action de la fiche, les
    onglets, la bottom nav et les boutons pleins (Envoyer, Se connecter, Recevoir le
    lien) ; vert fraicheur #16a34a = 3,30:1 (« Vérifié a l'instant »,
    `.product-seen.is-fresh`) ; « +10 pts » 3,34:1. Polices : bottom nav 10,4 px, indices
    « vu absent il y a… » 11,5 px (l'information cle), groupes du panneau 10,9-11,5 px.
  - Acceptance : token `--primary-text` #D62828 (5,0:1) pour tout texte rouge et tout
    fond de bouton portant du texte blanc, `--primary` reste pour les aplats sans texte ;
    vert fraicheur #15803d (5,0:1) partout (badge, indices, tableau de bord) ; bottom nav
    >= 12 px, indices produits >= 13 px, groupes du panneau >= 12 px. Test unit : etendre
    le test de ratio existant (« a11y : contraste ») aux nouveaux tokens ; test e2e : aucune
    police calculee < 12 px sur carte, panneau, fiche et modale de signal en 390 px.

- [ ] UX-02 Entrer sans geolocalisation, et pas de mur apres un scan QR
  - Contexte : l'overlay d'accueil n'a qu'une issue (« Activer la localisation ») ; apres
    un refus : « Reessayer » + reglages iPhone, cul-de-sac (capture 02). Apres un scan QR
    (`?id=&confirm=1&src=qr`) et un signal envoye, fermer la fiche renvoie sur ce mur
    (capture 12). Les utilisateurs qui refusent la geoloc n'entrent jamais.
  - Acceptance : lien secondaire « Voir la carte sans me localiser » sous le CTA (et dans
    l'etat refuse) : carte centree sur le centroide des distributeurs charges (aucune
    coordonnee en dur), panneau trie par nom (ou fraicheur) avec la mention « Active la
    localisation pour trier par distance » ; apres un deep link (`?id=`), la fermeture de
    la fiche n'affiche pas l'overlay, elle laisse la carte utilisable. Tests e2e :
    (1) contexte sans permission -> tap « sans me localiser » -> `.leaflet-container`
    visible, marqueurs > 0, `#geoloc-overlay.hidden` ; (2) deep link QR sans geoloc ->
    fermer la fiche -> overlay hidden, carte visible.

- [ ] UX-04 Bouton retour (Android) : fermer la fiche ou la modale au lieu de quitter l'app
  - Contexte : fiche ouverte, `history.back()` mene a `about:blank` (l'app est quittee),
    constate sur les deux moteurs. Sur Android, c'est LE geste de fermeture.
  - Acceptance : a l'ouverture d'une fiche, d'une modale (signal, chat, confirm) ou d'une
    vue (Compte, Favoris, Activite, notifications, stats), `history.pushState({ layer })` ;
    `popstate` ferme la couche la plus haute ; fermer par la croix ou le bouton retour
    appelle `history.back()` sans boucle ; le nettoyage du deep link (replaceState) est
    conserve. Tests e2e : ouvrir la fiche -> `page.goBack()` -> fiche fermee, URL
    inchangee, `window.AppState` toujours present ; modale signal ouverte -> goBack ->
    modale fermee, fiche encore ouverte ; vue Compte -> goBack -> carte.

- [ ] UX-05/13 Fiche : la fraicheur d'abord, « Il reste quoi ? » en action primaire
  - Contexte : capture 06. La note inventee « 4.8 ★★★★½ (89) » vient avant « Vérifié il y
    a 1 j » (gris, petit) ; hero de 220 px (emoji + type, type repete dans la ligne meta) ;
    « Il reste quoi ? » est le 4e de 5 boutons identiques, seul « Itineraire » est en
    primaire ; separateur « · » orphelin en fin de ligne meta quand « Vérifié » passe a la
    ligne. A livrer avec le ticket « badge Disponible » (Priorite normale) qui traite la
    meme zone.
  - Acceptance : ordre du header = nom, badge fraicheur (couleur, 14 px, sur sa propre
    ligne, plus de separateur orphelin), rythme, puis note / type / prix ; hero <= 120 px
    sans photo (avec photo : inchange) ; « Il reste quoi ? » bouton primaire pleine largeur
    au-dessus de la rangee Itineraire / Favori / Photo / Partager (secondaires) ; le type
    n'apparait qu'une fois. Tests e2e : `#dist-modal-verified` au-dessus de
    `#dist-modal-rating` (getBoundingClientRect) ; largeur de `#dist-action-confirm`
    > 60 % de la fiche ; aucun `.meta-separator` en dernier enfant visible de
    `.dist-modal-meta` ; section 14 (cibles 44 px) toujours verte. CSS et import map bumpes.

## Priorite normale

<!-- Lot 3 a11y/UX (audit Nielsen/WCAG du 2026-06-05) ENTIEREMENT LIVRE le
     2026-09-15 : cibles tactiles 44 px (PR #95), contraste texte secondaire
     (PR #96), modale de confirmation maison (PR #97). Backlog /auto vide :
     les prochains items viennent de "Chantiers strategie", a cadrer avec
     Stephane (import OSM en premier). -->

- [ ] Fiche : le badge statique "Disponible" contredit le dernier signal produit
  - Contexte : vu en prod le 2026-09-16 grace au jeu de demo (dist-007 "Legumes Bio
    Cambo") : "Panier legumes saison / vu absent il y a 44 min / Disponible". Le badge
    vient du flag editorial `products.available` (seed = maquette, rendu dans
    `js/distributor.js` `renderProducts`, `.product-availability-clean`), l'indice vient
    de la vue `product_availability` (availability.js). Deux verites cote a cote =
    confiance perdue, alors que la fraicheur horodatee est LE produit (STRATEGIE).
  - Option retenue par defaut (Stephane peut trancher autrement) : le badge suit le
    signal quand il existe et est frais (< `FRESH_MAX_AGE_MS`) : "Vu dispo" (vert) /
    "Vu absent" (gris) ; sans signal frais, badge neutre "Au catalogue" a la place de
    "Disponible" (le flag editorial ne dit rien de l'instant). L'indice "vu ... il y a X"
    reste sous le nom. Le chip cliquable du mode edition (toggle du flag) ne change pas.
  - Acceptance : fonction pure `resolveAvailabilityBadge(product, signalRow, now)` dans
    utils.js -> `{ label, tone }` (tests unit : signal frais dispo / absent, signal perime,
    aucun signal) ; rendu dans la fiche (lecture seule) ; e2e avec
    `page.route('**/rest/v1/product_availability*')` : une ligne absent recente ->
    badge "Vu absent", aucune ligne -> "Au catalogue". Import map bumpee, CSS bumpe.

<!-- Audit UX mobile du 2026-09-18 (docs/AUDIT_UX_2026-09-18.md), finitions P2. -->

- [ ] UX-09 Modale « Il reste quoi ? » : une seule croix, « Pas regarde » neutre
  - Contexte : capture 09 : deux croix superposees (fiche + modale) ; « Pas regarde »
    preselectionne en gras ressemble a un choix deja fait.
  - Acceptance : la croix de la fiche est masquee tant que la modale est active ; « Pas
    regarde » en style neutre (pas de gras, gris) tant qu'aucun choix ; e2e : modale
    ouverte -> `#dist-modal-close` non visible ; `.availability-seg-btn[data-state="unseen"]`
    sans classe de selection par defaut.

- [ ] UX-11/12 Filtres et panneau : defilement visible, « Tous » atteignable, groupes utiles
  - Contexte : capture 04. 3 chips sur 12 visibles sans indice de defilement ; le panneau
    ouvert cache les chips (« Tous » inaccessible sans fermer) ; groupes replies par
    defaut (+1 tap), groupe « A proximite 0 » affiche, toast redondant « Boulangerie &
    Taloa : 3 distributeur(s) ».
  - Acceptance : degrade de bord droit sur `#filter-bar` tant que
    `scrollLeft < scrollWidth - clientWidth` ; le filtre reste changeable panneau ouvert
    (chips au-dessus du panneau, ou rappel « Tous » en tete de panneau) ; premier groupe
    non vide ouvert, groupes vides masques ; toast de comptage supprime (le titre du
    panneau porte le compte). E2e : tap chip -> un `.side-panel-item` visible sans tap
    supplementaire ; aucun `.toast` apres tap chip.

- [ ] UX-16 Accents des libelles UI
  - Contexte : melange dans l'UI : « Itineraire », « Activite », « Reessayer »,
    « Geolocalisation refusee », « Vérifié a l'instant », « Lien copie », « abonne a »,
    « Reglages », « General », « Notifications activees », « apparaitront »… a cote de
    libelles accentues. Impression de brouillon sur mobile (captures 06, 14).
  - Acceptance : toutes les chaines visibles (index.html, templates JS, toasts)
    accentuees ; commentaires et identifiants restent sans accents. Test unit : une liste
    de chaines connues (« Itineraire », « Activite », « Reessayer », « a l'instant »,
    « Lien copie », « abonne a ») est introuvable dans index.html et js/*.js hors
    commentaires.

- [ ] UX-18/19 Favori et menu avatar : un seul mot, etat accessible, cibles 44 px
  - Contexte : le bouton passe de « Favori » a « Retirer » sans `aria-pressed`, toast
    « Tu es maintenant abonne a … », vue « Mes Favoris / 0 abonnement » avec une cloche en
    etat vide ; items du menu avatar 176 x 37 px.
  - Acceptance : libelle « Favori » constant + `aria-pressed` + coeur plein / vide ;
    vocabulaire « favori » partout (compteur, toast « Ajoute a tes favoris »), icone coeur
    dans l'etat vide ; `.profile-menu-item` >= 44 px. E2e : `aria-pressed` bascule au tap ;
    la section 14 (cibles) couvre le menu avatar ouvert.

- [ ] UX-20/21 Vues cachees inertes, controles avec la police du site
  - Contexte : `.view-page.view-hidden` et `#chat-modal` restent `display: block/flex`,
    `visibility: visible`, translates hors ecran : 6 focusables atteignables au clavier et
    au lecteur d'ecran. `button/input/select` n'heritent pas de la police (Arial sur
    Chromium Android, serif sur WebKit Windows) alors que le corps est en `-apple-system`.
  - Acceptance : `visibility: hidden` (avec `transition: visibility 0s .3s`) ou `inert` sur
    les vues cachees et le chat ferme ; `button, input, select, textarea { font: inherit }`.
    E2e : un bouton d'une vue cachee ne prend pas le focus (`el.focus();
    document.activeElement !== el`) ; `getComputedStyle(bouton).fontFamily ===
    getComputedStyle(body).fontFamily`.

- [ ] UX-15 Ecran d'accueil : promettre ce que l'app fait
  - Contexte : capture 01 : « Alertes stock » (pas encore livre) et « Avis … par la
    communaute » ; la vraie promesse (fraicheur horodatee, signal en un tap, rythme) est
    absente ; « Cote Basque » en dur dans la phrase d'accroche.
  - Proposition (Stephane peut retoucher les textes) : titre « Sache avant d'y aller »,
    sous-titre « Les distributeurs autour de toi, avec l'heure de la derniere
    verification. » ; benefices : « Vérifié il y a 12 min » / « Dis ce que tu vois, en un
    tap, sans compte » / « Habituellement plein le matin ». Le nom de la zone vient des
    donnees (ville la plus frequente des distributeurs charges) ou disparait.
  - Acceptance : textes remplaces, aucun nom de territoire en dur dans index.html ; e2e :
    l'overlay ne contient ni « Alertes stock » ni « Cote Basque ».

## Chantiers strategie (a cadrer avec Stephane avant passage en priorite)

<!-- Section NON lue par /auto (ni "Priorite haute" ni "Priorite normale").
     Ordre = docs/STRATEGIE.md. Un chantier qui exige une migration Supabase le dit :
     la migration s'execute a la main dans le dashboard AVANT le ticket front. -->

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

- [x] Chantier 6 : vue product_rhythm livree en 008 (2026-09-16) ; la partie front est en Priorite haute. Ancien enonce : agregation des signaux par heure et jour
  ("habituellement plein le matin"), affichee quand une machine a assez de signaux.

- [ ] Chantier 7 : producteur optionnel - `owner_user_id` sur `distributors`
  (MIGRATION), revendication de fiche, bouton "rempli" a poids 1.0.

- [x] Mesure, partie migration : livree en 008 (2026-09-16), front en Priorite haute. Ancien enonce : table `events` (type, distributor_id, source, device_hash, created_at ;
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

- [ ] Audit UX 2026-09-18, decisions produit (docs/AUDIT_UX_2026-09-18.md, section
  « Decisions a prendre ») :
  - (a) UX-14 onglet « Avis » et note « 4.8 (89) » : l'en-tete annonce 89 avis, l'onglet
    dit « Aucun avis » sans action possible -> masquer l'onglet et la note jusqu'a la
    decision OSM (chantier 4), ou seulement reculer la note (choix par defaut de UX-05) ?
  - (b) UX-23 jeu de demo qui vieillit (signaux « il y a 1 j », KPI 24 h a 0 %) ->
    regeneration nocturne par pg_cron tant que le pilote reel n'a pas demarre (extension
    a activer, puis SQL Editor : `select cron.schedule('demo-reseed', '15 3 * * *',
    $$select purge_demo_data(); select seed_demo_signals();$$);`).
  - (c) UX-24 donnees de test en prod (« Boulangerie Test Photo », « Tic Tac – Adresse a
    completer », `user-1776102020333`) a purger dans le SQL Editor.
  - (d) UX-17 chantier 3 : l'activite affiche « Signalement empty » (enum brut), « +10
    pts », un favori cree une conversation bot et un badge Activite « 1 » : tout part avec
    le masquage du chat et de la gamification.

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
- [x] 2026-09-16 Mesure (front) : 5 evenements du pilote via la RPC log_event, js/events.js fire-and-forget, +6 unit +3 e2e, RPC interceptee dans tous les tests (PR #104, commit 3a453b3)
- [x] 2026-09-16 Strategie chantier 6 (front) : rythme infere "Habituellement plein le matin, souvent vide ..." sous la fraicheur de la fiche (describeRhythm dans utils.js, vue product_rhythm chargee avec les signaux, #dist-modal-rhythm), +5 unit +2 e2e, overlays.css v28, import map v36 (PR #105, commit 3b86f47)
- [x] 2026-09-16 Tableau de bord du pilote (front) : vue #stats-view depuis la page Compte (rangee "Tableau de bord du pilote"), KPI directeur % machines avec signal < 24 h + seuil 30 % a 7 j, contribution (signaux via QR / scans, seuil 5 %), QR vs organique, signaux 7 jours, top 5 fiches ; etat vide explicite ; js/stats.js, panels.css v30, import map v37, +6 dom +2 e2e (PR #106, commit 248470c)
