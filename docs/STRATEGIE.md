# Strategie produit DistriMatch

> Validee le 2026-09-14. Ce document fixe le cap ; `BACKLOG.md` en decline les
> chantiers. Quand une decision d'implementation hesite entre deux options,
> c'est ici qu'on tranche.

## Ambition et role du pilote

**Vocation mondiale.** La Cote Basque n'est pas le marche, c'est le
laboratoire : elle sert a prouver la **methode**, pas a faire une belle carte.
Tout ce que le pilote fait a la main et qui ne se replique pas ailleurs ne
prouve rien.

Le demarrage a froid n'est pas un probleme de mise en place unique : il se
repose **a chaque nouveau territoire**, et c'est le probleme numero un de
l'echelle. La reponse n'est pas une personne qui inventorie, c'est :
1. **OpenStreetMap comme couche 0** : `amenity=vending_machine` +
   `vending=pizza|bread|food|milk|...`. Au 2026-09-14 : 32 machines deja
   cartographiees sur la zone pilote, ~9 000 dans le monde sur ces trois tags.
   Import automatique, correction par la communaute, releve manuel seulement
   en complement.
2. **Les fabricants de machines** comme canal : ils savent ou sont leurs
   machines, et les modeles recents ont une telemetrie. A terme la machine est
   le capteur, pas l'humain.

**Ce que le pilote doit prouver, avec des seuils fixes a l'avance** (valides
par Stephane le 2026-09-14 ; ce sont des ordres de grandeur, l'important est
qu'ils soient ecrits avant de demarrer) :
- taux de contribution au QR : >= 5 % des scans produisent un signal ;
- >= 30 % des machines de la zone avec un signal de moins de 7 jours apres
  3 mois ;
- des consultations hebdomadaires regulieres qui ne viennent pas de Stephane.

Si ces seuils ne sont pas atteints, on change la mecanique de contribution
avant d'ouvrir un autre territoire.

**Le « monde » realiste** : la culture du distributeur de produits frais est
europeenne (France, Benelux, Allemagne, Autriche, Suisse avec leurs
« Hofautomat » et « Milchtankstelle », Italie). Sequence naturelle : France ->
francophonie -> Benelux et pays germanophones. Le reste du monde, ce sont
d'autres machines et d'autres usages ; on n'en fait pas une hypothese.

## Le point fort : l'etat maintenant, pas la carte

Waze n'est pas une carte, c'est l'etat de la route a l'instant, dit par des
gens qui y sont. Transpose aux distributeurs automatiques : le probleme n'est
pas de les trouver (Google Maps et la page Facebook du producteur le font),
c'est de savoir **s'il reste du pain, des pizzas ou du fromage avant de faire
15 km**. Les machines se vident, tombent en panne, sont remplies a des heures
irregulieres, et personne ne couvre ca.

Le point fort de DistriMatch est donc **l'etat par produit, horodate et
source** : « Taloa nature : dispo, confirme il y a 12 min ». La confiance
vient de l'horodatage. Tout le reste de l'app est subordonne a ca.

Pourquoi c'est defendable :
- Google ne fera pas de stock par produit sur des machines sans personnel.
- L'effet reseau est **local** : la valeur a Espelette ne depend que des
  contributeurs d'Espelette. Un territoire dense comme la Cote Basque est
  couvrable par une seule personne.

## Positionnement

