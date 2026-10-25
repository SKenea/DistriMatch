# Fiches d'exécution (corrections de la revue du 2026-10-21)

Chaque story du `BACKLOG.md` issue de la revue de code a ici sa **fiche d'exécution** :
`docs/stories/<ID>.md`. La fiche contient tout le raisonnement déjà fait : quels fichiers,
quelles modifications, quels tests, quelles commandes, quand s'arrêter. Elle est écrite pour
qu'un modèle en effort « medium » la mène au bout **sans rien deviner**.

Rapport d'origine : https://claude.ai/artifact/T64CmaCdx8oEkXPUmc4Qx5

## Préfixes

| Préfixe | Lot | Exemple |
|---|---|---|
| SEC | 1. Sécurité | SEC-02 plus aucune donnée dans un `onclick` |
| PRIV | 2. Vie privée | |
| BUG | 3. Bugs visibles | BUG-01 menu du profil derrière les pages |
| NAV | 4. Connexion, retour et liens | |
| NOTIF | 5. Notifications | |
| A11Y | 6. Accessibilité | |
| TEST | 7. Tests | |
| OPS | 8. Scripts et configuration | |

## Déroulé obligatoire (une seule story à la fois)

1. **Lire la fiche en entier**, puis les fichiers listés dans « Avant de coder ».
2. **Lancer les contrôles** de la section « Avant de coder ». Si un contrôle ne trouve pas le
   code attendu : **s'arrêter** et signaler (le code a bougé depuis la fiche). Ne pas adapter
   la correction au jugé.
3. **Créer la branche** indiquée (`fix/...` ou `feat/...`) à partir de `master` à jour.
   Des fichiers non suivis ou modifiés hors de la fiche peuvent exister dans le dépôt (réglages
   locaux, brouillons) : c'est normal, **ne pas y toucher et ne jamais les committer**.
4. **Écrire d'abord le test** de la section « Tests », le lancer : il doit **échouer** pour la
   raison annoncée (Playwright relance un échec une fois : deux échecs pour la bonne raison = normal).
5. **Capture « avant »** si la fiche en demande : maintenant, correction pas encore appliquée.
6. **Appliquer les étapes** dans l'ordre, une par une, exactement comme écrit.
7. **Relancer le test** : il doit passer. Puis toutes les commandes de « Vérification », dans l'ordre.
8. **Capture « après »**, mêmes écrans.
9. **Commit** : `git add` **fichier par fichier**, uniquement ceux que la fiche fait modifier
   (+ `index.html` pour les `?v=`, + `BACKLOG.md`). Jamais `git add -A` ni `git add .`.
   Contrôler `git diff --cached --stat` : seules les lignes prévues bougent.
10. **PR** avec le modèle de la fiche (accents autorisés : écrire le corps dans un fichier UTF-8
    et utiliser `gh pr create --body-file`). **Ne pas fusionner** : Stéphane valide.
11. Cocher la story dans `BACKLOG.md` dans la même PR. Si elle n'y figure pas encore, ne pas
    l'ajouter : le noter dans la PR.

## Règles qui s'appliquent à toutes les fiches

- **Ne toucher qu'aux fichiers listés** dans la fiche (et `index.html` pour les versions `?v=`).
  Besoin d'un autre fichier = s'arrêter et demander.
- **Import map** : tout module de `js/` modifié = monter le `?v=` de **toutes** les entrées de
  l'import map de `index.html` à la **même** valeur (+1). Le test `cache-busting` vérifie.
- **CSS** : monter le `?v=` du seul `<link>` du fichier CSS modifié.
- **Fins de ligne** : la plupart des fichiers sont en CRLF ; garder celles du fichier. Si l'outil
  Edit refuse un bloc de plusieurs lignes, faire le remplacement par un petit script Node (dans le
  scratchpad, hors dépôt) qui lit le fichier, remplace en conservant les `\r\n`, et réécrit.
  Ne jamais réécrire un fichier entier à la main ; vérifier avec `git diff --stat` que seules les
  lignes prévues changent.
