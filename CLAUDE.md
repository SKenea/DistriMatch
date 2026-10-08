# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**DistriMatch** - PWA "Waze des distributeurs automatiques" pour la Cote Basque.

**Nom officiel : DistriMatch.** "SnackMatch" est l'ancien nom : ne plus l'employer (code, UI, doc, commits). Il subsiste volontairement dans les cles localStorage `snackmatch_*` (les renommer sans migration effacerait les donnees des utilisateurs) et dans le remote GitLab.
Carte Leaflet + fiche distributeur style Google Maps + favoris qui notifient (centre de notifications) + contributions communautaires (ajout, produits, photos, signalements) via Supabase. Le chatbot par distributeur est **inactif** (`FEATURES.chat = false` dans `js/config.js`, code conserve).

## Stack

- HTML5, CSS3, Vanilla JavaScript ES modules - **pas de framework, pas de build system**
- CDN charges dans `index.html` : Leaflet 1.9.4 (unpkg), `@supabase/supabase-js@2` (jsdelivr), hCaptcha
- Supabase (Postgres + RLS + storage + auth magic link) ; localStorage pour l'etat purement local
- PWA (manifest.json) ; service worker `sw.js` LIMITE AUX NOTIFICATIONS app fermee (EPIC-T25 : aucun cache, aucun gestionnaire fetch)
- Deploiement : GitHub Pages (`skenea.github.io`) + `distrimatch.pages.dev` (voir `PROD_HOSTNAMES` dans `js/config.js`)

## Commandes

```bash
# Lancer en local (requis pour les tests fonctionnels, port 8080 attendu)
npx http-server -p 8080 -c-1

# Quatre niveaux de tests (EPIC-T7), du plus rapide au plus lent
npm test                      # rapide, hors ligne : unitaires + integration DOM
npm run test:unit             # 1. UNITAIRES   tests/unit/        fonctions pures (mocks dans tests/setup.js)
npm run test:integration      # 2. INTEGRATION tests/integration/ dom.test.js (modules + page jsdom)
                              #    + db.test.js : VRAIE base, transactions annulees (jeton .env.local, sinon saute)
npm run test:functional       # 3. FONCTIONNELS tests/functional/  navigateur sur localhost:8080, serveur simule,
                              #    un fichier par domaine (fiche, notifications, navigation, auth...)
npm run test:e2e              # 4. E2E         tests/e2e/         site EN LIGNE, vraie base, aucune simulation, aucune ecriture
npm run test:all              # les quatre, dans l'ordre
node --test --test-name-pattern="escapeHTML" tests/unit/unit.test.js   # un seul test unitaire
npx playwright test --project=functional -g "nom du test"              # un seul test fonctionnel
PWDEBUG_HEADED=1 npx playwright test --project=functional -g "..."     # headed + slowMo (debug visuel)

# SQL Supabase (migrations, seed, verifications) via l'API de gestion, en tant que postgres.
# Jeton d'acces dans .env.local (ignore par git), portee Database read-write sur le projet.
node scripts/supabase-sql.mjs supabase/010_is_demo.sql
node scripts/supabase-sql.mjs -e "select count(*) from distributors;"

# Notifications app fermee (EPIC-T25) : Vault + secrets + fonction serveur push-notify
# (jeton avec droits Edge Functions ; --vault = seulement le Vault, droits Database suffisent)
node scripts/deploy-push.mjs

# Import OpenStreetMap (EPIC-T15) : zone en parametre, rejouable sans doublon, --dry-run pour compter
node scripts/import-osm.mjs --bbox 43.25,-1.80,43.60,-1.25 --tz Europe/Paris --dry-run
```

Quand lancer quoi : `npm test` a chaque modification ; `test:integration` des qu'une migration ou une regle de la base change ; `test:functional` avant chaque PR (le skill `/auto` le fait) ; `test:e2e` apres chaque deploiement Pages (il vise le site en ligne). Les tests fonctionnels injectent une geoloc Bayonne et pilotent l'app via les globals `window.AppState` / `window.openDistributorModal` ; aides partagees dans `tests/functional/helpers.js` (`setupApp`, `loginForTest`, `openSignalableFiche`, `routeSignals`...). E2E connecte : compte `e2e@distrimatch.test` (migration 015, sans mot de passe), session ouverte par `tests/e2e/session.mjs` pour CE compte uniquement (autorise par Stephane), signaux sur la fiche de demo dist-007, purge des signaux et des sessions a la fin. Verification visuelle possible via le MCP Playwright (`.mcp.json`).

## Architecture

### Chargement et init (`js/app.js`)