- **Promesse : « Savoir quand il est plein. »** Tenable des le premier jour.
  Pas « plein ou vide maintenant » (demande du volume qu'on n'a pas), pas
  « trouver un distributeur » (c'est Google).
- **Cible : touristes et nouveaux arrivants.** Les locaux savent deja que le
  pain est parti a 10 h. Le flux touristique de la cote est enorme l'ete, et
  ces gens ne reviennent pas : le QR sur la machine est le seul moyen de les
  attraper au bon moment.
- **Un territoire a la fois, couvert a 100 %.** Pilote : BAB, cote jusqu'a
  Hendaye, Espelette et Cambo. La densite locale est la barriere a l'entree,
  et la regle vaut pour chaque territoire suivant : on ouvre une zone quand on
  peut la couvrir (import OSM + stickers + un animateur local), pas avant.
- **Metrique qui compte : % de machines avec un signal de moins de 24 h.**
  Secondaires : machines avec un rythme etabli, alertes actives,
  confirmations par semaine. Pas les telechargements.

## Les trois couches de fraicheur

Le produit doit etre bon **avec des donnees vieilles** : avec 100 machines,
la fraicheur quotidienne partout n'arrivera pas avant longtemps.

| Couche | Contenu | Qui la produit | Valeur |
|---|---|---|---|
| 0 - Guide | Position et type (import OSM), puis rythme de remplissage, produits, paiement, creneaux ou c'est vide | Import OpenStreetMap corrige par la communaute ; sur le pilote, complete a la main (machine, page Facebook du producteur) | Jour 1, sans aucun utilisateur. Personne ne structure le rythme, Google n'a que le point |
| 1 - Signal | **Par produit** : « il reste quoi ? » (chaque produit de la fiche : vu dispo / vu absent / pas regarde), plus deux signaux machine en un tap (« vide », « en panne »). Horodate, pondere par la source | Le client, surtout le client decu (le signal « vide » est le plus motive : prevenir les autres) | Vaut ~2 h |
| 2 - Rythme | « Habituellement plein le matin, vide le dimanche soir », infere des signaux | L'agregation, quand assez de signaux | L'actif durable : reste vrai les jours sans contribution |

**Regle d'affichage** : l'etat se calcule **par produit** ; la fiche et le
marqueur en montrent le resume (« 3 produits sur 5 vus dispo il y a 12 min »).
Toujours l'age de l'info, jamais un vert perime.
- 🟢 confirme < 2 h
- 🟡 < 24 h
- ⚪ inconnu ou ancien : on affiche le rythme (couche 2) ou le guide (couche 0)
- 🔴 signale vide

**Sources et poids** :

| Source | Poids | Effort demande |
|---|---|---|
| Producteur (bouton « rempli », optionnel) | 1.0 | Volontaire, jamais requis |
| Utilisateur connecte | 0.8 | Un tap |
| Anonyme (QR devant la machine) | 0.5 | Un tap, sans compte |
| Rythme infere / horaire declare | 0.4 | Aucun |

## Le producteur est passif, par design

Sa machine vide, c'est sa reussite. Il n'a pas de probleme a resoudre, et lui
demander un tap a chaque remplissage, c'est lui demander du travail au profit
du client. Une strategie qui repose sur son effort continu est fragile ; on ne
la construit pas.

- **Ce qu'on lui demande** : accepter un sticker QR sur sa machine, une fois.
  Son benefice est faible mais reel : moins de commentaires « toujours vide »
  sur sa page. S'il refuse, la fiche existe quand meme.
- **Ce qu'on lui offre, sans obligation** : revendiquer sa fiche pour corriger
  infos et horaires, un bouton « rempli » a poids 1.0.
- **Qui demarcher activement** : seulement ceux qui ont un vrai probleme
  (machine neuve, emplacement peu passant, invendus perissables : pizza, pain,
  lait). Ils existent, mais c'est une minorite, pas le socle.

## Politique d'auth : ce qui change

Quand les signaux sont rares, chaque friction en tue la moitie. Devant une
machine, personne ne fait un magic link.

- **Le mur d'auth reste** pour l'ajout de distributeur (UC1), les produits
  (UC2 : ajout, rename, delete), les photos (UC3) et les signalements (UC4).
- **Il saute pour le signal de disponibilite** (par produit, et « vide » /
  « en panne » machine) : nouveau use case **UC11, contribution anonyme en un
  tap**. Un produit qui n'est pas dans la liste de la fiche ne se signale pas,
  il s'ajoute : c'est UC2, avec auth. Justification : ce n'est pas du contenu
  editable, c'est un signal horodate a poids reduit (0.5), qui decroit tout
  seul, limite par appareil (hash) et par un rate limit dans la RPC.
- Le tableau des UC de `CLAUDE.md` est a mettre a jour quand UC11 est
  implemente.

## Ce qu'on retire

Un produit qui vend de la confiance ne contient pas de faux chiffres. Mais le
seed actuel est une **maquette** (precision de Stephane, 2026-09-15) :
distributeurs, produits, notes et compteurs d'avis y sont inventes au meme
titre, pour voir ce que ca donne. Tant que la maquette est en place, une
note fausse ne trompe personne de plus qu'un distributeur faux. La question
« veut-on une notation dans le produit ? » se tranche donc **a l'arrivee des
vraies donnees** (import OSM, chantier 4), pas avant, et pas par /auto.

- Notes, compteurs d'avis, onglet « Avis » : decision differee a l'import OSM.
  Soit un parcours « Laisser un avis » existe (contribution publique, auth
  requise) et l'onglet vit avec de vrais chiffres, soit on les masque. La
  strategie penche pour l'etat factuel (il reste du pain, vu a quelle heure)
  plutot que l'opinion, terrain ou Google Maps est imbattable.
- Chatbot par distributeur (simule) : masque.
- Gamification (points) : masquee.
- « Previens-moi » : une seule alerte, le reapprovisionnement.

## Terrain (hors code, c'est Stephane)

1. **Inventaire de la zone : import OSM d'abord** (32 machines deja
   cartographiees, contre 25 fiches inventees dans le seed), puis completer a
   la main : Google Maps, pages Facebook, tournee physique. Relever a chaque
   fois le rythme de remplissage (couche 0), et reverser les machines
   manquantes dans OSM pour que le commun s'enrichisse.
