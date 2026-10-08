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

### EPIC-T26 Confort au doigt sur mobile (retour d'un developpeur testeur, Stephane, 2026-10-08)
Objectif : une carte et une fiche qui se manipulent sans erreur a une main sur telephone.
Valeur : plus de mauvais toucher, plus de « fermer, dezoomer, retoucher » ; la carte reste
le centre de l'app. Ordre : US1 et US2, puis US3 et US4, puis US5 ; une PR par point,
essai par Stephane sur son telephone avant chaque fusion.

- [x] T26-US1 En tant qu'utilisateur, quand des pastilles se chevauchent sous mon doigt, je
  choisis celle que je veux
  - Acceptance : toucher une pastille qui en chevauche d'autres ouvre un petit menu
    « N distributeurs ici » (emoji, nom, etat · stock) ; un choix ouvre sa fiche ; une
    pastille isolee ouvre sa fiche directement comme avant ; rayon plus large au doigt
    qu'a la souris ; toucher une pastille ne fait plus dezoomer la carte.
- [x] T26-US2 En tant qu'utilisateur sur telephone, la fiche ne cache pas toute la carte
  - Acceptance : la fiche s'ouvre a mi-hauteur (feuille du bas), la carte visible au-dessus
    avec la pastille choisie mise en avant ; tirer vers le haut = plein ecran, vers le bas
    = fermer (et une voie en un toucher pour chaque, WCAG 2.5.1) ; toucher une autre
    pastille ouvre sa fiche sans rien fermer ; ordinateur inchange.
- [x] T26-US3 En tant qu'utilisateur, la recherche et les notifications ne se superposent plus
  - Acceptance : un seul ecran a la fois (ouvrir l'un ferme l'autre) ; champ de recherche
    jamais coupe ; recherche vide = suggestions (distributeurs proches, types) au lieu
    d'une page blanche ; zones de toucher des icones du haut >= 44 px ; « Ajoute un
    distributeur a tes favoris » (plus « machine ») dans les notifications vides.
- [x] T26-US4 En tant qu'utilisateur, le titre de groupe de la liste reste en place
  - Acceptance : « Plus loin · plus de 5 km » (et les autres titres de groupe) reste fixe
    en haut de la liste en defilant, sur toute la largeur, opaque, sans saut, sur iPhone.
- [x] T26-US5 En tant qu'utilisateur, je zoome d'un seul doigt
  - Acceptance : double toucher + doigt maintenu + glisser = zoom continu centre sous le
    doigt (vers le bas = zoom avant, comme Google Maps) ; double toucher simple, pincement
    et boutons + / - inchanges.
- [ ] T26-US6 En tant qu'utilisateur, « Voir sur la carte » depuis Favoris (ou une autre
  page) me ramene sur la carte
  - Acceptance : l'epingle de la fiche ferme la fiche, la liste ET la page ouverte
    (Favoris, Notifications, Activite...) puis centre la carte sur la pastille qui pulse.
