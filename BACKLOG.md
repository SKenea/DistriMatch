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
     Les IDs UX-xx renvoient au rapport ; captures dans docs/audit/2026-09-18/.
     Les 6 tickets Priorite haute sont LIVRES le 2026-09-18 (PR #109 a #114, session
     /auto 6) et les 7 tickets Priorite normale le meme jour (PR #116 a #122, session
     /auto 7). Backlog /auto VIDE : prochaines etapes = les 4 decisions de « A clarifier »
     puis les chantiers strategie (import OSM en premier), a cadrer avec Stephane. -->

### EPIC-T7 Quatre niveaux de tests : unitaire, integration, fonctionnel, E2E (Stephane, 2026-09-25)
Objectif : que chaque niveau de risque ait son filet. Les regles de la base (010 a
014), les plus fragiles aujourd'hui, n'etaient verifiees par aucun test rejouable.
Hors perimetre : execution sur GitHub Actions (quota presque plein) ; tout se
lance en local (par Claude, `/auto`). Reformulation validee le 2026-09-25, avec un
compte de test dedie pour les vrais E2E. Livre le meme jour sauf T7-US4b (bloquee).
Etat : 140 unitaires, 114 integration (98 DOM + 16 vraie base), 117 fonctionnels, 8 E2E (5 visiteur + 3 connecte).

- [x] T7-US1 Unitaires : `tests/unit/`, `npm run test:unit` (fonctions pures).
- [x] T7-US2 Integration : `tests/integration/`, `npm run test:integration`
  - les tests DOM (modules + page jsdom) ;
  - un lot contre la VRAIE base (API de gestion, jeton `.env.local`), chaque cas dans
    une transaction annulee, rien d'ecrit : signal sans compte refuse (014),
    connecte accepte, 21e signal / heure refuse, compte bloque refuse, purge,
    fonctions admin inaccessibles par l'API, correction dans l'heure (011 / 012),
    droits par colonne (013), garde is_demo (010), vues lisibles en anonyme,
    ecriture directe dans availability_signals refusee. Sans jeton : lot saute,
    avec un message.
- [x] T7-US3 Fonctionnels : `tests/functional/`, `npm run test:functional`, les
  scenarios navigateur a serveur simule, ranges par domaine (fiche, notifications,
  navigation, onboarding, politique d'auth, accessibilite, donnees) avec les user
  stories couvertes en tete de chaque fichier ; aides partagees dans `helpers.js`.
- [x] T7-US4 E2E : `tests/e2e/`, `npm run test:e2e`, sans aucune simulation, sur le
  site en ligne : parcours visiteur (carte, fiche, lecture seule, encadre de
  connexion, signal refuse par la vraie base).
- [x] T7-US4b E2E connecte (debloque le 2026-09-25, option 1 de Stephane) : un vrai compte de test signale « Fonctionne »
  sur une fiche de demo, verifie l'affichage, puis ses signaux sont purges.
  Livre : compte `e2e@distrimatch.test` (migration 015, sans mot de passe, marque
  app_metadata.e2e), session ouverte en base pour CE compte puis echangee aupres du
  vrai serveur d'auth (tests/e2e/session.mjs) ; 3 tests (controles visibles, signal
  machine, signal produit) verifies en base ; purge des signaux et des sessions a la
  fin, verifiee.
- [x] T7-US5 `npm run test:all` enchaine les quatre niveaux ; CLAUDE.md explique
  quand lancer quoi ; le skill `/auto` suit les nouveaux chemins.

### EPIC-T6 Des signaux proteges contre l'abus (Stephane, 2026-09-25)
Crainte de Stephane : « des personnes mettent des signaux juste pour s'amuser ».
Trou constate : l'app reserve les boutons aux connectes (EPIC-T5) mais la base
accepte encore les signaux anonymes, et la limite par telephone se contourne (le
telephone fabrique lui-meme son identifiant). La barriere doit etre dans la base.
Les 4 points recommandes ont ete valides par Stephane le 2026-09-25, livres le meme jour (migration 014 executee).

- [x] T6-US1 La base exige un compte pour signaler
  - Acceptance : migration `014_signals_require_account.sql` : `confirm_availability`
    refuse un appel sans compte (code 28000, « Connexion requise ») ; source toujours
    `user`, poids 0.8 ; verifie en role simule (anon refuse, connecte accepte).
    Les donnees de demo (inserees directement) ne sont pas concernees.

- [x] T6-US2 Limite par compte, plus par telephone
  - Acceptance : 20 signaux par heure et par compte (au-dela, P0001 « Trop de
    signaux ») ; anti-doublon (meme etat, meme produit ou machine, dans l'heure) par
    compte ; message « Trop de signaux depuis ce compte, réessaie dans une heure ».

- [x] T6-US3 Pouvoir effacer un tricheur
  - Acceptance : table `signal_bans` (compte bloque, raison, date) ; un compte bloque
    est refuse (42501, « Ce compte ne peut plus envoyer de signaux ») ; fonction
    `purge_user_signals(user_id, bloquer)` reservee a l'admin (SQL, jamais l'API) :
    supprime tous les signaux du compte et le bloque ; requete documentee pour
    reperer les comptes les plus actifs ; teste en transaction annulee.

