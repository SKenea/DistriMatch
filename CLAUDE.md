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
- PWA (manifest.json) ; service worker volontairement desactive
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
```

Quand lancer quoi : `npm test` a chaque modification ; `test:integration` des qu'une migration ou une regle de la base change ; `test:functional` avant chaque PR (le skill `/auto` le fait) ; `test:e2e` apres chaque deploiement Pages (il vise le site en ligne). Les tests fonctionnels injectent une geoloc Bayonne et pilotent l'app via les globals `window.AppState` / `window.openDistributorModal` ; aides partagees dans `tests/functional/helpers.js` (`setupApp`, `loginForTest`, `openSignalableFiche`, `routeSignals`...). Le E2E connecte (vrai compte de test) est BLOQUE (BACKLOG EPIC-T7 T7-US4b). Verification visuelle possible via le MCP Playwright (`.mcp.json`).

## Architecture

### Chargement et init (`js/app.js`)

`index.html` charge les CDN puis `js/app.js` (seul point d'entree). Au `DOMContentLoaded` :
1. `initSupabase()` (client cree seulement si le CDN est dispo, sinon mode hors-ligne) puis `initAuth()`
2. Chargement de l'etat localStorage
3. `loadDistributors()` lance **en parallele** de l'overlay de geolocalisation (pour que le deep link `?id=<distId>` ouvre la fiche avant le consentement geoloc)
4. Apres geoloc : carte, side panel, filtres, geofence, notifications. Les vignettes photos et signalements Supabase sont en fire-and-forget (ne jamais les `await` : un Supabase injoignable gelait l'init)

**Source des distributeurs, par priorite** : Supabase `distributors` (+ `products`) -> `fetch('data/distributors.json')` -> `EMBEDDED_DATA` (`js/state.js`, fallback `file://`). Puis fusion des distributeurs ajoutes localement (`snackmatch_user_distributors`) avec dedup par id **et** par signature nom+coords. Attention : avec Supabase, `typeConfig` vient de `EMBEDDED_DATA`, pas du JSON.

### Modules JS (`js/`)