- [ ] T26-US7 En tant qu'utilisateur sur telephone, la fiche a trois positions comme Google Maps
  - Acceptance : plein ecran / mi-hauteur (ouverture) / reduite en bas (nom + etat, la
    carte utilisable) ; on la tire depuis la poignee ou le haut de la fiche, elle suit le
    doigt et se pose sur la position la plus proche (avec l'elan) ; glisser sous la
    position reduite = fermer ; toucher la poignee = un cran plus haut ; plus de passage
    automatique en plein ecran au defilement ; animation fluide (transform).
- [x] T26-TS1 Tests (unitaires, fonctionnels) a chaque PR (#172 a #175). Pas d'adresse d'apercu par
  branche : l'essai sur telephone se fait apres fusion, sur le site en ligne.

### EPIC-T25 Ton distributeur préféré te prévient, même app fermée (Stephane, 2026-10-08)
Objectif : etre prevenu quand son distributeur favori change (vide, en panne, de nouveau
en service, produit suivi dispo) meme quand l'app est fermee, et le dire des l'accueil.
Valeur : ne plus se deplacer pour rien ; raison de revenir dans l'app.
Decisions (Stephane 2026-10-08) : sans compte (abonnement lie au telephone, comme les
favoris) ; l'accueil « Ton distributeur préféré te prévient. » ne sort qu'avec les
notifications. Hors perimetre : e-mail, SMS, application native.

- [x] T25-US1 En tant que visiteur, je comprends des l'accueil que mon distributeur
  prefere me previent
  - Acceptance : maquette retenue `docs/maquettes/2026-10-07-accueil/` (v7, titre 1) :
    titre « Ton distributeur préféré te prévient. », sous-titre « Mets-le en favori : dès
    que tes œufs sont dispo, tu le sais, sans te déplacer. », pastille des oeufs avec le
    coeur des favoris, exemple de notification « Œufs vu dispo chez … » (texte reel de
    l'app) ; apercu de partage aligne ; ni « tap », ni « reste », aucun lieu reel.
- [x] T25-US2 En tant qu'utilisateur qui met un favori, on me propose d'etre prevenu meme
  app fermee
  - Acceptance : au premier coeur, une invitation « Être prévenu même app fermée ? »
    (jamais a l'ouverture de l'app) ; Oui -> permission du navigateur -> abonnement ;
    Non -> plus redemande, reactivable dans les reglages des notifications ; refus du
    navigateur explique sans bloquer ; sur iPhone hors ecran d'accueil : petit guide
    « Ajoute DistriMatch à ton écran d'accueil » au lieu de la demande.
- [x] T25-US3 En tant qu'abonne, je recois une notification quand un de mes favoris change
  - Acceptance : memes evenements que la veille actuelle (vide, en panne, de nouveau en
    service, produit suivi vu dispo, de nouveau dispo) et memes textes ; jamais pour son
    propre signal (si connecte), ni pour les signaux de demo ; heures calmes et anti-rafale
    (un meme favori au plus toutes les 30 min) respectees ; toucher la notification ouvre
    la fiche ; delai cible < 1 min apres le signal.
- [x] T25-US4 En tant qu'abonne, je garde la main
  - Acceptance : reglages : activer / couper « même app fermée » ; retirer un favori le
    retire de l'abonnement ; « Réinitialiser mes données » supprime l'abonnement ; un
    abonnement expire (navigateur) est efface automatiquement.
- [x] T25-TS1 Technique : service worker limite aux notifications (aucun cache), cles
  VAPID (publique dans config.js, privee en secret serveur), table `push_subscriptions`
  non lisible par l'API + RPC d'abonnement anonymes (l'adresse d'abonnement sert de
  secret), declencheur sur les signaux -> fonction serveur Supabase qui envoie les
  notifications. Prerequis : jeton Supabase avec les droits Edge Functions (Stephane).
- [x] T25-TS2 Tests (unitaires, base, fonctionnels) et captures iPhone avant fusion.
  Livre le 2026-10-08 (PR #170) ; reception verifiee sur un Android de Stephane (notification
  recue, la toucher ouvre la fiche). Suivi : la fiche ouverte depuis une notification ne
  met plus l'anneau clavier sur la croix ; bouton « Autoriser les notifications du
  navigateur » retire (doublon de « Prévenu même app fermée »).

### EPIC-T24 Accueil « Fais passer le mot. » (Stephane, 2026-10-07)
Objectif : un ecran d'accueil percutant, positif, compris a tout age, qui montre le
geste de l'app (dire ce qui est dispo) et son effet sur la carte. Maquette retenue :
`docs/maquettes/2026-10-07-accueil/` (carte en grand, feuille rouge en bas).
Hors perimetre : le parcours de localisation lui-meme, les notifications push.

- [x] T24-US1 En tant que nouveau visiteur, je comprends en un coup d'oeil a quoi sert
  DistriMatch et comment j'aide les autres
  - Acceptance : carte dessinee en haut (pastilles a anneau comme l'app, celle des oeufs
    en vert, sans etiquette ajoutee), feuille rouge en bas : titre « Fais passer le
    mot. », sous-titre « Des œufs au distributeur ? Indique-le, et les membres de la
    communauté en sont informés. », exemple « Œufs · Dispo / Pas dispo » ; bouton
    « Voir autour de moi » (la demande de localisation du navigateur suit) ;
    « Ta position est privée. Jamais partagée, jamais stockée. » ; ni « tap », ni
    « reste », ni « machine », ni promesse de rythme, aucun lieu nomme ; erreur de
    localisation et « Réessayer » inchanges ; lisible sur telephone et grand ecran.
- [x] T24-US2 En tant que personne qui recoit un lien, l'apercu du partage reprend le
  nouveau message
  - Acceptance : titres og / twitter « DistriMatch - Fais passer le mot », descriptions
    sans « tap ».
- [x] T24-TS1 Tests et captures iPhone avant fusion.

### EPIC-T23 Voir le distributeur sur la carte depuis sa fiche (Stephane, 2026-10-07)
Objectif : depuis une fiche ouverte via la liste ou la recherche, retrouver le
distributeur sur la carte. Hors perimetre : itineraire dans l'app.

- [x] T23-US1 En tant qu'utilisateur, je localise le distributeur depuis sa fiche
  - Acceptance : icone epingle « Voir sur la carte » dans l'en-tete de la fiche (tout le
    monde) ; au toucher : la fiche et la liste se ferment, la carte se centre sur le
    distributeur (zoom de rue), sa pastille pulse quelques secondes ; un filtre de type
    qui la masquait est leve ; toucher la pastille rouvre la fiche ; « retour » ramene a
    la carte sans rouvrir la liste ; cachee tant que la carte n'existe pas (deep link
    avant la geolocalisation).
- [x] T23-TS1 Tests et captures avant fusion.

### EPIC-T22 Coherence et « Mon activité » (critique de design, Stephane, 2026-10-07)
Objectif : remettre au niveau de la fiche les ecrans restes en retard (accueil, Activite,
Compte), une seule voix visuelle, et un vrai historique de ses contributions.

- [x] T22-TS1 Base (migration 023) : l'auteur d'un signal n'est plus lisible par l'API
  (user_id, device_hash) ; `my_activity()` = signaux, ajouts, avis, demandes du compte.
- [x] T22-US1 En tant que membre, je retrouve mon historique dans « Mon activité »
  - Acceptance : onglet Activite garde ; liste du plus recent au plus ancien (signal,
    ajout + statut, avis, demande d'exploitant), filtres Tout / Signaux / Ajouts / Avis,
    une ligne ouvre la fiche ; visiteur : invitation a se connecter ; plus de points, de
    « Confirmer / Infirmer », ni de code anglais.
- [x] T22-US2 En tant que visiteur, l'accueil dit vrai
  - Acceptance : plus de « sans compte » ni de « machine » ; petits textes lisibles.
- [x] T22-US3 En tant qu'utilisateur, l'app parle d'une seule voix
  - Acceptance : Compte sans points ; fond gris unique ; bouton principal rouge (Itineraire
    compris) ; etoiles d'une seule couleur lisible ; distances « 385 m », « 1,2 km »,
    « 16 km » ; « Mes favoris » ; visiteur : « €€ » sans pointille, pas de carte d'ajout,
    invitation sans fausses pastilles.
- [x] T22-TS2 Tests et doc, captures avant / apres.

### EPIC-T21 Valider les nouvelles fiches dans la console admin (Stephane, 2026-10-02)
Objectif : une fiche ajoutee par un membre n'est visible par tous qu'apres validation.
Decisions : les 15 fiches OSM sont retirees de la base (types non souhaites ; script
d'import garde, non relance) ; refus sans motif obligatoire ; fiches deja publiees
inchangees ; 5 ajouts / jour / compte ; comptes bloques refuses.

- [x] T21-TS0 Retirer les fiches OpenStreetMap de la base (15, rien de rattache)
- [x] T21-TS1 Base (migration 022) : statut de revue des fiches
  - Acceptance : `distributors.review_status` pending / published / rejected ; ajout par
    l'API = pending (force) ; lecture publique = published seulement, l'auteur voit les
    siennes, l'admin toutes ; produits suivent leur fiche ; signaux, avis, demandes
    d'exploitant refuses sur une fiche non publiee ; fonctions admin publier (avec
    corrections nom / type / position) / refuser (motif facultatif) ; fil de messages.
- [x] T21-US1 En tant que membre, j'ajoute un distributeur et je suis sa validation
  - Acceptance : apres l'ajout : « visible après validation » ; ma fiche en attente est
    sur ma carte, marquee « En attente », sans signal / avis / exploitant ; Compte ->
    « Mes ajouts » (En attente / Publiée / Refusée [: motif]) avec les messages de
    l'equipe et une reponse possible.
- [x] T21-US2 En tant qu'admin, je valide les nouvelles fiches
  - Acceptance : console : section « Nouveaux distributeurs » ; detail : mini-carte
    (repere deplacable), nom, type, adresse, produits, auteur, alerte doublon (nom
    proche a moins de 100 m) ; Publier / Corriger puis publier / Refuser (motif
    facultatif) / Ecrire au membre.
- [x] T21-TS2 Tests et doc, captures avant fusion.

### EPIC-T20 Verifier un exploitant : echange direct, SIRENE et code par courrier (Stephane, 2026-10-02)
Objectif : relier une personne a une societe de facon fiable (« methode Google ») sans
demander le SIRET d'emblee. Parcours : demande legere -> console admin -> echange direct
(fil de messages) -> SIRET demande dans le fil -> verification SIRENE affichee a l'admin
(nom, adresse, etat, dirigeants, distance au distributeur) -> code a 5 chiffres envoye par
courrier a l'adresse SIRENE (jamais une adresse donnee par le membre ; appel en secours,
au cas par cas) -> le membre tape le code -> statut Exploitant valide. Remplace le
formulaire « Societe + telephone ou SIRET » d'EPIC-T18.

- [x] T20-TS0 Benchmark + 3 maquettes (fil de discussion / etapes guidees / mixte), cote
  membre et cote console admin, et comparatif ; Stephane choisit.
Choix de Stephane : maquette 3 « mixte » (docs/maquettes/2026-10-02-exploitant/3-mixte.html).

- [x] T20-US1 En tant que membre, je demande le statut sans SIRET et je suis ma demande
  - Acceptance : « À propos » -> formulaire leger (lien Propriétaire / Exploitant / Salarié,
    entreprise, message facultatif) ; page « Ma demande » : statut, barre 4 etapes (Demande ·
    Entreprise · Courrier · Vérifié), carte « Ce qu'il te reste à faire » ; ouverte depuis
    « À propos » (badge nouveaux messages) et depuis Compte.
- [x] T20-US2 En tant que membre et admin, nous echangeons directement (fil par demande)
  - Acceptance : fil de messages (membre / equipe / evenements) des deux cotes, saisie libre
    (1000 caracteres, 30 messages / heure), non lus comptes et remis a zero a la lecture.
- [x] T20-US3 En tant qu'admin, je verifie le SIRET dans SIRENE et j'envoie un code par courrier
  - Acceptance : « Demander le SIRET » ; le membre saisit 14 chiffres (controle de cle) ;
    console : registre SIRENE (API publique Recherche d'entreprises : raison sociale,
    adresse, etat, dirigeants, distance au distributeur, verdict) ; « Envoyer le code par
    courrier » -> code 5 chiffres genere en base (stocke chiffre, 30 jours), carte
    imprimable a l'adresse SIRENE ; autres actions : appeler (le code est le meme), valider
    sans code, refuser avec motif.
- [x] T20-US4 En tant que membre, je tape le code recu et deviens exploitant verifie
  - Acceptance : 5 cases (un seul champ one-time-code), 5 essais, expiration 30 jours ;
    bon code -> exploitant verifie (badge), message systeme ; SIRET et code jamais publics.
- [x] T20-TS1 Base, tests et doc, captures avant fusion.

### EPIC-T19 Etat du distributeur : menu deroulant, et visible sur la carte (Stephane, 2026-10-02)
Objectif : changer l'etat du distributeur comme un produit (menu deroulant, plus de bouton
« Mettre à jour ») et voir l'etat + le stock sans ouvrir la fiche (pastille de la carte,
liste laterale). Etape 1 : 3 maquettes benchmarkees ; Stephane choisit ; puis implementation.

