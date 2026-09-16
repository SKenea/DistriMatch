# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**DistriMatch** - PWA "Waze des distributeurs automatiques" pour la Cote Basque.

**Nom officiel : DistriMatch.** "SnackMatch" est l'ancien nom : ne plus l'employer (code, UI, doc, commits). Il subsiste volontairement dans les cles localStorage `snackmatch_*` (les renommer sans migration effacerait les donnees des utilisateurs) et dans le remote GitLab.
Carte Leaflet + fiche distributeur style Google Maps + chatbot par distributeur + contributions communautaires (ajout, produits, photos, signalements) via Supabase.

## Stack

- HTML5, CSS3, Vanilla JavaScript ES modules - **pas de framework, pas de build system**
- CDN charges dans `index.html` : Leaflet 1.9.4 (unpkg), `@supabase/supabase-js@2` (jsdelivr), hCaptcha
- Supabase (Postgres + RLS + storage + auth magic link) ; localStorage pour l'etat purement local
- PWA (manifest.json) ; service worker volontairement desactive
- Deploiement : GitHub Pages (`skenea.github.io`) + `distrimatch.pages.dev` (voir `PROD_HOSTNAMES` dans `js/config.js`)

## Commandes

```bash
# Lancer en local (requis aussi pour les tests e2e, port 8080 attendu)
npx http-server -p 8080 -c-1

# Tests unitaires + DOM (Node test runner, pas de serveur requis)
npm test                      # unit puis dom
npm run test:unit             # tests/unit.test.js (mocks DOM/Leaflet dans tests/setup.js)
npm run test:dom              # tests/dom.test.js (jsdom)
node --test --test-name-pattern="escapeHTML" tests/unit.test.js   # un seul test

# Tests e2e Playwright (Chromium, serveur 8080 lance a part : pas de webServer dans la config)
npx playwright test tests/e2e.spec.js --workers=1
npx playwright test -g "nom du test"                              # un seul test
PWDEBUG_HEADED=1 npx playwright test -g "..."                     # headed + slowMo (debug visuel)
```

Les tests e2e injectent une geoloc Bayonne et pilotent l'app via les globals `window.AppState` / `window.openDistributorModal`. Verification visuelle possible via le MCP Playwright (`.mcp.json`).

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
config.js          - Cles PUBLIQUES uniquement (Supabase anon key, sitekeys hCaptcha), isLocalhost()
auth.js            - Magic link Supabase + hCaptcha, requireAuth()/isAuthenticated()/onAuthChange()
gmaps-ui.js        - UI principale style Google Maps : side panel liste filtree (groupes par distance) + modal fiche distributeur a onglets, deep link, partage, auth gate edition
map.js             - Carte Leaflet, marqueurs (marker.distributorId), popups
navigation.js      - switchView/switchTab (VIEW_CONFIG + registerViewCallback), sidebar, recherche, filtres
distributor.js     - CRUD produits, photos, abonnements (favoris)
add-distributor.js - Mode ajout distributeur (placement carte, formulaire, upload photos)
chat.js            - Chatbot par distributeur, messages proactifs, non lus
activity.js        - Feed activite, signalements + votes (RPC Supabase)
notifications.js   - Geofencing, heures calmes, cooldown, produits suivis, centre de notifications
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

Migrations SQL numerotees, a executer manuellement dans le SQL Editor du dashboard (pas de CLI) : `001_schema`, `002_seed`, `003_photos`, `004_rls_hardening` (RPC `submit_report`/`cast_vote` refusent l'anonyme), `005_open_writes_for_authenticated` (tout user authentifie peut editer `products` et le `price_range` d'un distributeur, modele collaboratif ; pas de DELETE sur `distributors`/`distributor_photos`), `006_audit_trail` (`updated_at`/`modified_by` par trigger), `007_availability_signals` (table `availability_signals` + vues `product_availability`/`distributor_status` + RPC `confirm_availability` ouverte a l'anonyme avec rate limit, rafraichit `last_verified` ; cf. UC11), `008_events_kpi_rhythm` (table `events` + RPC `log_event` anonyme anti-spam, vues KPI `kpi_*` en agregats, vue `product_rhythm` par tranche horaire locale, colonne `distributors.tz`), `009_demo_data` (fonctions `seed_demo_signals()` / `purge_demo_data()` reservees au SQL Editor : jeu de signaux et d'evenements fictifs marques `demo-`, regenerable, a purger avant le vrai pilote). Tables utilisees par le front : `distributors`, `products`, `distributor_photos`, `reports`, `votes`.