- **Commandes `grep` des fiches** : les lancer entre **guillemets simples** quand le motif
  contient `$`, `\` ou `{` (entre guillemets doubles, bash les interprète et le grep ne trouve rien).
- **« Au-dessus de la fonction qui contient… »** : si le code visé est dans un rappel anonyme
  (ex. `document.addEventListener('DOMContentLoaded', async () => { ... })` dans `js/app.js`),
  poser la nouvelle fonction au niveau du module, juste avant ce rappel.
- **XSS** : tout contenu dynamique injecté par `innerHTML` passe par `escapeHTML()` ;
  **jamais** de donnée dans un attribut `on...=` (voir SEC-02).
- **Fonction appelée depuis un `onclick` en ligne** : l'exposer sur `window` dans `js/app.js`.
- **Textes** : français, tutoiement, jamais le mot « machine » dans un texte de la fiche
  distributeur, jamais « tap », ton positif, aucune promesse.
- **SQL** : nouvelle migration numérotée (`supabase/0NN_nom.sql`, numéro suivant le plus grand).
  Une règle RLS lisible par `anon` qui appelle une fonction exige `grant execute ... to anon`.
  **Ne jamais exécuter de SQL sur la vraie base** : c'est Claude (modèle principal) qui applique
  la migration après relecture. Le test `db.test.js` tourne dans des transactions annulées.
- **Jamais** : `git push --force`, fusion d'une PR, commit sur `master`, `--no-verify`,
  `node scripts/supabase-sql.mjs`, `node scripts/deploy-push.mjs`, `node scripts/import-osm.mjs`.

## Commandes de référence

```bash
npx http-server -p 8080 -c-1 -s            # serveur local (tests fonctionnels), à lancer à part
npm test                                    # unitaires + DOM, rapide
node --test tests/integration/db.test.js    # vraie base, transactions annulées (si SQL touché)
npx playwright test --project=functional -g "nom du test"   # un test fonctionnel
npm run test:functional                     # toute la suite fonctionnelle (~185 tests, environ 10 min)
```

La suite fonctionnelle dépasse souvent 10 minutes : la lancer **en arrière-plan** (option
`run_in_background` de l'outil) et attendre la notification de fin, au lieu d'un appel bloquant.
Avant de lancer le serveur local, vérifier s'il répond déjà : `curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/`
(200 = déjà lancé, ne pas le relancer).

Un test fonctionnel qui échoue une fois puis passe en relançant seul est « instable » : le noter
dans la PR, ne pas le corriger dans la même story.

## Captures iPhone (si la fiche le demande)

Playwright WebKit, appareil `iPhone 13`, sur `http://localhost:8080`, avec le script commun
`tests/tools/capture-iphone.mjs` (rien d'autre à écrire) :

```bash
node tests/tools/capture-iphone.mjs <ID>-avant-<ecran> <ecran>   # avant d'appliquer les étapes
node tests/tools/capture-iphone.mjs <ID>-apres-<ecran> <ecran>   # après
# ex. node tests/tools/capture-iphone.mjs SEC-02-avant-favoris favoris
```
Le premier argument est le **nom complet** du fichier : y mettre l'écran, sinon deux écrans
s'écrasent.

`<ecran>` est un des écrans prévus par le script (`carte`, `favoris`, `favoris-menu`, `fiche`,
`recherche`, `compte`) ; la fiche indique lequel. Les images vont dans `test-results/captures/`
(ignoré par git) : ne pas les committer. Dans la PR, écrire leurs chemins ; c'est Claude
(modèle principal) qui les montre à Stéphane.

## Quand s'arrêter et demander (toujours)

- Le code ne correspond pas à l'extrait « avant » de la fiche.
- Un test échoue pour une autre raison que celle attendue, deux fois de suite.
- La correction demande un fichier hors liste, ou une décision que la fiche ne tranche pas.
- Toute action sur la production : SQL sur la base, déploiement, fusion.

## Créer une nouvelle fiche

Copier `_GABARIT.md`. Toutes les sections sont obligatoires ; « Rien » est une réponse valable.