- [x] T19-TS0 Benchmark + 3 maquettes iPhone publiees (menu : ancre / feuille du bas /
  deplie ; pastille : couleur pleine / anneau / badge chiffre) et comparatif
- [x] T19-US1 En tant que membre, je change l'etat du distributeur depuis un menu deroulant
  - Acceptance : toucher la ligne d'etat ouvre le menu En service / Vide / En panne (etat
    actuel coche ; « Actuellement : Pas d'info » en tete si besoin) ; un choix envoie le
    signal ; visiteur -> invitation ; plus de bouton « Mettre à jour » ; coup de pouce sur
    place et « Info de l'exploitant » conserves ; jamais « machine ».
- [x] T19-US2 En tant qu'utilisateur, je vois l'etat et le stock sur la pastille de la carte
  - Acceptance : couleur du feu (vert / orange / rouge, gris sans info, adoucie > 2 h) ;
    stock lu sans chiffre (Stephane 2026-10-02 : « pas de chiffre ! ») : l'anneau se
    remplit selon la part de produits dispo ; favori = petit coeur ; resume charge avec la
    carte (deux lectures anonymes des vues de signaux, memes regles que la fiche).
- [x] T19-US3 En tant qu'utilisateur, je vois l'etat et le stock dans la liste laterale
  - Acceptance : meme feu et « N sur M dispo » sur chaque ligne.