Projet free-tier : s'il est en pause, les appels echouent en `ERR_NAME_NOT_RESOLVED` et l'app retombe sur le JSON/EMBEDDED_DATA - verifier le dashboard avant de chercher un bug.

### Persistance localStorage

Cles : `snackmatch_user` (abonnements/favoris, points ; migration auto `favorites` -> `subscriptions` dans `loadFromLocalStorage()`), `snackmatch_profile`, `snackmatch_conversations`, `snackmatch_activity`, `snackmatch_user_distributors`, `snackmatch_notification_prefs`, `snackmatch_notification_queue`. Flag dev : `distrimatch_force_auth`.

### Types de distributeurs

Definis a 3 endroits a garder coherents : `DISTRIBUTOR_TYPES` et `EMBEDDED_DATA.typeConfig` (`js/state.js`), `typeConfig` de `data/distributors.json`, et les chips `data-type` de `index.html`. Types actuels des chips : `pizza`, `bakery`, `fries`, `meals`, `cheese`, `dairy`, `agricultural`, `meat`, `terroir`, `ice`, `other` (+ `general` dans les donnees).

Format distributeur : `id`, `name`, `type`, `emoji`, `address`, `city`, `lat`, `lng`, `rating`, `reviewCount`, `status` (verified/warning), `priceRange`, `products[]` (name, price, available). Mapping snake_case Supabase -> camelCase dans `loadDistributorsFromSupabase()`.

## Politique d'authentification

**Regle structurante** : auth obligatoire des qu'une ecriture **impacte les autres utilisateurs** (visible publiquement, agregee, moderable). Auth libre pour ce qui n'affecte que **son propre appareil**. Lectures toujours anonymes.

| # | Categorie | Use case | Auth ? | Storage |
|---|---|---|:-:|---|
| UC1 | Contribution publique | Ajouter un nouveau distributeur | OUI | Supabase `distributors` |
| UC2 | Contribution publique | CRUD produits (ajout / rename / toggle dispo / delete) | OUI | Supabase `products` |
| UC3 | Contribution publique | Upload photo sur distributeur existant | OUI | Supabase storage + `distributor_photos` |
| UC4 | Contribution publique | Signalement / vote pour un signalement | OUI | Supabase RPC + ActivityFeed local |
| UC5 | Sociale locale | Mettre / retirer favori (coeur) | non | localStorage `snackmatch_user` |
| UC6 | Sociale locale | Suivre un produit (alertes dispo) | non | localStorage `snackmatch_notification_prefs` |
| UC7 | Sociale locale | Discuter avec le bot d'un distributeur | non | localStorage `snackmatch_conversations` |
| UC8 | Preference perso | Prefs notifs (heures calmes, geofence) | non | localStorage |
| UC9 | Preference perso | Marquer notif lue / supprimer notif | non | localStorage |
| UC10 | Preference perso | Reinitialiser ses donnees (clear data) | non | localStorage (confirm() suffit) |
| UC11 | Signal de fraicheur | Signal de dispo par produit (vu dispo / vu absent) ou machine (vide / en panne), en un tap | **non** (exception assumee) | Supabase RPC `confirm_availability` (migration 007) : rate limit par appareil, poids 0.5 anonyme / 0.8 connecte, aucune ecriture directe dans la table |

UC11 deroge a la regle structurante (cf. `docs/STRATEGIE.md`) : ce n'est pas du contenu editable mais un horodatage a poids reduit, qui perime tout seul (2 h) et se noie dans les signaux suivants. Devant une machine, personne ne fait un magic link ; quand les signaux sont rares, chaque friction en tue la moitie. Reversible : remettre le mur d'auth sur UC11 en une ligne si l'abus apparait.

**Mecanismes** :
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

- `sw.js` se desinstalle volontairement. Ne pas le reactiver sans plan de cache.
- `data/distributors.json` et `EMBEDDED_DATA` sont des fallbacks ; en prod la verite est Supabase.