- [x] T6-US4 Plus de renvoi sans compte : renouveler la session
  - Acceptance : le renvoi anonyme d'EPIC-T3 est retire ; si un envoi echoue hors
    refus metier, l'app renouvelle la session et renvoie une fois ; si ca echoue
    encore, « Ta session a expiré : reconnecte-toi » et la connexion s'ouvre ;
    e2e (echec puis succes apres renouvellement ; echec persistant -> message).

### EPIC-T5 Fiche claire : lire pour tous, informer quand on est connecte (Stephane, 2026-09-25)
Objectif (Stephane) : « une interface claire, simple, facile a apprehender, ou un
utilisateur sait ce qu'il y a, si la machine marche, et la possibilite
d'informer / modifier pour celui qui s'est connecte. Un connecte a des privileges. »
Constat : la puce d'etat repete le bandeau (« Pas d'info » deux fois).
Decision Stephane 2026-09-25 : informer (etat machine, dispo produit) devient un
privilege de compte, comme modifier. Cela leve l'exception UC11 cote interface ;
la RPC reste ouverte a l'anonyme (renvoi EPIC-T3, reversible en une ligne).
Reformulation validee le 2026-09-25, livre le meme jour (migration 013 executee).

- [x] T5-US1 Le bandeau dit si la machine marche, la liste dit ce qu'il y a
  - Acceptance : plus de puce d'etat ; le bandeau affiche en grand l'etat de la
    machine (« Fonctionne », « Vide », « En panne », « Pas d'info ») et sa
    provenance ; le compte « N sur M dispo » passe dans le titre « Il reste quoi ? » ;
    aucune information affichee deux fois.

- [x] T5-US2 Informer et modifier : privileges de compte
  - En tant que connecte, je vois les trois boutons d'etat de la machine
    (« Fonctionne / Vide / En panne », toujours visibles, l'etat actuel colore, un tap
    envoie), les lignes produit touchables (« Il y en a / Plus rien »), Photo et
    Modifier. En tant que visiteur, je lis tout, sans aucun de ces controles, et je
    vois « Tu es devant ? Connecte-toi pour informer » avec un bouton de connexion.
  - Acceptance : bascule sans recharger a la connexion / deconnexion ; QR
    `&confirm=1` : connecte -> liste mise en avant, visiteur -> encadre de connexion
    mis en avant ; e2e visiteur et connecte ; CLAUDE.md (UC11) mis a jour.

- [x] T5-US3 Un connecte ne deplace ni ne renomme une fiche par l'API
  - Constat : la regle RLS laisse tout compte connecte modifier toutes les colonnes
    d'une fiche (nom, adresse, position) ; l'app n'edite que le niveau de prix.
  - Acceptance : migration `013_distributor_update_columns.sql` : UPDATE sur
    `distributors` limite a `price_range` pour `authenticated` (droits par colonne),
    rien pour `anon` ; verifie en role simule (prix OK, nom refuse) ; les produits
    restent modifiables par tout compte connecte.

### EPIC-T4 Fiche inspiree de l'app EuroMillions, en clair (Stephane, 2026-09-25)
Objectif : une fiche qui se lit comme l'ecran de jeu FDJ (capture fournie) : un
bandeau colore avec l'info cle en tres grand, des pastilles, des tuiles franches,
une consigne aux mots-cles colores, de grosses cibles contrastees. Theme clair
retenu par Stephane (lisible au soleil, coherent avec la carte). Hors perimetre :
carte, panneau lateral, autres pages. Reformulation validee le 2026-09-25, livre le meme jour.

- [x] T4-US1 Bandeau d'etat en tete de fiche
  - En tant que client, je veux voir en haut de la fiche, en tres grand, si ca vaut
    le deplacement, afin de decider en une seconde.
  - Acceptance : le bandeau prend la couleur de l'etat de la machine (vert
    Fonctionne, orange Vide, rouge En panne, ardoise Pas d'info) ; il contient le
    nom (+ tag Demo), la puce d'etat touchable a droite, l'info cle en tres grand
    (« 3 sur 5 dispo », ou l'etat de la machine si elle n'a pas de produit, ou
    « Pas d'info ») et la ligne de provenance ; texte blanc >= 4,5:1 sur chaque
    couleur ; s'il y a une photo, elle passe en fond assombri du bandeau et la
    galerie complete va dans l'onglet « À propos » ; plus de bandeau emoji.
  - TS : `describeFicheHero(machine, productStatuses)` pure (utils.js).

- [x] T4-US2 Onglets en pastilles, tuiles d'action franches
  - Acceptance : Produits / Avis / À propos en pastilles, l'active remplie ; les
    tuiles Itinéraire, Favori, Modifier, Photo, Partager : icone plus grande, coins
    plus ronds, contour plus marque ; cibles >= 44 px ; rien ne deborde en 390 px.

- [x] T4-US3 Consigne coloree, lignes produit contrastees
  - Acceptance : « Touche un produit : Il y en a ou Plus rien », « Il y en a » en
    vert et « Plus rien » en rouge ; lignes produit sur fond blanc bordees, statut en
    grosse pastille en majuscules (« DISPO », « PAS DISPO », « PAS D'INFO ») ;
    contrastes >= 4,5:1 (section 21 des e2e) ; captures iPhone avant / apres.

### EPIC-T3 Un signal part toujours, meme connecte (Stephane, 2026-09-25)
Constat terrain : « Fonctionne » sur Gaztainbidea -> « Signal non envoyé ». En
navigation privee (sans compte) les memes signaux passent. La base accepte le signal
en anonyme comme connecte (verifie) : c'est l'envoi avec la session du telephone
Android qui echoue, pour une raison que le message generique ne dit pas.
Correctif valide par Stephane le 2026-09-25, livre le meme jour.

- [x] T3-US1 Renvoi anonyme si l'envoi echoue (remplace par T6-US4 : renouvellement de session)
  - En tant que client connecte devant une machine, je veux que mon signal parte
    meme si ma session pose probleme, afin de ne jamais etre bloque (UC11 n'exige
    pas de compte).
  - Acceptance : si l'appel a `confirm_availability` echoue pour une raison autre
    qu'un refus metier (trop de signaux, donnees invalides, machine inconnue), il est
    renvoye une fois par un client anonyme sans session ; succes -> meme parcours
    qu'un envoi normal (toast « Merci », ligne / puce mises a jour) ; e2e : 1er appel
    en 401, 2e en 200 -> « Merci » ; refus « trop de signaux » -> pas de renvoi.

- [x] T3-US2 Un message d'erreur qui dit la raison
  - En tant que testeur, je veux lire pourquoi un signal n'est pas parti, afin de
    pouvoir le signaler precisement.
  - Acceptance : « Trop de signaux depuis ce téléphone, réessaie dans une heure »
    (P0001), « Pas de réseau : signal non envoyé » (hors ligne), « Machine inconnue
    du serveur » (P0002), sinon « Signal non envoyé, réessaie plus tard (code X) »
    avec le code HTTP ou Postgres ; `describeSignalError` pure, testee.

### EPIC-T2 La fiche repond en un coup d'oeil : dispo ou pas (Stephane, 2026-09-25)
Objectif : sur la fiche, savoir tout de suite si chaque aliment est dispo et si la
machine marche, et le signaler la ou on regarde. Valeur : plus de vocabulaire a
decoder (« Au catalogue », « Vu dispo », bandeau, fenetre a part) ; un geste par info.
Reformulation validee par Stephane le 2026-09-25 (plan « Fiche distributeur : dispo ou
pas, et on le dit sur le produit »). Livre le 2026-09-25 (migration 012 executee).

- [x] T2-US1 Statut produit : Dispo / Pas dispo / Pas d'info
  - En tant que client, je veux lire en face de chaque aliment s'il est dispo ou pas,
    afin de savoir si le deplacement vaut le coup.
  - Constat : « Au catalogue », « Vu dispo », « Vu absent », « Indisponible » : quatre
    mots, aucun ne repond a la question.
  - Acceptance : trois libelles seulement (« Dispo », « Pas dispo », « Pas d'info ») ;
    couleur vive si le signal a moins de 2 h, grisee de 2 h a 24 h (meme mot), « Pas
    d'info » au-dela ou sans signal ; l'age est ecrit sous le nom (« vu il y a 12 min ») ;
    machine signalee vide / en panne plus recemment que le dernier « vu dispo » ->
    « Pas dispo » avec « machine vide » / « machine en panne » ; produit « Non disponible »
    -> « Pas dispo » sans age. Le mot « catalogue » n'apparait plus en lecture.
  - TS : `resolveProductStatus(product, signalRow, machineStatus, now)` pure (utils.js)
    remplace `resolveAvailabilityBadge`.

- [x] T2-US2 Signaler sur l'aliment
  - En tant que client devant la machine, je veux toucher un aliment pour dire s'il en
    reste, afin de ne pas chercher une fenetre a part.
  - Acceptance : toucher un produit deplie « ✓ Il y en a » / « ✗ Plus rien » (cibles
    >= 44 px) ; un tap envoie (anonyme, UC11), la ligne se replie et passe en « Dispo,
    a l'instant » ; on peut se corriger juste apres ; la section s'appelle « Il reste
    quoi ? » avec la consigne « Touche un produit pour dire s'il en reste » ; le gros
    bouton rouge et la fenetre « Il reste quoi ? » disparaissent ; QR `&confirm=1` :
    fiche ouverte sur la liste, consigne mise en avant ; son propre signal ne notifie
    pas ; `signal_envoye` logge une fois par ouverture de fiche.
  - TS : migration `012_product_dedup_by_state.sql` (anti-doublon produit par etat,
    comme 011 pour la machine), executee par Claude.

- [x] T2-US3 Etat du distributeur a droite du nom
  - En tant que client, je veux voir d'un coup d'oeil si la machine fonctionne, est
    vide ou en panne, et pouvoir le dire, afin de ne pas me deplacer pour rien.
  - Acceptance : puce a droite du nom « Fonctionne » / « Vide » / « En panne » / « Pas
    d'info », avec ▾, touchable : elle deplie « Fonctionne / Vide / En panne », un tap
    envoie ; une seule ligne sous le nom dit d'ou vient le statut (« Signalée vide il y
    a 34 min », « Vue en marche il y a 12 min », sinon « Vérifié il y a X » ou « Pas
    encore vérifié ») et remplace l'ancien bandeau ; « Fonctionne » est deduit d'un
    produit vu dispo recemment sans signal vide / panne plus recent. Nom long : la puce
    reste a droite, rien ne deborde en 390 px.
  - TS : `resolveMachineStatus(statusRow, productRows, lastVerified, now)` pure.

- [x] T2-US4 Mode Modifier : bouton de produit et liste vide
  - En tant que contributeur, je veux marquer un produit disponible ou non en edition,
    et pouvoir ajouter des produits a une machine qui n'en a pas.
  - Acceptance : bouton « Disponible » / « Non disponible » (correction Stephane
    2026-09-25 : « Vendu ici / Plus vendu » refuse) ; liste vide en lecture : « Aucun produit référencé » + bouton
    « Ajouter les produits » (connexion exigee, UC2).

### EPIC-T1 Retour terrain Gaztainbidea (test de Stephane, 2026-09-25)
Objectif : que le parcours reel devant une machine marche sans accroc, du scan a la
notification. Valeur : un testeur terrain peut completer une fiche vide, dire que la
machine marche, naviguer librement et faire confiance a son centre de notifications.
Reformulation validee par Stephane le 2026-09-25. Livre le 2026-09-25 (migration 011 executee).

- [x] T1-US1 Ajouter des produits depuis n'importe quelle fiche
  - En tant que contributeur connecte devant une machine sans produits, je veux pouvoir
    les ajouter depuis la fiche, afin que les suivants sachent ce qu'elle vend.
  - Constat : le stylo « Modifier » n'apparait que si la fiche est ouverte depuis
    l'onglet Favoris (`canEdit`).
  - Acceptance : « Modifier » visible sur toute fiche (carte, liste, recherche, deep link,
    notification) ; connexion toujours exigee (UC2, `showEditAuthGate`) ; dans « Il reste
    quoi ? », une fiche sans produit propose « Ajouter les produits », qui ferme le
    panneau et ouvre la fiche en edition.

- [x] T1-US2 Signaler « Ça fonctionne »
  - En tant que client devant une machine, je veux dire en un tap qu'elle fonctionne,
    afin d'effacer un vieux « vide / en panne » et de rassurer les suivants.
  - Acceptance : 3e bouton machine « Ça fonctionne », exclusif avec « Machine vide » et
    « En panne », anonyme (UC11) ; le bandeau vide / panne de la fiche disparait des
    qu'un « fonctionne » plus recent existe ; un favori vide ou en panne qui recoit
    « fonctionne » notifie « … fonctionne de nouveau ».
  - TS : migration `supabase/011_machine_working.sql` (contrainte `availability_signals_scope`
    et RPC `confirm_availability` acceptent `working`), executee par Claude ; KPI et
    vues inchangees (`distributor_status` renvoie deja le dernier etat).

- [x] T1-US3 Le burger marche depuis toutes les pages
  - En tant qu'utilisateur sur Notifications, Favoris, Activite ou Compte, je veux que le
    burger ouvre la liste des machines, afin de ne jamais etre bloque.
  - Constat : la liste (z-index 50) s'ouvre sous la page (z-index 150).
  - Acceptance : depuis chacune de ces pages, le burger ferme la page, revient a la
    carte et ouvre la liste, visible et cliquable ; e2e sur les 4 pages.

- [x] T1-US4 Une notification, une seule fois, et la bonne qui s'efface
  - En tant qu'abonne, je veux recevoir chaque changement une seule fois et pouvoir
    supprimer exactement la ligne choisie, afin de faire confiance au centre.
  - Causes : (a) l'app notifie son propre signal ; (b) la liste ouverte ne se
    rafraichit pas a l'arrivee d'une notification, la suppression par index retire
    alors la mauvaise ligne.
  - Acceptance : envoyer un signal sur un favori ne notifie pas son auteur (l'etat vu est
    mis a jour a l'envoi) ; la page Notifications ouverte se met a jour en direct ; la
    suppression cible la ligne cliquee (identifiant stable, plus d'index) ; e2e qui
    reproduisent les deux cas avant correction.

- [x] T1-US5 Géolocalisation obligatoire
  - Decision Stephane : pas de carte sans geolocalisation (annule le « Voir la carte sans
    me localiser » d'UX-02, PR #112).
  - Acceptance : le bouton est retire ; en cas de refus, l'ecran reste avec les
    instructions et un bouton « Réessayer » ; un scan QR ouvre toujours la fiche
    directement, mais la fermer ramene l'ecran de geolocalisation ; e2e 1bis / 22 / 30
    adaptes.

## Priorite normale

<!-- Lot 3 a11y/UX (audit Nielsen/WCAG du 2026-06-05) ENTIEREMENT LIVRE le
     2026-09-15 : cibles tactiles 44 px (PR #95), contraste texte secondaire
     (PR #96), modale de confirmation maison (PR #97). Backlog /auto vide :
     les prochains items viennent de "Chantiers strategie", a cadrer avec
     Stephane (import OSM en premier). -->

<!-- Audit UX mobile du 2026-09-18 : les 7 finitions P2 sont livrees (PR #116 a #122). -->


## Chantiers strategie (a cadrer avec Stephane avant passage en priorite)

<!-- Section NON lue par /auto (ni "Priorite haute" ni "Priorite normale").
     Ordre = docs/STRATEGIE.md. Un chantier qui exige une migration Supabase le dit :
     la migration s'execute a la main dans le dashboard AVANT le ticket front. -->

- [x] Chantier 2, partie migration : `supabase/007_availability_signals.sql` ecrite
  (PR #90) et EXECUTEE par Stephane le 2026-09-15, verifiee en anonyme (RPC
  inserted/skipped, insert direct 42501, gardes 22023/P0002, vues, `last_verified`).
  UC11 dans `CLAUDE.md` (PR #90). La partie front est en Priorite haute.

<!-- Ecrit le 2026-09-18 a partir des decisions de l'audit UX et du chantier 4 : user
     stories (valeur utilisateur + acceptance) doublees de technical stories (SQL, flag,
     import) quand il en faut. Chaque story porte une ligne « Decision Stephane » : une
     fois tranchee, elle monte en Priorite haute telle quelle, ses criteres sont deja
     ecrits pour /auto. -->

- [ ] US-1 Des avis realistes dans la maquette (correction Stephane 2026-09-18 : on ne
  masque rien, la maquette doit etre realiste)
  - En tant que visiteur d'une fiche de demo, je veux voir des avis coherents avec la note
    et le compteur affiches (« 4.8 ★★★★½ (89) » -> 89 avis lisibles, datés, signés),
    afin que la maquette ressemble a une vraie app et que l'onglet « Avis » ne soit
    jamais un cul-de-sac.
  - Constat (audit UX-14) : l'en-tete annonce N avis, l'onglet dit « Aucun avis pour le
    moment ». Le probleme n'est pas la note, c'est l'incoherence. Le seed porte 2 635 avis
    au total (0 a 234 par fiche, note moyenne 4,58) et aucun texte derriere.
  - Decision Stephane : les avis existent pour de vrai, generes comme le reste de la demo
    et identifiables (fiche is_demo). Rien de masque.
  - Acceptance : chaque fiche demo a exactement `review_count` avis en base, de note
    moyenne egale a `rating` (+/- 0,1) ; l'onglet « Avis » liste les avis du plus recent
    au plus ancien (prenom + initiale, etoiles, « il y a X », texte court en francais
    adapte au type de machine : pain, pizza, legumes...), 10 par page avec « Voir plus » ;
    l'en-tete (note, compteur) est calcule depuis les avis reels, plus depuis les
    colonnes `rating` / `review_count` du seed ; une fiche sans avis (Gaztainbidea, une
    fiche ajoutee) affiche « Pas encore d'avis » et l'onglet reste honnete ; le panneau
    lateral suit ; sections 14 et 21 des e2e vertes ; aucun avis genere sur une fiche
    reelle ; purge = les avis des fiches demo partent avec `DELETE ... WHERE is_demo`.
  - Hors perimetre (story a part, plus tard) : « Laisser un avis » par un vrai
    utilisateur (contribution publique -> auth requise, UC4), moderation.
  - TS-1a Migration `supabase/011_reviews.sql` : table `reviews` (id, distributor_id FK
    ON DELETE CASCADE, author_name TEXT, rating SMALLINT 1..5, body TEXT, device_hash
    TEXT, created_at) ; RLS lecture publique, aucune ecriture par l'API pour l'instant ;
    vue `distributor_ratings` (distributor_id, avis, note moyenne) lisible en anonyme ;
    fonction `seed_demo_reviews()` reservee au SQL Editor (comme 009) : pour chaque
    fiche `is_demo`, genere `review_count` avis marques `device_hash 'demo-…'`, notes
    tirees autour de `rating`, dates etalees sur 18 mois, textes par type de machine
    (banque de ~15 phrases par type, combinees) ; `purge_demo_data()` les supprime aussi.
    Executee par Claude via `scripts/supabase-sql.mjs`.
  - TS-1b Front : `js/reviews.js` (chargement fire-and-forget des avis de la fiche
    ouverte, rendu pagine dans l'onglet, `describeReviews` pure pour l'en-tete) ;
    `mapDistributorRow` lit la vue `distributor_ratings` (jointure dans le select) ;
    `renderSidePanelItem` et l'en-tete de fiche utilisent ces valeurs ; e2e avec
    `page.route` sur `**/rest/v1/reviews*` (liste, pagination, fiche sans avis) ; tests
    unit sur la moyenne et l'arrondi. Import map bumpee.

- [ ] US-2 Une demo toujours vivante
  - En tant que Stephane qui montre l'app (elus, producteurs, testeurs), je veux que la
    demo ait toujours des signaux des dernieres heures, afin que badges verts, rythmes,
    bandeaux « Signalée vide » et KPI ressemblent a un pilote actif et non a une app
    abandonnee.
  - Constat : le seed du 2026-09-16 vieillit d'un jour par jour ; le 2026-09-18 toutes
    les fiches disent « il y a 2 j » et le KPI 24 h affiche 0 % (audit UX-23).
  - Note 2026-09-18 : depuis 010, le job ne touche que les fiches is_demo (US-3).
  - Decision Stephane : regeneration nocturne automatique (recommande) ou relance
    manuelle de `select seed_demo_signals();` avant chaque demo ?
  - Acceptance : le lendemain de l'activation, `kpi_coverage.machines_signal_24h >= 20`
    et la fiche dist-002 affiche « Vérifié il y a X min/h » ; le job apparait dans
    `cron.job` ; il est desactive et les lignes `demo-` purgees avant l'ouverture du
    vrai pilote.
  - TS-2 (SQL Editor, par Stephane, aucun code) :
    1. Dashboard > Database > Extensions > activer `pg_cron`.
    2. `select cron.schedule('demo-reseed', '15 3 * * *', $$select purge_demo_data(); select seed_demo_signals();$$);`
    3. Verifier : `select jobid, schedule, command from cron.job;`
    4. Le jour J du pilote : `select cron.unschedule('demo-reseed'); select purge_demo_data();`
    Les deux fonctions sont SECURITY DEFINER et revoquees pour anon / authenticated : le
    cron tourne avec le role du dashboard, rien n'est expose.

- [x] US-3 Des fiches fictives identifiees, pas supprimees (decision Stephane 2026-09-18) :
  LIVREE le 2026-09-18 (PR #125 front + tests, migration 010 executee par Claude via
  `scripts/supabase-sql.mjs`, demo regeneree : 29 fiches demo / 1 reelle, garde verifiee
  en UPDATE et en INSERT, tags visibles en prod mobile).
  - En tant que Stephane, je veux garder un jeu de donnees factice tout en sachant, ligne
    par ligne dans la base, ce qui est vrai et ce qui ne l'est pas, afin de faire des
    demos sans jamais polluer une vraie machine ni tromper un visiteur.
  - Decision : on ne supprime rien ; une colonne `distributors.is_demo` marque les fiches
    fictives (les 25 du seed + `user-1776099988510` « Test Supabase Biarritz »,
    `user-1776101171767` « Boulangerie Test Photo », `user-1777220392357` « Glacon »,
    `user-1780130564104` « Tic Tac »). `user-1776102020333` « Gaztainbidea » reste reelle
    (adresse a completer un jour). Convention : fiche fictive = `is_demo` (enfants par
    FK) ; signal / evenement fictif = `device_hash LIKE 'demo-%'`, uniquement sur des
    fiches `is_demo`.
  - Acceptance : 29 fiches `is_demo`, 1 reelle ; l'API ne peut ni poser ni changer
    `is_demo` (trigger) ; `seed_demo_signals()` ne touche que les fiches demo et
    `purge_demo_data()` ne restaure qu'elles ; la pollution deja faite sur Gaztainbidea
    est reparee ; tag « Démo » dans le panneau, la fiche (a cote du nom) et « À propos »,
    « dont N de démo » au tableau de bord ; aucun tag sans la colonne (migration pas
    encore passee) ; sections 14 et 21 des e2e vertes.
  - TS-3 : front + tests + doc livres (PR is_demo) ; Stephane colle
    `supabase/010_is_demo.sql` dans le SQL Editor puis `select seed_demo_signals();`
    (retour attendu : `"fiches_demo": 29`). Purge du jour J documentee en tete de 010.

- [x] US-4a Chat inactif, favoris qui notifient (decision Stephane 2026-09-20, livre
  2026-09-21)
  - En tant qu'habitue, je mets une machine en favori et je suis prevenu dans mon centre
    de notifications quand elle change (vide, en panne, de nouveau pleine, produit suivi
    vu dispo), afin de ne pas me deplacer pour rien. Le chatbot n'apporte rien
    aujourd'hui : il reste inactif.
  - Livre : `FEATURES.chat = false` (js/config.js, code conserve, reversible) ; plus
    aucune conversation creee (favori, bienvenue, proactif), « Discuter » absent de la
    fiche, recherche / notification / bandeau ouvrent la fiche ; `js/favorites-watch.js`
    (ouverture, retour d'onglet, toutes les 5 min) lit `distributor_status` et
    `product_availability` pour les favoris et notifie les changements
    (`diffFavoriteSignals`, premier passage muet, cooldown 1 h sans perte, heures
    calmes) ; centre de notifications : ligne cliquable -> fiche, icone par type,
    horodatage = celui du signal ; `followedProducts` enfin branche.
  - Hors perimetre, a garder pour le chantier 5 : notification app fermee (Web Push +
    Realtime), reglage par type d'evenement, par machine.

- [ ] US-4b Chantier 3 (suite) : ni points ni niveaux
  - En tant que visiteur, je ne veux ni points ni niveaux, afin que chaque element de
    l'ecran serve a trouver une machine pleine et a le dire aux suivants.
  - Constat (audit UX-17) : Profil « Explorateur / 0 points », Activite « +10 pts » et
    enum brut « Signalement empty ».
  - Decision Stephane : masquer derriere `FEATURES.gamification` (recommande : meme
    mecanique que le chat, reversible) ou supprimer ? Et l'onglet Activite : le garder
    comme journal des signaux (vides / pannes / rapports) sans points, ou le retirer de
    la bottom nav ?
  - Acceptance (flag) : `FEATURES.gamification = false` -> Profil sans points / niveau /
    progression (restent : favoris, contributions), Activite sans « +N pts », vue Compte
    inchangee ; libelles de signalement traduits (`empty` -> « Vide », `broken` -> « En
    panne », `out_of_stock` -> « Rupture de stock »). Tests e2e de la section 7 (profil)
    conditionnes au flag ; CLAUDE.md (module activity) mis a jour.
  - TS-4 : meme objet `FEATURES` que le chat ; `updateImplicitProfile` et
    `addActivityItem` restent (donnees locales), seul l'affichage change.

- [ ] US-5 (epic) Chantier 4 : toutes les machines connues, partout
  - En tant que visiteur hors Cote Basque, je veux voir des la premiere ouverture les
    distributeurs automatiques connus d'OpenStreetMap autour de moi, afin que l'app serve
    ailleurs sans attendre une saisie manuelle.
  - En tant que Stephane, je veux que le pilote demarre avec les 32 machines OSM de la
    zone plutot que 25 fiches inventees, afin que les stickers QR pointent vers de
    vraies machines.
  - Cadrage a trancher avec Stephane AVANT tout ticket :
    (1) zone d'import : Cote Basque seule, departement 64, ou France entiere (~9 000
    machines `vending=pizza|bread|food` ; cout Overpass, taille de table, temps de
    chargement) ;
    (2) sort du seed : les fiches fictives sont marquees `is_demo` (US-3), la purge tient
    en une ligne (`DELETE FROM distributors WHERE is_demo`, cf. 010) : a l'import, ou
    plus tard, au choix ;
    (3) frequence : import unique par script, ou rafraichissement hebdo (nouvelles
    machines, suppressions) ;
    (4) fiche minimale sans photo ni produit : « Distributeur de pizzas » + rue OSM
    (`addr:*`) sinon « près de <ville> », et une invitation au premier signal.
  - Acceptance de l'epic : chaque machine OSM a une fiche (`id = osm-<node|way>-<id>`,
    `source = 'osm'`, `lat` / `lng`, `type` mappe, `tz` calcule, `last_verified = null`
    -> « Pas encore vérifié ») ; attribution « © OpenStreetMap contributors » (ODbL)
    visible dans « À propos » et sur la carte ; aucune coordonnee ni nom de zone en dur
    dans le code ; tri, panneau et KPI fonctionnent avec N machines ; import rejouable
    sans doublon.
  - TS-5a Import Overpass -> SQL : script Node `scripts/import-osm.mjs` (execute par
    Claude, pas de terminal pour Stephane) qui interroge Overpass
    (`amenity=vending_machine` + `vending~"pizza|bread|food|milk|cheese|eggs|vegetables|
    meat|ice|farm_products"`) sur une zone donnee, mappe `vending` -> `type` (pizza ->
    pizza, bread -> bakery, food -> meals, milk -> dairy, cheese -> cheese, eggs /
    vegetables / farm_products -> agricultural, meat -> meat, ice -> ice, autres ->
    general), calcule `tz` (lib tz-lookup), dedoublonne a 50 m avec les fiches
    existantes, et ecrit `supabase/010_osm_import_<date>.sql` (upsert idempotent) que
    Stephane colle dans le SQL Editor. Tests unit sur le mapping et la dedup.
  - TS-5b Migration `010` : colonnes `source TEXT` (seed | osm | user) et `osm_id BIGINT`
    sur `distributors`, index sur `osm_id` ; vues KPI inchangees.
  - TS-5c Front : mention ODbL (« À propos » + attribution Leaflet), fiche minimale
    (point (4)), chips inchangees (`agricultural` existe deja).
  - TS-5d Stickers QR (suite logique) : generation d'une planche PDF par machine
    (`?id=osm-…&confirm=1&src=qr`), a cadrer apres l'import.

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
- [x] 2026-09-18 UX-01 Toasts visibles partout : --z-toast 12000 (au-dessus des modales), conteneur au-dessus de la bottom nav (--bottom-nav-h + safe-area, pilule desktop), erreur d'envoi en ligne dans la modale de signal (#availability-error), +3 e2e (PR #109, commit 6a53a77)
- [x] 2026-09-18 UX-03 Liste via le hamburger : le panneau s'ouvre avec la liste du filtre courant, premier groupe de distance deplie, second tap ferme ; +2 e2e, test 3ter adapte ; import map v39 (PR #110, commit d981f71)
- [x] 2026-09-18 UX-07/08 Contraste et tailles : tokens --primary-text #D62828 et --success-dark #4E7A33 (>= 4,5:1) pour le texte rouge/vert et les fonds a texte blanc, vert fraicheur #15803d, polices nav 12 px / indices 13 px / panneau 12 px ; +2 unit, +1 e2e (section 21, mesure des styles calcules en 390 px) ; 5 CSS bumpes (PR #111, commit 6b2c69e)
- [x] 2026-09-18 UX-02 Entrer sans geolocalisation : lien « Voir la carte sans me localiser », carte centree sur la fiche du deep link ou sur le centre des distributeurs (centroidOf, aucune coordonnee en dur), panneau trie par nom avec rappel, fermer une fiche deep link ne reaffiche plus le mur ; +2 unit +2 e2e, overlays v30, import map v40 (PR #112, commit 8066c24)
- [x] 2026-09-18 UX-04 Bouton retour : js/history.js (pushLayer / popstate / popLayer), couches fiche, panneau, modale de signal, chat, confirmation, vues ; +4 e2e ; import map v41 (PR #113, commit 57f3e21)
- [x] 2026-09-18 UX-05/13 Fiche : fraicheur sous le nom (sa propre ligne, plus de separateur orphelin), rythme, bandeau, puis note / type / prix ; hero sans photo 120 px emoji seul ; « Il reste quoi ? » en CTA primaire pleine largeur au-dessus des actions secondaires ; +1 e2e ; overlays v31, import map v42 (PR #114, commit 5bdd138)
- [x] 2026-09-18 Fiche : badge produit aligne sur le dernier signal frais (resolveAvailabilityBadge : Vu dispo / Vu absent, sinon Au catalogue ou Indisponible), bordure de l'item alignee ; +3 unit +1 e2e ; panels v33, import map v43 (PR #116, commit 85e0eff)
- [x] 2026-09-18 UX-09 Modale de signal : croix de la fiche masquee tant que la modale est active, « Pas regardé » neutre par defaut (is-default, aria-pressed=false) ; +1 e2e ; overlays v32, panels v34, import map v44 (PR #117, commit 52a3a68)
- [x] 2026-09-18 UX-11/12 Filtres et panneau : fondu de defilement des chips, bouton « Tous » en tete du panneau filtre, compte dans le titre (plus de toast), tranches vides masquees ; +1 e2e, 3ter adapte ; map v27, overlays v33, import map v45 (PR #118, commit b25daa3)
- [x] 2026-09-18 UX-16 Accents des libelles UI : passe d'accentuation sur index.html (texte, attributs visibles) et les chaines JS hors commentaires ; +2 unit, attentes e2e alignees ; import map v46 (PR #119, commit 5cbc990)
- [x] 2026-09-18 UX-18/19 Favori et menu avatar : libelle « Favori » constant + aria-pressed, toasts et compteur en « favoris », icones coeur, items du menu avatar >= 44 px ; +2 e2e ; panels v35, import map v47 (PR #120, commit 84ccc61)
- [x] 2026-09-18 UX-20/21 Vues cachees et chat ferme inertes (attribut inert, JS + HTML), focus-trap avec second essai, controles en police du site (font: inherit) ; +2 e2e ; base v31, import map v48 (PR #121, commit df3ef1c)
- [x] 2026-09-18 UX-15 Ecran d'accueil : « Sache avant d'y aller », 3 benefices (fraicheur horodatee, signal en un tap, rythme appris), title / meta / manifest sans territoire ; +1 unit +1 e2e (PR #122, commit 9c7dba9)