- [x] T19-TS1 Tests et doc a jour, captures avant fusion.

### EPIC-T18 Statut Exploitant et page admin (Stephane, 2026-10-01, lot 2 des statuts)
Objectif : l'exploitant d'un distributeur, qui le remplit, est la meilleure source ; sa
parole compte plus, sans bloquer la fiche s'il ne fait rien. Hors perimetre : « Reassort
fait », notifications de demande, Membre fiable (lot 3).

- [x] T18-TS1 Base (migration 020) : demandes, exploitants, admin, priorite
  - Acceptance : `operator_requests` (un membre cree / lit les siennes, une en attente
    par fiche, 5 / jour, compte bloque refuse) ; `distributor_operators` (seul
    `distributor_id` lisible) ; `app_admins` (Stephane) + `is_admin()` ; fonctions admin
    refusees a tout non-admin ; signal d'un exploitant = source 'owner', poids 1 ; vues :
    le plus recent gagne sauf exploitant contredit a moins de 30 min.
- [x] T18-US1 En tant que membre, je demande le statut d'exploitant d'un distributeur
  - Acceptance : « À propos » : « C'est ton distributeur ? » -> formulaire (societe,
    telephone ou SIRET) ; envoye -> « Demande envoyée, en attente de validation » ;
    exploitant -> « Tu es l'exploitant vérifié » ; visiteur -> connexion ; erreurs dites.
- [x] T18-US2 En tant qu'admin, je valide ou refuse les demandes depuis l'app
  - Acceptance : menu avatar « Admin » (admin seulement) -> page : demandes en attente
    (fiche, ville, societe, contact, email, date ; Valider / Refuser), exploitants
    (Retirer, avec confirmation) ; un non-admin voit « Réservé à l'admin ».
- [x] T18-US3 En tant que visiteur, je vois qu'un distributeur a un exploitant et ce qu'il dit
  - Acceptance : tag « Exploitant vérifié » pres du nom ; signal de l'exploitant affiche
    « Info de l'exploitant · il y a 1 h » (produit et ligne d'etat).
- [x] T18-TS2 Tests (unitaires, DOM, base, fonctionnels) et doc a jour, captures avant fusion.

### EPIC-T17 Horaires et coup de pouce sur place (Stephane, 2026-10-01, lot 1 des statuts)
Objectif : afficher si un distributeur est ouvert (horaires OpenStreetMap) et inviter le
membre qui est devant a mettre a jour ce qui date. Lots suivants (cadres, a venir) :
lot 2 statut Exploitant (demande depuis la fiche, validation admin ; son signal l'emporte
sur un signal contraire a moins de 30 min d'ecart ; « Info de l'exploitant ») ; lot 3
Membre fiable (> 30 j, >= 20 signaux, < 10 % contredits dans les 30 min, jamais bloque)
quand il y aura assez de signaux. La gamification par points est abandonnee.

- [x] T17-TS1 Colonne `distributors.opening_hours` (migration 019) et import OSM
  - Acceptance : colonne texte (format OSM), non modifiable par l'API ; `import-osm.mjs`
    la remplit a l'import et la met a jour sur les fiches OSM deja importees (rien d'autre
    n'est ecrase) ; les 9 fiches OSM qui ont des horaires les recoivent.
- [x] T17-US1 En tant que visiteur, je vois si le distributeur est ouvert
  - Acceptance : sous la ligne type / prix / note : « Ouvert 24 h/24 », « Ouvert · ferme a
    20:00 », « Ferme · ouvre a 08:00 / demain a / lun. a » (heure du fuseau du
    distributeur) ; « À propos » : ligne Horaires (« Tous les jours, 24 h/24 », « Lun.–ven. :
    08:00–19:00 · … ») ; format non reconnu -> texte brut dans « À propos », rien sous le
    nom ; pas d'horaires -> rien.