```
app.js             - Point d'entree, init, chargement donnees, listeners, window globals, UI auth (refreshAuthUI)
state.js           - Etat global mutable (AppState, Conversations, UserProfile, NotificationPrefs, AddMode...), constantes, EMBEDDED_DATA
config.js          - Cles PUBLIQUES uniquement (Supabase anon key, sitekeys hCaptcha), isLocalhost(), FEATURES (interrupteurs produit : `chat`)
auth.js            - Magic link Supabase + hCaptcha, requireAuth()/isAuthenticated()/onAuthChange()
gmaps-ui.js        - UI principale style Google Maps : side panel liste filtree (groupes par distance) + modal fiche distributeur a onglets, deep link, partage, auth gate edition
map.js             - Carte Leaflet, marqueurs (marker.distributorId), popups
navigation.js      - switchView/switchTab (VIEW_CONFIG + registerViewCallback), sidebar, recherche, filtres
distributor.js     - CRUD produits, photos, abonnements (favoris)
add-distributor.js - Mode ajout distributeur (placement carte, formulaire, upload photos)
chat.js            - Chatbot par distributeur : INACTIF (`FEATURES.chat = false`). Aucun point d'entree n'y mene (recherche, notifications et bandeau ouvrent la fiche). Code conserve, reactivable par le flag
availability.js    - Signaux de dispo sur la fiche (UC11, EPIC-T2/T5) : statut de chaque aliment (« Dispo / Pas dispo / Pas d'info ») et etat de la machine en grand dans le bandeau, via `resolveProductStatus` / `resolveMachineStatus` / `describeFicheHero` (utils.js, pures). Connecte seulement : boutons « Fonctionne / Vide / En panne » (etat actuel colore) et aliment touchable (« Il y en a / Plus rien »). Session renouvelee puis renvoi si l'envoi echoue (EPIC-T6, plus de renvoi anonyme). QR `&confirm=1` -> encadre de connexion (visiteur) ou liste mise en avant (`focusSignalFromQr`)
activity.js        - Feed activite, signalements + votes (RPC Supabase)
notifications.js   - Geofencing, heures calmes, cooldown, produits suivis, centre de notifications (une ligne ouvre la fiche), notifyFavoriteEvent
favorites-watch.js - Veille des favoris : a l'ouverture, au retour d'onglet et toutes les 5 min, compare les vues `distributor_status` / `product_availability` au dernier etat vu (`NotificationPrefs.lastSeenSignals`) via `diffFavoriteSignals` (utils.js, pure) -> notification vide / en panne / de nouveau en service / produit suivi vu dispo / de nouveau dispo. Premier passage muet, son propre signal jamais notifie (`rememberOwnSignal`), un appel pendant un controle relance un controle. Pas de push ni de Realtime
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

Migrations SQL numerotees, a executer par `node scripts/supabase-sql.mjs supabase/<fichier>.sql` (API de gestion, jeton dans `.env.local`) ou en les collant dans le SQL Editor du dashboard (pas de CLI Supabase) : `001_schema`, `002_seed`, `003_photos`, `004_rls_hardening` (RPC `submit_report`/`cast_vote` refusent l'anonyme), `005_open_writes_for_authenticated` (tout user authentifie peut editer `products` et le `price_range` d'un distributeur, modele collaboratif ; pas de DELETE sur `distributors`/`distributor_photos`), `006_audit_trail` (`updated_at`/`modified_by` par trigger), `007_availability_signals` (table `availability_signals` + vues `product_availability`/`distributor_status` + RPC `confirm_availability` ouverte a l'anonyme avec rate limit, rafraichit `last_verified` ; cf. UC11), `008_events_kpi_rhythm` (table `events` + RPC `log_event` anonyme anti-spam, vues KPI `kpi_*` en agregats, vue `product_rhythm` par tranche horaire locale, colonne `distributors.tz`), `009_demo_data` (fonctions `seed_demo_signals()` / `purge_demo_data()` reservees au SQL Editor : jeu de signaux et d'evenements fictifs marques `demo-`, regenerable, a purger avant le vrai pilote), `010_is_demo` (colonne `distributors.is_demo` + trigger `guard_is_demo` qui empeche l'API de la poser ou de la changer, `seed_demo_signals()` / `purge_demo_data()` limitees aux fiches demo, `kpi_coverage.machines_demo`, `kpi_top_distributors.is_demo`), `011_machine_working` (etat machine `working` « Ça fonctionne » accepte par la contrainte et la RPC `confirm_availability` ; anti-doublon machine par etat : un appareil peut corriger « vide » en « fonctionne » dans l'heure), `012_product_dedup_by_state` (meme regle pour les produits : « Il y en a » puis « Plus rien » dans l'heure est retenu), `013_distributor_update_columns` (UPDATE sur `distributors` limite a la colonne `price_range` pour `authenticated`, rien pour `anon` : un compte connecte ne renomme ni ne deplace une fiche par l'API), `014_signals_require_account` (signal = compte obligatoire, 20 / heure / compte, comptes bloques `signal_bans`, fonctions admin `purge_user_signals` / `unban_user` non exposees a l'API). Tables utilisees par le front : `distributors`, `products`, `distributor_photos`, `reports`, `votes`.

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
| UC1 | Contribution publique | Ajouter un nouveau distributeur | OUI | Supabase `distributors` |
| UC2 | Contribution publique | CRUD produits (ajout / rename / toggle dispo / delete) | OUI | Supabase `products` |
| UC3 | Contribution publique | Upload photo sur distributeur existant | OUI | Supabase storage + `distributor_photos` |
| UC4 | Contribution publique | Signalement / vote pour un signalement | OUI | Supabase RPC + ActivityFeed local |
| UC5 | Sociale locale | Mettre / retirer favori (coeur) | non | localStorage `snackmatch_user` |
| UC6 | Sociale locale | Suivre un produit (alertes dispo) ; un favori notifie quand sa machine change (lectures anonymes, etat vu stocke localement) | non | localStorage `snackmatch_notification_prefs` |
| UC7 | Sociale locale | Discuter avec le bot d'un distributeur (**inactif**, `FEATURES.chat`) | non | localStorage `snackmatch_conversations` |
| UC8 | Preference perso | Prefs notifs (heures calmes, geofence) | non | localStorage |
| UC9 | Preference perso | Marquer notif lue / supprimer notif | non | localStorage |
| UC10 | Preference perso | Reinitialiser ses donnees (clear data) | non | localStorage (confirm() suffit) |
| UC11 | Signal de fraicheur | Signal de dispo par produit (Il y en a / Plus rien) ou machine (Fonctionne / Vide / En panne), en un tap | **OUI** (depuis 2026-09-25 : interface EPIC-T5 + base EPIC-T6) | Supabase RPC `confirm_availability` (007, 011, 012, 014) : compte obligatoire (28000 sinon), 20 signaux / heure / compte, anti-doublon par compte et par etat, compte bloque refuse (42501), poids 0.8, aucune ecriture directe dans la table |

UC11 : **decision Stephane 2026-09-25 (EPIC-T5) : informer est un privilege de compte**, comme modifier. Un visiteur lit tout (etat de la machine, dispo des produits) et voit « Tu es devant la machine ? Connecte-toi pour informer » ; un connecte voit les boutons d'etat de la machine, les lignes produit touchables, Photo et Modifier. L'ancienne exception anonyme (cf. `docs/STRATEGIE.md` : un horodatage a poids reduit, sans friction devant la machine) est levee **aussi cote base** (EPIC-T6, migration 014, crainte de l'abus « pour s'amuser ») : la limite par appareil se contournait, l'identifiant etant fabrique par le telephone. Anti-abus : limite par compte, `signal_bans` + `purge_user_signals(user_id, bloquer, raison)` / `unban_user(user_id)` reservees a l'admin (mode d'emploi en fin de 014). Session morte (28000 / 401) : l'app renouvelle la session et renvoie une fois, sinon « Ta session a expiré : reconnecte-toi » + `promptReconnect()` (auth.js) ; plus de renvoi anonyme. Revenir au signal anonyme = rouvrir la RPC (reprendre 012) et afficher les controles sans condition dans `applyFicheAuthState()` (gmaps-ui.js) et `renderProductsList(..., { canInform })`.

**Mecanismes** :
- `window.__testLogin()` / `window.__testLogout()` (auth.js, **localhost uniquement**) : simulent un compte connecte pour les e2e (`loginForTest(page)`), le magic link ne pouvant aboutir en local. Les appels Supabase restent anonymes.
- `requireAuth()` (auth.js) : modale email + magic link. **Bypass automatique sur localhost** (le magic link ne peut pas rediriger en local) sauf si `localStorage.distrimatch_force_auth='1'` - c'est ce que font les tests e2e qui verifient le mur d'auth.
- `isAuthenticated()` (auth.js) : check synchrone sans prompt.
- `showEditAuthGate()` (gmaps-ui.js) : modale pedagogique "Connexion requise" -> page Compte. Utilisee par UC2 (Modifier) et UC3 (Photo).
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
- Le stylo « Modifier » est visible sur toute fiche (plus seulement depuis Favoris) ; la connexion est verifiee au clic (UC2). En edition, le bouton d'un produit dit « Disponible / Non disponible » (choix de Stephane 2026-09-25) ; un produit marque non disponible s'affiche « Pas dispo » en lecture.
- Structure de la fiche (EPIC-T4 / T5, inspiree de l'app EuroMillions, theme clair) : chaque information a une seule place. Le bandeau d'etat en tete (`#dist-hero`, aplat de la couleur de l'etat machine, jamais un degrade pour que le contraste reste mesure par l'e2e 21) dit en tres grand si la machine marche (`describeFicheHero`) ; le titre « Il reste quoi ? · N sur M dispo » dit ce qu'il y a. Plus de puce d'etat. 1re photo en fond assombri du bandeau, galerie dans « À propos ». Onglets en pastilles, tuiles d'action.
- Vocabulaire de la fiche (decision Stephane 2026-09-25) : trois mots par aliment (« Dispo », « Pas dispo », « Pas d'info »), jamais « catalogue » en lecture. Le mot repond, la couleur dit la confiance (vive < 2 h, adoucie jusqu'a 24 h). Une machine vide / en panne plus recente que le signal d'un aliment le passe en « Pas dispo ».
- `sw.js` se desinstalle volontairement. Ne pas le reactiver sans plan de cache.
- `data/distributors.json` et `EMBEDDED_DATA` sont des fallbacks ; en prod la verite est Supabase.
- Toute donnee fictive est identifiable : une fiche l'est par `distributors.is_demo` (ses produits, photos et signalements le sont par jointure), un signal ou un evenement par `device_hash LIKE 'demo-%'`. Le front affiche un tag « Démo » et ne modifie jamais `is_demo`. Purge du jour J : `DELETE FROM distributors WHERE is_demo` (cascade) + Storage, cf. `supabase/010_is_demo.sql`.