2. **Stickers QR** : imprimer, proposer, poser. Deep link
   `?id=<distId>&confirm=1` qui ouvre directement « Il reste quoi ? ».
3. **5 a 10 producteurs pilotes** parmi ceux qui ont un probleme.
4. **Presse locale** (Sud Ouest, Mediabask) et groupes Facebook locaux, une
   fois la zone couverte et les stickers poses.
5. Plus tard : telemetrie des machines recentes (pizza, pain) si un fabricant
   ouvre une API.

## Chantiers, dans l'ordre

A decliner dans `BACKLOG.md` avec des acceptance criteria. Les migrations
Supabase s'executent a la main dans le dashboard : un chantier qui en a besoin
doit le dire, `/auto` ne peut pas le faire seul.

0. **Socle** (roadmap existante) : cache-busting des modules JS, page Compte
   en mobile 390 px.
1. **Fraicheur visible** : badge sur les marqueurs et en tete de fiche
   (« Vu plein il y a 12 min »), a partir de `last_verified` qui existe deja
   et n'est affiche nulle part. Front seul.
2. **Signal en un tap (UC11)** : table `availability_signals` (distributor_id,
   product_id, state, source, weight, device_hash, created_at), vue « etat
   courant », RPC `confirm_availability` ouverte a l'anonyme avec rate limit.
   Panneau « Il reste quoi ? » : chaque produit de la fiche en trois etats
   (vu dispo / vu absent / pas regarde, ce dernier par defaut), et deux
   boutons machine (« vide », « en panne »). Mode `&confirm=1` du deep link.
   Migration 007.
3. **Mesure + jeu de demo** (decision de Stephane, 2026-09-16 : un systeme
   FONCTIONNEL avec des donnees fictives avant d'importer du reel, pour
   apprehender chaque couche). Migration 008 : table `events` + RPC
   `log_event` anonyme, vues KPI `kpi_*` (couverture, contribution, QR vs
   organique, top fiches), vue `product_rhythm` par tranche horaire locale
   (colonne `distributors.tz`, donnee et non constante). Migration 009 :
   `seed_demo_signals()` genere signaux et evenements fictifs marques `demo-`
   selon un profil par type de machine (boulangerie pleine le matin, pizza le
   soir, une machine vide, une en panne, une dormante), regenerable,
   `purge_demo_data()` avant le vrai pilote. Front : `log_event` sur 5
   evenements, **rythme infere dans la fiche** (« Habituellement plein le
   matin, souvent vide le soir », ex-chantier 6), **tableau de bord du pilote**
   dans l'app avec les seuils go/no-go en regard des chiffres.