- [x] T17-US2 En tant que membre devant le distributeur, je suis invite a mettre a jour ce qui date
  - Acceptance : connecte, a 15 m ou moins (distance - precision GPS <= 15 m, precision
    <= 30 m, position relue a l'ouverture de la fiche) : phrase « Tu es sur place : N
    produits a verifier » et cartes signalees il y a plus de 2 h (ou jamais) marquees ;
    sans produit : invitation a ajouter ; etat du distributeur > 2 h : « Mettre a jour »
    marque ; rien si tout est frais, si loin, ou en visiteur ; aucun envoi automatique.
- [x] T17-TS2 Tests (unitaires, DOM, fonctionnels, base) et doc a jour, captures avant fusion.

### EPIC-T16 Un menu deroulant par produit, sous la fleche (Stephane, 2026-10-01)
Retour : toucher le nom pour le modifier ne convient pas. Decision : un seul menu sous
l'etiquette (fleche) : Dispo / Pas dispo (etat actuel coche ; « Actuellement : Pas
d'info » en tete si besoin), separateur, Renommer, Retirer (membre connecte).

- [x] T16-US1 En tant que membre connecte, je signale et je modifie depuis le menu de l'etiquette
  - Acceptance : toucher l'etiquette ouvre un menu deroulant (role menu) : Dispo, Pas
    dispo (etat actuel coche), separateur, Renommer, Retirer (rouge) ; un choix d'etat
    envoie le signal ; « Pas d'info » n'est pas un choix (en tete « Actuellement : Pas
    d'info » si c'est l'etat) ; Echap / toucher ailleurs ferme.
- [x] T16-US2 En tant que membre connecte, je renomme et je retire sans piege
  - Acceptance : Renommer -> le nom devient un champ (suggestions des listes, Entree =
    enregistre, Echap = annule, vide = annule) ; Retirer -> toast « Annuler » 7 s (DELETE
    differe) ; plus de nom touchable, plus de retrait par nom vide, plus d'appui long.
- [x] T16-TS Tests et doc a jour, captures avant fusion.

### EPIC-T15 Les vrais distributeurs d'OpenStreetMap, Cote Basque (Stephane, 2026-10-01)
**Correction 2026-10-02 (Stephane : « ce ne sont pas des distributeurs automatiques »)** :
16 fiches douteuses retirees de la base (vending « food » sans precision : France Asia,
Essentiel, Aneth et Cerfeuil, Xpress, fiches sans nom ; glacons). Restent 15 fiches
(8 pizza, 7 pain). `import-osm.mjs` n'importe plus « food » seul (sauf nom qui dit pizza /
pain), ni les glacons, ni les machines a plusieurs usages.
Cadrage de US-5 tranche par Stephane : zone Cote Basque, fiches de demo gardees pour
l'instant, import unique relancable. Comptage a blanc : 32 machines (15 food, 7 pain,
7 pizza, 2 glacons, 1 mixte).

- [x] T15-TS1 Colonne `source` (migration 018)
  - Acceptance : `distributors.source` in ('user','osm','demo'), defaut 'user',
    fiches demo = 'demo' ; trigger : l'API (anon / authenticated) ne peut poser que
    'user' ; teste en integration.