`index.html` charge les CDN puis `js/app.js` (seul point d'entree). Au `DOMContentLoaded` :
1. `initSupabase()` (client cree seulement si le CDN est dispo, sinon mode hors-ligne) puis `initAuth()`
2. Chargement de l'etat localStorage
3. `loadDistributors()` lance **en parallele** de l'overlay de geolocalisation (pour que le deep link `?id=<distId>` ouvre la fiche avant le consentement geoloc)
4. Apres geoloc : carte, side panel, filtres, geofence, notifications. Les vignettes photos et signalements Supabase sont en fire-and-forget (ne jamais les `await` : un Supabase injoignable gelait l'init)

**Source des distributeurs, par priorite** : Supabase `distributors` (+ `products`) -> `fetch('data/distributors.json')` -> `EMBEDDED_DATA` (`js/state.js`, fallback `file://`). Puis fusion des distributeurs ajoutes localement (`snackmatch_user_distributors`) avec dedup par id **et** par signature nom+coords. **EPIC-T9** (quand la base a repondu) : une copie locale d'une machine de la base (meme nom normalise a moins de 100 m, `findLocalDuplicates`) est retiree du telephone ; les machines vraiment locales sont marquees `isLocalOnly` (fiche : bandeau « enregistree seulement sur ton telephone », signaux / avis / photo / modifier masques, bouton « Publier cette machine » -> `publishDistributor`, add-distributor.js). Un echec d'envoi a l'ajout n'est plus avale (toast). Attention : avec Supabase, `typeConfig` vient de `EMBEDDED_DATA`, pas du JSON.

### Modules JS (`js/`)

```
app.js             - Point d'entree, init, chargement donnees, listeners, window globals, UI auth (refreshAuthUI)
state.js           - Etat global mutable (AppState, Conversations, UserProfile, NotificationPrefs, AddMode...), constantes, EMBEDDED_DATA
config.js          - Cles PUBLIQUES uniquement (Supabase anon key, sitekeys hCaptcha), isLocalhost(), FEATURES (interrupteurs produit : `chat`, `photos` ; tous deux `false` en V1 : photos inactives = ni bouton Photo, ni galerie, ni vignettes, ni photo a l'ajout, EPIC-T14)
auth.js            - Magic link Supabase + hCaptcha, requireAuth()/isAuthenticated()/onAuthChange()
gmaps-ui.js        - UI principale style Google Maps : side panel liste filtree (groupes par distance) + modal fiche distributeur a onglets, deep link, partage, auth gate edition
map.js             - Carte Leaflet, marqueurs (marker.distributorId), popups ; pastilles qui se chevauchent sous le doigt (40 px au doigt, 24 px a la souris, `pinsNear` utils.js) -> menu « N distributeurs ici » (EPIC-T26) ; ouvrir une fiche ne dezoome jamais ; zoom d'un seul doigt (double toucher + glisser, `enableOneFingerZoom`, `zoomFromDrag` utils.js ; remplace le double toucher Leaflet sur ecran tactile) ; `locateOnMap(id)` (EPIC-T23) : epingle « Voir sur la carte » de la fiche -> fiche et liste fermees, carte centree (zoom 17), filtre de type masquant leve, halo `.is-located` 3,2 s qui survit a une re-creation des pastilles
navigation.js      - switchView/switchTab (VIEW_CONFIG + registerViewCallback), sidebar, recherche, filtres
distributor.js     - Rendu des cartes produit (`renderProductsList` / `renderProductRow` / `renderAddCard`, pictos), photos, abonnements (favoris)
fiche-edit.js      - Modifier une fiche sans bouton (EPIC-T12 / T16) : menu deroulant de l'etiquette (Dispo / Pas dispo, separateur, Renommer, Retirer en rouge ; « Actuellement : Pas d'info » en tete sans signal), renommer (le nom devient un champ avec suggestions, vide / Echap = annule), retirer (toast « Annuler » 7 s, DELETE seulement a la fin du delai), ajouter (carte « + Ajouter un produit » -> panneau : 4 produits courants du type en pastilles + champ « Autre… » avec suggestions, EPIC-T13 ; listes `PRODUCT_SUGGESTIONS`, `suggestProducts` / `searchProductSuggestions` dans utils.js, sans produit regional), prix (toucher « €€ »), visiteur -> invitation, indice de premier usage (`distrimatch_edit_hint_seen`). `ficheEditRights` / `renderFicheProducts` / `markFicheEditUsed`
add-distributor.js - Mode ajout distributeur (placement carte, formulaire, upload photos)
chat.js            - Chatbot par distributeur : INACTIF (`FEATURES.chat = false`). Aucun point d'entree n'y mene (recherche, notifications et bandeau ouvrent la fiche). Code conserve, reactivable par le flag
availability.js    - Signaux de dispo sur la fiche (UC11, EPIC-T2/T5/T10) : ligne d'etat discrete sous le nom (mini-feu + « En service / Vide / En panne / Pas d'info » + age) et cartes produit teintees triees Dispo -> Pas d'info -> Pas dispo, via `resolveProductStatus` / `resolveMachineStatus` / `describeFicheHero` / `describeMachineNotice` / `productToneRank` (utils.js, pures). Connecte seulement : toucher la ligne d'etat ouvre un menu deroulant ancre En service / Vide / En panne (EPIC-T19, etat actuel coche, « Actuellement : Pas d'info » en tete ; visiteur -> invitation, `data-guest` ; local -> `aria-disabled`) ; carte touchable -> « Dispo / Pas dispo » (deja deplie si l'info a plus de 2 h ou n'existe pas). Session renouvelee puis renvoi si l'envoi echoue (EPIC-T6, plus de renvoi anonyme). QR `&confirm=1` -> encadre de connexion (visiteur) ou liste mise en avant (`focusSignalFromQr`). Coup de pouce sur place (EPIC-T17, `checkNearbyForFiche`, appele par `applyFicheAuthState`) : membre connecte a 15 m (distance - precision GPS, precision <= 30 m, position relue a l'ouverture) -> « Tu es sur place : N produits à vérifier » + anneau bleu sur ce qui date (> 2 h ou jamais), carte d'ajout si aucun produit, « Mettre à jour » si l'etat date ; rien n'est envoye seul (`isNearDistributor` / `describeNearbyNudge`, utils.js)
reviews.js         - Avis (EPIC-T8) : onglet Avis de la fiche (liste paginee 10 par 10, « Voir plus »), formulaire « Mon avis » en connecte (note 1..5 + commentaire <= 500, modifier / supprimer), invitation en visiteur ; note de tete `renderRatingHeader` depuis la vue `distributor_ratings` (fusionnee au chargement dans `loadDistributorsFromSupabase`, app.js). Aides pures `describeRating` / `validateReview` / `describeReviewError` (utils.js)
operators.js       - Exploitants (EPIC-T18, migration 020) : etat du compte relu a la connexion (`my_operated_distributors`, demandes en attente, `is_admin` -> entree « Admin » du menu avatar), tag « Exploitant vérifié » (`d.hasOperator`, pose au chargement depuis `distributor_operators`), bloc « C'est ton distributeur ? » de « À propos » (EPIC-T20 : formulaire leger lien + entreprise + message, SANS SIRET -> `operator_requests`), puis page « Ma demande » (vue `operator-request` : statut, barre 4 etapes, « Ce qu'il te reste à faire » = SIRET quand l'equipe le demande / code a 5 chiffres recu par courrier, echange direct ; relue toutes les 30 s, pas de push). `renderOperatorProgress` / `renderOperatorThread` partages avec la console. « Info de l'exploitant » sur un signal source 'owner' : availability.js
admin.js           - Console admin (vue `admin`, comptes `app_admins`, EPIC-T20) : liste (etat, « À toi », non lus) ; detail = prochaine etape (Demander le SIRET / Envoyer le code par courrier -> carte imprimable / Renvoyer) + « Autres actions » (code par telephone, valider sans code, refuser avec motif) + registre SIRENE lu dans le navigateur (API publique recherche-entreprises.api.gouv.fr, `assessSirene` dans utils.js : nom, adresse, etat, dirigeants, distance, verdict) + echange direct ; exploitants Retirer. Les fonctions `admin_*` de la base refusent tout non-admin
summaries.js       - Etat + stock de chaque distributeur pour la carte et la liste (EPIC-T19) : lectures anonymes de `distributor_status` / `product_availability` au chargement, `setSummaryFor` apres un signal (availability.js), `describeDistributorSummary` (utils.js, memes regles que la fiche), `renderStatusRing` : anneau couleur de l'etat qui se remplit selon la part de produits dispo, pointille gris = Pas d'info, pale > 2 h, sans chiffre ; evenement `distrimatch:summaries` -> map.js (pastilles, favori = petit coeur) et gmaps-ui.js (liste : anneau + « En service · 1 sur 4 dispo »)
additions.js       - « Mes ajouts » (EPIC-T21) : fiches ajoutees par le compte (En attente / Publiée / Refusée [: motif]) et echange direct avec l'equipe (`distributor_review_messages`, `post_review_message`) ; ligne Compte, vue `my-additions`. La console (admin.js) a une section « Nouveaux distributeurs » : mini-carte Leaflet (repere deplacable), nom, type, produits, auteur, alerte doublon (`findNearbyDuplicates`), Publier (corrections) / Refuser (motif facultatif) / Ecrire au membre
my-activity.js     - « Mon activité » (EPIC-T22) : onglet Activite = historique du compte via la RPC `my_activity()` (signaux, ajouts, avis, demandes d'exploitant), filtres Tout / Signaux / Ajouts / Avis, une ligne ouvre la fiche, visiteur -> invitation ; libelles par `describeActivityItem` (utils.js). Plus de points ni de « Confirmer / Infirmer »
activity.js        - ANCIEN fil local (signalements + votes) : plus affiche (EPIC-T22), garde pour les imports existants ; `updateActivityBadge` ne montre plus de pastille
notifications.js   - Geofencing, heures calmes, cooldown, produits suivis, centre de notifications (une ligne ouvre la fiche), notifyFavoriteEvent
favorites-watch.js - Veille des favoris : a l'ouverture, au retour d'onglet et toutes les 5 min, compare les vues `distributor_status` / `product_availability` au dernier etat vu (`NotificationPrefs.lastSeenSignals`) via `diffFavoriteSignals` (utils.js, pure) -> notification vide / en panne / de nouveau en service / produit suivi vu dispo / de nouveau dispo. Premier passage muet, son propre signal jamais notifie (`rememberOwnSignal`), un appel pendant un controle relance un controle. Pas de push ni de Realtime
push.js            - Notifications app fermee (EPIC-T25) : abonnement SANS compte lie au telephone (RPC `push_subscribe` / `push_unsubscribe`, migration 024 : favoris, produits suivis, heures calmes, fuseau ; compte connecte memorise pour ne pas notifier son propre signal), invitation « Être prévenu même app fermée ? » au PREMIER coeur seulement (`distrimatch_push_asked`, jamais a l'ouverture), guide iPhone « Ajoute DistriMatch à ton écran d’accueil » (`needsHomeScreenForPush`, utils.js), interrupteur « Prévenu même app fermée » des reglages, resynchronise a chaque changement de favoris / produits suivis / reglages / compte, efface par « Effacer mes données ». Envoi : declencheur sur `availability_signals` -> pg_net -> fonction serveur `supabase/functions/push-notify` (logique pure partagee avec les tests : `logic.js`, memes textes que `buildFavoriteMessage`, anti-rafale 30 min, heures calmes, signaux de demo ignores)
fiche-sheet.js     - Fiche en feuille du bas sur telephone (EPIC-T26, <= 768 px) : mi-hauteur (58 %) a l'ouverture, carte visible et touchable au-dessus (pastille choisie `is-selected`, carte recentree au-dessus de la feuille par `centerAboveSheet`, map.js), poignee `#dist-sheet-handle` a tirer (haut = plein ecran, bas = fermer) ou a toucher (bascule), defiler le contenu deplie ; toucher la barre du haut ferme ; plein ecran sans carte (deep link). Grand ecran inchange
focus-trap.js      - Piege a focus + Echap pour toutes les vraies modales (a reutiliser pour toute nouvelle modale)
utils.js           - escapeHTML, distances, showToast, persistance localStorage, profil implicite, geoloc
```

- Les `set*()` de `state.js` existent car les `export let` ne sont pas reassignables depuis un autre module.
- Les fonctions appelees depuis des `onclick` inline dans le HTML genere sont exposees sur `window` dans `app.js` : **toute nouvelle fonction utilisee en inline doit y etre ajoutee**. `window.showDetails` est un alias legacy de `openDistributorModal`.

### CSS (`css/`)

5 fichiers, **l'ordre des `<link>` dans `index.html` est strict** (le cascade en depend) : `base.css` (variables, reset, top nav, sidebar) -> `map.css` (carte, markers, filter bar, mode ajout) -> `panels.css` (chat, pages overlay, modals, boutons) -> `feed-and-nav.css` (toast, responsive, bottom nav, activite, notifs) -> `overlays.css` (geoloc, loader, auth modal, side panel + dist modal).

### Cache-busting (important)

Pas de build : les assets sont versionnes a la main via `?v=N` dans `index.html`.
- **CSS** : bumper le `?v=` du `<link>` du fichier modifie.
- **Modules JS** : une **import map** dans `index.html` mappe chaque module de `js/` vers `./js/<fichier>.js?v=N` (`app.js` compris, charge par un `import` inline, plus de `src="js/app.js"`). **Toute modification d'un module de `js/` = bumper le `?v=` de TOUTES les entrees de l'import map a la meme valeur.** Le test `cache-busting` de `tests/unit.test.js` echoue si un module importe manque dans la map, si les versions divergent, ou si une entree pointe vers un fichier absent. Import maps : Chrome 89+, Firefox 108+, Safari 16.4+.

### Supabase (`supabase/`)

Migrations SQL numerotees, a executer par `node scripts/supabase-sql.mjs supabase/<fichier>.sql` (API de gestion, jeton dans `.env.local`) ou en les collant dans le SQL Editor du dashboard (pas de CLI Supabase) : `001_schema`, `002_seed`, `003_photos`, `004_rls_hardening` (RPC `submit_report`/`cast_vote` refusent l'anonyme), `005_open_writes_for_authenticated` (tout user authentifie peut editer `products` et le `price_range` d'un distributeur, modele collaboratif ; pas de DELETE sur `distributors`/`distributor_photos`), `006_audit_trail` (`updated_at`/`modified_by` par trigger), `007_availability_signals` (table `availability_signals` + vues `product_availability`/`distributor_status` + RPC `confirm_availability` ouverte a l'anonyme avec rate limit, rafraichit `last_verified` ; cf. UC11), `008_events_kpi_rhythm` (table `events` + RPC `log_event` anonyme anti-spam, vues KPI `kpi_*` en agregats, vue `product_rhythm` par tranche horaire locale, colonne `distributors.tz`), `009_demo_data` (fonctions `seed_demo_signals()` / `purge_demo_data()` reservees au SQL Editor : jeu de signaux et d'evenements fictifs marques `demo-`, regenerable, a purger avant le vrai pilote), `010_is_demo` (colonne `distributors.is_demo` + trigger `guard_is_demo` qui empeche l'API de la poser ou de la changer, `seed_demo_signals()` / `purge_demo_data()` limitees aux fiches demo, `kpi_coverage.machines_demo`, `kpi_top_distributors.is_demo`), `011_machine_working` (etat machine `working` « Ça fonctionne » accepte par la contrainte et la RPC `confirm_availability` ; anti-doublon machine par etat : un appareil peut corriger « vide » en « fonctionne » dans l'heure), `012_product_dedup_by_state` (meme regle pour les produits : « Il y en a » puis « Plus rien » dans l'heure est retenu), `013_distributor_update_columns` (UPDATE sur `distributors` limite a la colonne `price_range` pour `authenticated`, rien pour `anon` : un compte connecte ne renomme ni ne deplace une fiche par l'API), `014_signals_require_account` (signal = compte obligatoire, 20 / heure / compte, comptes bloques `signal_bans`, fonctions admin `purge_user_signals` / `unban_user` non exposees a l'API), `015_e2e_test_account` (compte de test des E2E connectes, sans mot de passe), `016_reviews` (table `reviews`, RLS + droits par colonne, trigger `guard_review` : compte obligatoire, 10 avis / heure / compte, comptes bloques (`signal_bans` partagee), auteur force ; vue `distributor_ratings` = la note affichee ; admin : `seed_demo_reviews()`, `purge_user_reviews(user_id)`, `purge_demo_data()` etendue aux avis), `018_distributor_source` (colonne `source` 'user' / 'osm' / 'demo', trigger `guard_distributor_source` : l'API ne pose que 'user'), `017_demo_nightly` (pg_cron : job `distrimatch-demo-nightly` a 02:00 UTC = `seed_demo_signals(14)`, la demo garde des signaux des dernieres heures ; avant le vrai pilote : `select cron.unschedule('distrimatch-demo-nightly'); select purge_demo_data();`), `019_opening_hours` (colonne `opening_hours`, texte au format OSM rempli par `import-osm.mjs` qui le remet a jour sur les fiches OSM deja importees ; l'API ne le pose ni ne le change, trigger `guard_distributor_hours`), `020_operators` (EPIC-T18 : `operator_requests`, `distributor_operators` (seul `distributor_id` lisible), `app_admins` + `is_admin()`, fonctions `admin_*` / `my_operated_distributors()`, trigger `mark_owner_signal` (signal d'un exploitant = source 'owner', poids 1), vues `product_availability` / `distributor_status` : le plus recent gagne sauf exploitant contredit a moins de 30 min ; designer un admin : `insert into app_admins select id from auth.users where email = '...'`), `021_operator_verification` (EPIC-T20, « methode Google » : etats pending -> siret_requested -> siret_received -> code_sent -> approved | rejected ; fil `operator_request_messages` (member / admin / system) via `post_operator_message` ; `submit_operator_siret` (cle de Luhn `siret_is_valid`) ; `admin_send_operator_code` genere un code a 5 chiffres stocke en bcrypt, rendu une fois a l'admin, 30 jours ; `verify_operator_code` 5 essais (retour jsonb, pas d'erreur) ; `admin_request_siret`, `admin_reject_operator_request`, `mark_operator_request_read` ; le code et le SIRET ne sont jamais publics), `022_distributor_review` (EPIC-T21 : `distributors.review_status` pending / published / rejected ; un ajout par l'API est toujours pending (trigger, 5 / jour / compte) ; lecture : publiee pour tous, l'auteur voit les siennes, l'admin tout ; produits filtres par leur fiche ; signaux / avis / demandes d'exploitant refuses sur une fiche non publiee ; `admin_pending_distributors()`, `admin_review_distributor(id, 'publish'|'reject', motif, nom, type, emoji, lat, lng)`. ATTENTION : toute regle RLS lisible par `anon` qui appelle une fonction exige `grant execute ... to anon` (incident du 2026-10-02 : `is_admin()` non executable par anon = plus aucune fiche lisible pendant ~1 min)), `023_activity_privacy` (EPIC-T22 : l'API ne lit plus `user_id` ni `device_hash` d'`availability_signals` (avant : on pouvait relier un signal a un compte) ; `my_activity()` = journal du compte), `024_push_notifications` (EPIC-T25 : `push_subscriptions` / `push_sent` illisibles par l'API, RPC anonymes `push_subscribe` / `push_unsubscribe` (l'adresse d'abonnement sert de secret), declencheur `notify_push_on_signal` -> pg_net -> fonction `push-notify` ; URL et secret partage dans le Vault (`push_notify_url`, `push_trigger_secret`) ; sans eux, ou si l'appel echoue, le signal passe toujours ; secrets de la fonction : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_TRIGGER_SECRET`, valeurs dans `.env.local`, jamais dans le depot). Tables utilisees par le front : `distributors`, `products`, `distributor_photos`, `reports`, `votes`, `reviews` (+ vues `distributor_status`, `product_availability`, `product_rhythm`, `distributor_ratings`).

Projet free-tier : s'il est en pause, les appels echouent en `ERR_NAME_NOT_RESOLVED` et l'app retombe sur le JSON/EMBEDDED_DATA - verifier le dashboard avant de chercher un bug.

### Persistance localStorage

Cles : `snackmatch_user` (abonnements/favoris, points ; migration auto `favorites` -> `subscriptions` dans `loadFromLocalStorage()`), `snackmatch_profile`, `snackmatch_conversations`, `snackmatch_activity`, `snackmatch_user_distributors`, `snackmatch_notification_prefs`, `snackmatch_notification_queue`. Flag dev : `distrimatch_force_auth`.

### Types de distributeurs

Definis a 3 endroits a garder coherents : `DISTRIBUTOR_TYPES` et `EMBEDDED_DATA.typeConfig` (`js/state.js`), `typeConfig` de `data/distributors.json`, et les chips `data-type` de `index.html`. Types actuels des chips : `pizza`, `bakery`, `fries`, `meals`, `cheese`, `dairy`, `agricultural`, `meat`, `terroir`, `ice`, `other` (+ `general` dans les donnees).

Format distributeur : `id`, `name`, `type`, `emoji`, `address`, `city`, `lat`, `lng`, `rating`, `reviewCount`, `status` (verified/warning), `priceRange`, `isDemo` (lecture seule : vient de `is_demo`, jamais envoye), `products[]` (id, name, price, available). Mapping snake_case Supabase -> camelCase dans `mapDistributorRow()` (utils.js).

## Politique d'authentification

**Regle structurante** : auth obligatoire des qu'une ecriture **impacte les autres utilisateurs** (visible publiquement, agregee, moderable). Auth libre pour ce qui n'affecte que **son propre appareil**. Lectures toujours anonymes.

| # | Categorie | Use case | Auth ? | Storage |
|---|---|---|:-:|---|
| UC1 | Contribution publique | Ajouter un nouveau distributeur (en attente de validation par l'admin, EPIC-T21) | OUI | Supabase `distributors` (022 : review_status pending, 5 / jour / compte) |
| UC2 | Contribution publique | Produits au toucher (ajouter / renommer / retirer) et niveau de prix, sans mode edition (EPIC-T12) | OUI | Supabase `products` (005), `distributors.price_range` (013) |
| UC3 | Contribution publique | Upload photo sur distributeur existant | OUI | Supabase storage + `distributor_photos` |
| UC4 | Contribution publique | Signalement / vote pour un signalement | OUI | Supabase RPC + ActivityFeed local |
| UC4b | Contribution publique | Deposer / modifier / supprimer SON avis (note + commentaire) | OUI | Supabase `reviews` (016) : RLS sur son propre avis, un avis par compte et par machine, 10 / heure / compte, comptes bloques refuses, auteur « Membre DistriMatch » force |
| UC4c | Contribution publique | Demander le statut d'exploitant ; echange direct avec l'admin, SIRET puis code par courrier a l'adresse SIRENE (EPIC-T20) ; l'admin valide / refuse / retire | OUI (admin pour decider) | Supabase `operator_requests` / `operator_request_messages` / `distributor_operators` (020, 021) : une demande en cours par fiche, 5 / jour / compte, 30 messages / heure, comptes bloques refuses |
| UC5 | Sociale locale | Mettre / retirer favori (coeur) | non | localStorage `snackmatch_user` |
| UC6 | Sociale locale | Suivre un produit (alertes dispo) ; un favori notifie quand sa machine change (lectures anonymes, etat vu stocke localement) ; notifications app fermee (EPIC-T25) | non | localStorage `snackmatch_notification_prefs` ; abonnement app fermee : Supabase `push_subscriptions` via RPC anonymes (024), sans compte |
| UC7 | Sociale locale | Discuter avec le bot d'un distributeur (**inactif**, `FEATURES.chat`) | non | localStorage `snackmatch_conversations` |
| UC8 | Preference perso | Prefs notifs (heures calmes, geofence) | non | localStorage |
| UC9 | Preference perso | Marquer notif lue / supprimer notif | non | localStorage |
| UC10 | Preference perso | Reinitialiser ses donnees (clear data) | non | localStorage (confirm() suffit) |
| UC11 | Signal de fraicheur | Signal de dispo par produit (Dispo / Pas dispo) ou du distributeur (En service / Vide / En panne), en un tap | **OUI** (depuis 2026-09-25 : interface EPIC-T5 + base EPIC-T6) | Supabase RPC `confirm_availability` (007, 011, 012, 014) : compte obligatoire (28000 sinon), 20 signaux / heure / compte, anti-doublon par compte et par etat, compte bloque refuse (42501), poids 0.8, aucune ecriture directe dans la table |

UC11 : **decision Stephane 2026-09-25 (EPIC-T5) : informer est un privilege de compte**, comme modifier. Un visiteur lit tout (etat du distributeur, dispo des produits) et voit « Tu es devant le distributeur ? Connecte-toi pour signaler ce qu'il reste, donner ton avis et ajouter des photos » ; un connecte voit « Mettre à jour » (etat), les cartes produit touchables, Photo et Modifier. L'ancienne exception anonyme (cf. `docs/STRATEGIE.md` : un horodatage a poids reduit, sans friction devant la machine) est levee **aussi cote base** (EPIC-T6, migration 014, crainte de l'abus « pour s'amuser ») : la limite par appareil se contournait, l'identifiant etant fabrique par le telephone. Anti-abus : limite par compte, `signal_bans` + `purge_user_signals(user_id, bloquer, raison)` / `unban_user(user_id)` reservees a l'admin (mode d'emploi en fin de 014). Session morte (28000 / 401) : l'app renouvelle la session et renvoie une fois, sinon « Ta session a expiré : reconnecte-toi » + `promptReconnect()` (auth.js) ; plus de renvoi anonyme. Revenir au signal anonyme = rouvrir la RPC (reprendre 012) et afficher les controles sans condition dans `applyFicheAuthState()` (gmaps-ui.js) et `renderProductsList(..., { canInform })`.

**Mecanismes** :
- `window.__testLogin()` / `window.__testLogout()` (auth.js, **localhost uniquement**) : simulent un compte connecte pour les e2e (`loginForTest(page)`), le magic link ne pouvant aboutir en local. Les appels Supabase restent anonymes.
- `requireAuth()` (auth.js) : modale email + magic link. **Bypass automatique sur localhost** (le magic link ne peut pas rediriger en local) sauf si `localStorage.distrimatch_force_auth='1'` - c'est ce que font les tests e2e qui verifient le mur d'auth.
- `isAuthenticated()` (auth.js) : check synchrone sans prompt.
- `showEditAuthGate()` (gmaps-ui.js) : modale pedagogique "Connexion requise" -> page Compte. Utilisee par UC3 (Photo). UC2 (modifier au toucher) : en visiteur, toucher une etiquette, « + Ajouter » ou le prix met en avant l'invitation `#dist-login-invite` (fiche-edit.js).
- RLS Supabase : `auth.uid() = user_id` sur les INSERT ; les RPC `SECURITY DEFINER` doivent verifier `auth.uid()` eux-memes (cf. `004_rls_hardening.sql`).

**Avant d'ajouter un bouton qui modifie** : classer le use case (public / social-local / pref-perso) et appliquer le bon pattern. En cas de doute -> auth requise.

## Conventions

- Fonctions `camelCase` (declarations nommees, pas d'arrow), constantes `UPPER_SNAKE_CASE`, CSS `kebab-case` ; `const`/`let` uniquement ; early return
- Try/catch pour localStorage et fetch/Supabase
- **XSS** : `escapeHTML()` sur tout contenu dynamique injecte via `innerHTML` (y compris dans les attributs)
- DOM : pas de `innerHTML +=` en boucle ; delegation d'evenements sur les conteneurs ; identifier les marqueurs par `marker.distributorId`, jamais par lat/lng
- UI en francais ; commentaires/source sans accents (les chaines UI recentes peuvent en contenir) ; mobile-first ; feedback via `showToast()`
- Nouvelle modale : utiliser `activateFocusTrap`/`deactivateFocusTrap` (le handler Echap global d'`app.js` ne couvre que les overlays non modaux)
- Pas de territoire en dur : l'app a vocation a s'etendre hors Cote Basque, toute nouvelle fonctionnalite doit marcher ailleurs (pas de ville, monnaie, langue ni type de machine code en dur ; cf. `docs/STRATEGIE.md`)

## Workflow

- Remotes : `github` (SKenea/DistriMatch : PR, merge, GitHub Pages) et `origin` (GitLab, historique). Branches `feat/...`, `fix/...`, commits conventionnels.
- `BACKLOG.md` : backlog priorise avec acceptance criteria, consomme par le skill `/auto` (implementation -> `npm test` -> e2e -> PR -> merge -> suivi deploy Pages).
- `docs/STRATEGIE.md` : le cap produit (fraicheur horodatee = le produit, producteur passif, signal de dispo par produit anonyme en un tap). Y trancher toute hesitation d'implementation ; le backlog en decoule.

## Points d'attention

- La carte exige la geolocalisation (decision Stephane 2026-09-25) : pas de « continuer sans position ». Seul un deep link (`?id=`, QR) montre la fiche avant le consentement ; la fermer ramene l'ecran de geolocalisation.
- Plus de bouton « Modifier » ni de mode edition (EPIC-T12, decision Stephane 2026-10-01 : « je ne veux pas de bouton »). On modifie la fiche au toucher (fiche-edit.js) : l'etiquette (fleche) d'une carte ouvre un seul menu deroulant (EPIC-T16) : Dispo / Pas dispo (signal, availability.js, etat actuel coche ; « Pas d'info » n'est pas un choix), Renommer, Retirer avec « Annuler » ; le nom n'est jamais touchable, plus d'appui long ; carte « + Ajouter un produit » ; « €€ » touchable. Toute action par geste a une voie en un toucher (WCAG 2.5.1 / 2.5.7). Une seule notion de dispo : le signal ; `products.available` n'est plus lu (ni ecrit par l'app, sauf `true` a l'insertion). `openDistributorModal(id)` ignore ses anciens parametres `editMode` / `canEdit`.
- Horaires (EPIC-T17) : `describeOpeningHours` (utils.js) lit le format OSM (24/7, « Mo-Fr 08:00-19:00; Sa ... », plages apres minuit, PH ignores) dans le fuseau `distributors.tz` : « Ouvert 24 h/24 » / « Ouvert · ferme à » / « Fermé · ouvre à » sous la ligne type / prix / note (`#dist-modal-hours`), semaine dans « À propos » (`#dist-apropos-hours`) ; format inconnu = texte brut dans « À propos » seulement. Statuts d'utilisateurs a venir (lots 2-3 d'EPIC-T17 : Exploitant, Membre fiable), cf. BACKLOG.
- Structure de la fiche (EPIC-T10, fiche v3, maquette `docs/maquettes/2026-09-30-v3/vitrine-b-teintee.html`) : les produits d'abord, l'etat en discret, chaque information a une seule place. Plus de bandeau d'etat : sous le nom, une ligne `#dist-status` (mini-feu tricolore vert / orange / rouge, eteint si Pas d'info, + mot + age, adoucie au-dela de 2 h). « Il reste quoi ? · N sur M dispo » puis une grille 2 colonnes de cartes teintees (`.product-row`, une seule carte pour tous les etats : vert pale Dispo, gris pale Pas dispo, blanc Pas d'info ; picto neutre choisi par `productIconKey` d'apres le nom ; nom en noir ; ligne d'age toujours presente). Vide / en panne : un seul liseré `#dist-products-notice`. Favori / Partager en icones dans l'en-tete ; « Itinéraire » dans l'onglet « À propos », sous l'adresse (EPIC-T14, plus de pied colle en bas). Photos inactives en V1 (`FEATURES.photos`).
- Vocabulaire de la fiche (decisions Stephane 2026-09-25 et 2026-09-30) : trois mots par aliment (« Dispo », « Pas dispo », « Pas d'info »), et on signale avec les memes mots (« Dispo / Pas dispo », plus « Il y en a / Plus rien ») ; distributeur « En service / Vide / En panne / Pas d'info » (plus « Fonctionne ») ; jamais « catalogue » ; **jamais le mot « machine » dans un texte de la fiche** (test unitaire garde-fou). Le mot repond, la couleur dit la confiance (vive < 2 h, adoucie jusqu'a 24 h). « Pas d'info » = aucun signal depuis 24 h (ou jamais). Un distributeur vide / en panne plus recent que le signal d'un aliment le passe en « Pas dispo ». En base, les etats restent `working` / `empty` / `broken` et `available` / `absent`.
- `sw.js` ne sert QU'aux notifications app fermee (EPIC-T25) et efface les anciens caches : ne jamais y ajouter de gestionnaire fetch ni de cache sans plan de cache. Sur iPhone, les notifications ne marchent qu'une fois l'app ajoutee a l'ecran d'accueil.
- `data/distributors.json` et `EMBEDDED_DATA` sont des fallbacks ; en prod la verite est Supabase.
- Fiches OpenStreetMap retirees le 2026-10-02 (types non souhaites par Stephane) : `scripts/import-osm.mjs` est garde mais ne doit pas etre relance sans son accord. Une fiche « privee » (`isPrivateFiche` : seulement locale ou pas encore publiee) n'a ni signal, ni avis, ni exploitant, ni modification.
- Toute donnee fictive est identifiable : une fiche l'est par `distributors.is_demo` (ses produits, photos et signalements le sont par jointure), un signal ou un evenement par `device_hash LIKE 'demo-%'`, un avis par `user_id IS NULL` (seul `seed_demo_reviews()` peut en creer, uniquement sur les fiches demo). La note affichee vient de la vue `distributor_ratings` ; les colonnes `rating` / `review_count` ne servent plus qu'a calibrer le seed des avis. Le front affiche un tag « Démo » et ne modifie jamais `is_demo`. Purge du jour J : `DELETE FROM distributors WHERE is_demo` (cascade) + Storage, cf. `supabase/010_is_demo.sql`.