4. **Couche 0** : import OpenStreetMap via Overpass (`amenity=vending_machine`
   + `vending=*`, mapping `vending` -> type, dedup par signature nom+coords
   qui existe deja pour les distributeurs locaux, attribution ODbL) ; champs de
   rythme declare sur `distributors` (horaire de remplissage, creneaux vides),
   saisis a l'inventaire, affiches en fiche. Garder les signaux dans leurs
   propres tables, separees des donnees importees (base collective, pas
   derivee, pour ne pas soumettre tout DistriMatch au partage a l'identique
   ODbL ; a verifier). Decision notes / avis / onglet Avis a ce moment.
5. **Nettoyage confiance** : masquer chatbot simule et gamification.
6. **Alertes reelles** : « previens-moi quand c'est plein » branche sur les
   signaux (Supabase Realtime + Web Push). Fermer la boucle apres l'alerte :
   « Tu y es alle ? Il en restait ? » genere le signal suivant.
7. **Producteur optionnel** : `owner_user_id` sur `distributors`,
   revendication de fiche, bouton « rempli » a poids 1.0.

## Modele economique

Regle : **la donnee reste gratuite et ouverte, on vend des services.** C'est
la regle Wikipedia et OpenStreetMap, la seule qui ne trahit pas les
contributeurs. Les couts sont quasi nuls (GitHub Pages, Supabase gratuit) ;
la question n'est pas l'equilibre, c'est l'echelle.

Ce qui ne scale pas, et ne sert qu'a financer le pilote :
- l'argent public du territoire (Agglomeration Pays Basque, Chambre
  d'agriculture 64, reseau Idoki, office de tourisme) en subvention ou
  prestation « carte vivante des distributeurs fermiers » ;
- les quelques producteurs locaux qui ont un probleme (machine neuve, mal
  placee, perissables).

Ce qui scale, dans l'ordre ou on le joue :
1. **Les fabricants de machines** : canal de distribution (ils savent ou sont
   leurs machines), visibilite pour leur reseau, puis integration de leur
   telemetrie. La machine devient le capteur, le demarrage a froid disparait.
2. **La fiche pro pour les petits operateurs** (1 a 5 machines, sans systeme
   de telemetrie) : statistiques de rupture calculees par la foule (« signalee
   vide en moyenne a 11 h, le reste 5 h » = une vente manquee), mise en avant,
   push « rempli » aux abonnes. 10 a 20 EUR par mois.
3. **La transaction** : reserver ou precommander dans le casier via l'API d'un
   fabricant, avec commission. La seule piste ou l'argent est reel, parce que
   c'est la vraie solution au deplacement inutile : garantie, pas probable.

Ecarte : la publicite (trafic trop faible), le premium consommateur (faire
payer les alertes tue l'adoption et la boucle de retention), la vente de
donnees brutes.

## Ce qu'on ne fait pas

- Ouvrir un territoire qu'on ne peut pas couvrir ; s'etendre avant que le
  pilote ait atteint ses seuils.
- Dependre de l'effort du producteur.
- Afficher une disponibilite sans son age.
- **Coder le territoire en dur.** Toute nouvelle fonctionnalite doit marcher
  ailleurs qu'en Cote Basque : pas de ville, de monnaie, de langue ni de type
  de machine en dur. La dette existante (typeConfig a 3 endroits,
  EMBEDDED_DATA, PROD_HOSTNAMES, UI en francais seul) est a resorber, pas a
  aggraver.
- Un SaaS de gestion de stock pour producteurs : c'est un autre produit.

## Hypotheses a verifier sur le terrain

- Le taux de contribution reel via QR devant la machine (l'inconnue
  principale ; tout le modele de la couche 1 en depend).
- L'acceptation des stickers par les producteurs.
- Le nombre reel de machines dans la zone (ordre de grandeur suppose :
  100 a 300 ; OSM en connait 32 au 2026-09-14, donc la couverture OSM est
  partielle et la communaute doit combler).
- Qu'un territoire se lance vraiment sans releve manuel (import OSM +
  stickers + un animateur local) : c'est la these de l'echelle, elle n'est
  pas encore testee.