- [x] T15-TS2 Script `scripts/import-osm.mjs` (zone en parametre, rien en dur dans l'app)
  - Acceptance : Overpass (vending alimentaires) -> fiches `osm-<node|way>-<id>`,
    `source='osm'`, type mappe (pizza, bread -> bakery, ice_cubes -> ice, food ->
    general...), nom OSM sinon « Distributeur de … », adresse OSM sinon rue / ville
    par Nominatim (1 req/s), `last_verified = null`, prix inconnu ; ignore une machine
    a moins de 50 m d'une fiche reelle existante ; rejouable sans doublon ; `--dry-run`.
- [x] T15-US1 En tant que visiteur, je vois les vraies machines de la Cote Basque
  - Acceptance : les 32 (moins les doublons) apparaissent sur la carte et la liste,
    « Pas encore vérifié », sans produit (pastilles pour ajouter) ; prix inconnu
    affiche « Prix ? » ; « À propos » d'une fiche OSM : « Données © OpenStreetMap
    contributors (ODbL) ».

### EPIC-T14 Itineraire dans « À propos », photos desactivees en V1 (Stephane, 2026-10-01)
Objectif : une fiche plus simple pour la premiere version. Rien n'est efface de la base
(2 photos existantes), le code photo reste derriere `FEATURES.photos` (config.js).

- [x] T14-US1 En tant que visiteur, je veux l'itineraire dans « À propos »
  - Acceptance : bouton principal « Itinéraire » sous l'adresse et la distance de
    l'onglet « À propos » ; plus de barre collee en bas de la fiche.

- [x] T14-US2 En tant que membre, je ne vois plus de fonction photo (V1)
  - Acceptance : `FEATURES.photos = false` : ni bouton Photo, ni galerie « Photos »
    dans « À propos », ni vignettes photo dans la liste (picto du type a la place),
    ni rubrique photo dans l'ajout d'un distributeur (qui ne l'exige plus) ;
    invitation : « Connecte-toi pour signaler ce qu'il reste et donner ton avis »,
    sans l'etiquette « Photos » ; `FEATURES.photos = true` remet tout.

### EPIC-T13 Ajouter un produit par liste, selon le type de distributeur (Stephane, 2026-10-01)
Objectif : ajouter en un toucher les produits courants, avec des noms identiques d'un
distributeur a l'autre. Maquette validee : `docs/maquettes/2026-10-01-edition/4-ajout-liste.html`
(PR #151). Listes generiques par type, sans produit regional, dans le code.

- [x] T13-US1 En tant que membre connecte, je veux ajouter un produit courant en un toucher
  - Acceptance : toucher « + Ajouter un produit » ouvre un panneau sur place (toute
    la largeur) avec jusqu'a 4 produits courants du type en pastilles (picto + nom) ;
    un toucher ajoute (insert `products`) et la liste propose les suivants ; jamais
    un produit deja sur la fiche (nom compare sans casse, accents ni precision entre
    parentheses) ; pas de pastilles si le type n'a pas de liste.

- [x] T13-US2 En tant que membre connecte, je veux taper un autre produit avec des suggestions
  - Acceptance : champ « Autre… » : suggestions (5 max) pendant la frappe, au debut
    des mots, sans casse ni accents, d'abord la liste du type puis les autres ;
    fleches + Entree ou toucher pour choisir ; Entree sans choix = nom libre ;
    doublon refuse avec message ; le panneau reste ouvert pour enchainer ; « Fermer »,
    Echap ou toucher ailleurs le referme.

- [x] T13-TS Fonctions pures, tests et doc
  - Acceptance : `suggestProducts` / `searchProductSuggestions` (utils.js) testees ;
    tests fonctionnels de l'ajout mis a jour ; `CLAUDE.md` a jour ; captures avant fusion.

### EPIC-T12 Modifier une fiche sans bouton, au toucher (Stephane, 2026-10-01)
Objectif : un membre connecte modifie la fiche directement sur les produits, sans
bouton « Modifier » ni mode edition. Valeur : fluide, simple, intuitif, a une main
devant le distributeur. Maquette retenue : `docs/maquettes/2026-10-01-edition/1-toucher.html`
(PR #149, benchmark NN/g, WCAG 2.5.1 / 2.5.7, Rappels, Keep, Gmail, Waze).
Hors perimetre : carte, side panel, etat du distributeur (pastille « Mettre à
jour » inchangee), chatbot (inactif), schema Supabase (RLS 005 / 013 inchangees).

- [x] T12-US1 En tant que membre connecte, je veux signaler la dispo en touchant l'etiquette
  - Acceptance : toucher l'etiquette d'une carte deplie sur la carte « Dispo / Pas
    dispo » avec la question « Toujours dispo ? » / « Toujours pas dispo ? » / « Là,
    maintenant ? » (reponse actuelle marquee) ; un toucher envoie (RPC
    `confirm_availability`), la carte se referme « vu à l'instant » ; retoucher
    l'etiquette, Echap ou toucher ailleurs referme sans rien envoyer ; plus de
    boutons affiches d'office sur les cartes sans info recente.

- [x] T12-US2 En tant que membre connecte, je veux renommer et retirer un produit sur place
  - Acceptance : toucher le nom -> champ en place (Entree / perte du focus =
    enregistre, Echap = annule, erreur de la base dite et nom rétabli) ; retirer =
    nom vide valide ou appui long / clic droit -> menu « Renommer / Retirer » ;
    toast « X retiré · Annuler » 7 s ; la suppression en base n'a lieu qu'a la fin
    du delai (Annuler ne touche pas la base) ; echec -> produit rétabli + message.

- [x] T12-US3 En tant que membre connecte, je veux ajouter des produits a la suite
  - Acceptance : carte en pointillé « + Ajouter un produit » en fin de grille (« Ajoute
    le premier produit » sur une fiche vide) ; toucher -> champ ; Entree ajoute (insert
    `products`, picto d'apres le nom, « Pas d'info ») et garde un champ vide pour
    enchainer ; doublon (meme nom) refuse avec message ; echec de la base dit.

- [x] T12-US4 En tant que membre connecte, je veux changer le niveau de prix en le touchant
  - Acceptance : toucher « €€ » dans l'en-tete ouvre € / €€ / €€€ sur place ; un
    choix met a jour `distributors.price_range` (013) ; erreur dite et valeur rétablie.

- [x] T12-US5 En tant que visiteur, je veux savoir que modifier demande un compte
  - Acceptance : en visiteur, rien n'est modifiable ; toucher une etiquette, la carte
    d'ajout ou le prix fait defiler jusqu'a l'invitation « Tu es devant le
    distributeur ? » et la met en avant. Distributeur seulement local : rien de
    modifiable tant qu'il n'est pas publie (inchange).

- [x] T12-TS Plus de mode edition ; une seule notion de dispo ; tests et doc
  - Acceptance : plus de bouton « Modifier » ni de mode edition (champs, puces
    « Disponible / Non disponible », corbeilles, formulaire d'ajout, select de prix) ;
    `products.available` n'est plus lu pour l'affichage (la dispo = le signal) ;
    indice de premier usage « Touche l'étiquette pour la changer » sur la 1re carte,
    efface apres la 1re action reussie (localStorage) ; tests des 4 niveaux et
    `CLAUDE.md` a jour ; captures iPhone montrees a Stephane avant fusion.

### EPIC-T11 Fiche : des zones et des boutons qu'on distingue (Stephane, 2026-09-30)
Objectif : voir d'un coup d'oeil ou commence chaque zone de la fiche, et reconnaitre
un bouton et son importance. Retour de Stephane sur la fiche v3 : « c'est mieux, par
contre, distingue les differentes zones, et aussi les boutons ». Visuel seulement :
ni contenu, ni mots, ni fonctionnement ne changent. Valide le 2026-09-30 ; captures
avant / apres montrees a Stephane avant fusion.

- [x] T11-US1 En tant que visiteur, je veux distinguer les zones de la fiche
  - Acceptance : en-tete (nom, etat, note) sur fond blanc ; separateur net avant
    les onglets ; zone de contenu (produits, avis, a propos) sur fond gris tres
    clair ou les cartes se detachent (carte Pas dispo encore distincte du fond) ;
    pied avec ombre vers le haut ; contrastes >= 4,5:1 inchanges.

- [x] T11-US2 En tant que visiteur, je veux des onglets qui ne concurrencent pas l'action
  - Acceptance : selecteur segmente gris, onglet actif blanc en gras ; plus de
    rouge sur les onglets (le rouge est reserve a « Se connecter »).

- [x] T11-US3 En tant que visiteur, je veux reconnaitre un bouton et son importance
  - Acceptance : trois niveaux partout sur la fiche : principal plein (Itineraire
    noir, Se connecter rouge, un par zone) ; secondaire en contour avec icone
    (Photo, Modifier, Ajouter les produits) ; petit bouton en pastille avec icone
    (« Mettre à jour », plus un lien souligne) ; « Dispo / Pas dispo » des cartes
    en vrais boutons (bordure marquee, relief, Dispo vert, Pas dispo gris) ; cibles
    tactiles >= 44 px.

### EPIC-T10 Fiche v3 : les produits d'abord, l'etat en discret (Stephane, 2026-09-30)
Objectif : on voit d'abord ce qu'il reste ; l'etat du distributeur se lit en passant.
Valeur : Stephane trouvait le bandeau d'etat trop imposant et le vocabulaire flou
(« Fonctionne », « Il y en a / Plus rien », « machine »). Maquette retenue :
`docs/maquettes/2026-09-30-v3/vitrine-b-teintee.html` (PR #141 a #146, benchmark
Google Maps / Chargemap / Instacart / Waze dans `docs/maquettes/2026-09-30-v2/`).
Hors perimetre : carte, side panel, mode edition (« Disponible / Non disponible »),
schema Supabase (etats `working` / `empty` / `broken` inchanges).
Valide par Stephane le 2026-09-30, livre le meme jour.

- [x] T10-US1 En tant que visiteur, je veux lire l'etat du distributeur en une
  petite ligne sous son nom, afin que l'etat ne cache pas les produits
  - Acceptance : plus de bandeau d'etat (`#dist-hero`) ; sous le nom, mini-feu
    tricolore (vert En service, orange Vide, rouge En panne, eteint Pas d'info) +
    mot + age (« En service · il y a 12 min », sinon « Vérifié il y a X ») en
    14-15 px ; adouci entre 2 h et 24 h. Connecte : « Mettre à jour » deplie
    En service / Vide / En panne (etat actuel marque) ; un tap envoie le signal.

- [x] T10-US2 En tant que visiteur, je veux voir les produits en cartes teintees,
  afin de savoir d'un coup d'oeil ce qu'il reste
  - Acceptance : grille 2 colonnes triee Dispo -> Pas d'info -> Pas dispo ; une
    seule carte pour tous les etats (nom en noir, picto neutre, etiquette,
    ligne d'age toujours presente : « vu il y a X » / « il y a X » / « aucun
    signal depuis 24 h ») ; teinte de toute la carte : vert pale Dispo, gris
    pale Pas dispo, blanc Pas d'info ; picto choisi d'apres le nom du produit
    (pur, `productIconKey`), generique sinon ; distributeur vide / en panne :
    un seul liseré au-dessus de la grille, pas de repetition par carte.

- [x] T10-US3 En tant que membre connecte, je veux signaler un produit avec les
  memes mots que l'affichage, afin de ne pas hesiter
  - Acceptance : toucher une carte deplie « Dispo / Pas dispo » ; si l'info a
    plus de 2 h ou n'existe pas, les deux boutons sont deja visibles sur la
    carte ; meme RPC `confirm_availability` (available / absent) ; toast de
    remerciement, carte « vu à l'instant ».

- [x] T10-US4 En tant que visiteur, je veux une invitation claire a me connecter,
  afin de savoir tout ce que la connexion debloque
  - Acceptance : encadre « Tu es devant le distributeur ? Connecte-toi pour
    signaler ce qu'il reste, donner ton avis et ajouter des photos » + apercu
    (Etat, Dispo / Pas dispo, Avis, Photos) + bouton rouge « Se connecter » ;
    Favori et Partager en icones dans l'en-tete ; Itineraire bouton principal ;
    Photo et Modifier seulement en connecte.

- [x] T10-US5 En tant que visiteur, je veux un vocabulaire simple et constant
  - Acceptance : « En service » (plus « Fonctionne ») ; « Dispo / Pas dispo »
    pour signaler (plus « Il y en a / Plus rien ») ; le mot « machine »
    n'apparait dans aucun texte de la fiche (libelles, toasts, erreurs d'avis
    et de signal, bandeau « enregistre sur ton telephone ») ; un test le garde.

- [x] T10-TS Tests des 4 niveaux et documentation a jour
  - Acceptance : unitaires, integration DOM, fonctionnels et E2E adaptes (dont
    le contraste, mesure sur les cartes et le mini-feu) ; `CLAUDE.md` (fiche,
    vocabulaire) a jour ; verification visuelle iPhone avant fusion.

### EPIC-T9 Machines enregistrees seulement sur le telephone (Stephane, 2026-09-30)
Constat : avis sur Gaztainbidea -> « code 23503 ». Le telephone de Stephane garde
une 2e copie locale de Gaztainbidea (id inconnu de la base, position un peu
differente, donc pas vue comme doublon) ; c'est elle qui s'ouvrait. Avis, signal,
photo et mesure y sont refuses par la base (cle etrangere). Tres probablement aussi
la vraie cause du « Signal non envoye » du 2026-09-25 (OK en navigation privee, qui
n'a pas de donnees locales). Origine : a l'ajout d'une machine, un echec d'envoi vers
la base etait avale en silence et la machine gardee en local.
Correctif valide par Stephane le 2026-09-30, livre le meme jour. Hors perimetre : fusion de doublons
deja presents dans la base (aucun aujourd'hui).

- [x] T9-US1 Nettoyage automatique des doublons locaux
  - Acceptance : au chargement (donnees venues de la base seulement), une machine
    locale absente de la base qui porte le meme nom (casse, accents et espaces
    ignores) qu'une machine de la base a moins de 100 m est retiree du telephone
    (localStorage) et de la carte ; la vraie fiche reste. `findLocalDuplicates` pure.

- [x] T9-US2 Les vraies machines locales sont signalees et publiables
  - Acceptance : fiche marquee « Cette machine n'est enregistree que sur ton
    telephone » ; avis, signaux, photo et modifier masques tant qu'elle n'est pas
    publiee ; bouton « Publier cette machine » (connecte ; visiteur -> connexion) qui
    l'envoie a la base avec ses produits, puis la fiche redevient normale ; a l'ajout
    d'une machine, un echec d'envoi est dit (« Enregistree sur ton telephone
    seulement ») au lieu d'etre avale.

- [x] T9-US3 Un message clair plutot qu'un code
  - Acceptance : avis refuse pour machine inconnue (23503) et signal refuse pour
    machine inconnue (P0002) -> « Cette machine n'est pas encore sur le serveur ».

### EPIC-T8 Des avis reels sur les machines (Stephane, 2026-09-30)
Constat : « comment je depose un avis ? » -> impossible ; l'onglet Avis dit « Sois
le premier a partager ton experience » sans bouton, et la note des fiches de demo
est inventee (colonnes rating / review_count, aucun avis derriere).
Reformulation validee le 2026-09-30, avec les avis de demo (absorbe US-1).
Livre le 2026-09-30 : migration 016 executee, 2 635 avis de demo sur 25 fiches (4 fiches demo a 0 avis).
Hors perimetre : moderation avis par avis, reponses du proprietaire, photos dans
les avis, pseudo choisi par l'utilisateur.

- [x] T8-US1 Lire les avis
  - En tant que client, je veux lire les avis d'une machine et sa note reelle, afin
    de savoir si elle vaut le detour.
  - Acceptance : onglet Avis du plus recent au plus ancien (auteur, etoiles,
    « il y a X », commentaire), 10 par page + « Voir plus » ; note et nombre
    d'avis en tete (fiche, liste laterale, favoris) calcules depuis les avis
    reels (vue `distributor_ratings`) ; sans avis : « Pas encore d'avis ».

- [x] T8-US2 Deposer, modifier, supprimer son avis (compte connecte)
  - En tant que connecte, je veux noter une machine (1 a 5) et ecrire un
    commentaire facultatif (500 caracteres max), afin d'aider les suivants.
  - Acceptance : un avis par compte et par machine ; etoiles en boutons >= 44 px ;
    « Publier » puis « Modifier / Supprimer » ; liste et note mises a jour sans
    recharger ; auteur affiche « Membre DistriMatch » (jamais l'e-mail) ;
    visiteur : « Connecte-toi pour donner ton avis ».

- [x] T8-US3 Avis proteges contre l'abus
  - Acceptance : migration `016_reviews.sql` : RLS (ecriture seulement sur son
    propre avis), droits par colonne, 10 avis / heure / compte (P0001), comptes
    bloques refuses (42501, table `signal_bans` partagee), `purge_user_reviews`
    reservee a l'admin ; tests d'integration contre la vraie base.

- [x] T8-US4 Avis de demo realistes et identifiables (remplace US-1)
  - Acceptance : `seed_demo_reviews()` (admin) : chaque fiche `is_demo` recoit
    exactement `review_count` avis, moyenne a +/- 0,1 de `rating`, dates sur 18
    mois, textes courts selon le type de machine, `user_id` NULL (seul le seed
    peut en creer) ; aucun avis sur une fiche reelle ; `purge_demo_data()` les
    supprime aussi.

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

- [x] US-1 (remplacee par EPIC-T8 T8-US4) Des avis realistes dans la maquette (correction Stephane 2026-09-18 : on ne
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

- [x] US-2 Une demo toujours vivante (livre 2026-10-01 : migration 017, job pg_cron `distrimatch-demo-nightly` 02:00 UTC ; verifie : 23 fiches avec signal < 24 h, 4 vrais signaux intacts. A FAIRE avant le vrai pilote : `select cron.unschedule('distrimatch-demo-nightly'); select purge_demo_data();`)
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

- [x] US-5 (epic) Chantier 4 : toutes les machines connues, partout (Cote Basque importee 2026-10-01, EPIC-T15 ; autres zones : relancer scripts/import-osm.mjs avec une autre --bbox)
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
