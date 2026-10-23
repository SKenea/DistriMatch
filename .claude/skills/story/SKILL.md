---
name: story
description: Exécute UNE story de correction à partir de sa fiche docs/stories/<ID>.md (ex. /story BUG-01), sans improviser hors fiche. Contrôles, test qui échoue d'abord, étapes, vérifications, PR non fusionnée. S'arrête et signale dès que le code ne correspond pas à la fiche.
---

# /story <ID> — Exécuter une fiche de correction

L'utilisateur tape `/story <ID>` (ex. `/story SEC-02`). Ta seule source de vérité est la fiche
`docs/stories/<ID>.md` et les règles de `docs/stories/README.md`. Tu n'inventes rien qui n'y est pas.

## Étapes

1. Lire `docs/stories/README.md` puis `docs/stories/<ID>.md` en entier. Fiche absente : s'arrêter.
2. `git checkout master && git pull github master`, puis créer la branche de la fiche. Des fichiers
   non suivis ou modifiés hors fiche peuvent exister (réglages locaux) : ne pas y toucher, ne jamais les committer.
3. Lire les fichiers de « Avant de coder ». Lancer chaque contrôle. **Un seul écart = STOP** :
   dire quel contrôle, ce qui était attendu, ce qui a été trouvé.
4. Écrire le(s) test(s) de la fiche. Les lancer : ils doivent **échouer** pour la raison annoncée.
   S'ils passent déjà ou échouent autrement : STOP. Puis capture « avant » si la fiche en demande
   (`node tests/tools/capture-iphone.mjs <ID>-avant <ecran>`).
5. Appliquer les étapes dans l'ordre, exactement. Ne toucher à aucun fichier hors liste
   (sauf `index.html` pour les `?v=` et `BACKLOG.md` pour cocher la story).
6. Lancer toutes les commandes de « Vérification » dans l'ordre (`npm run test:functional` en
   arrière-plan, ~10 min). Un échec non instable deux fois de suite : STOP avec la sortie.
7. Capture « après » (`<ID>-apres`, même écran).
8. Cocher la story dans `BACKLOG.md` (absente : le noter dans la PR, ne pas l'ajouter).
   `git add` fichier par fichier (jamais `-A` ni `.`), vérifier `git diff --cached --stat`,
   commit (message conventionnel + ligne Co-Authored-By), `git push -u github <branche>`,
   `gh pr create --body-file` (corps UTF-8, modèle de la fiche, chemins des captures).
   **Ne pas fusionner.**
9. Rapport court en français : PR, tests ajoutés, résultats des commandes, écarts éventuels.

## Interdits
- Fusionner une PR, pousser sur `master`, `--force`, `--no-verify`.
- Exécuter du SQL sur la vraie base, `scripts/deploy-push.mjs`, `scripts/import-osm.mjs`.
- « Améliorer » au passage ce que la fiche met hors périmètre.
