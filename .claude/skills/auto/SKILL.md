---
name: auto
description: Cycle autonome borné — enchaîne les stories du BACKLOG.md qui ont leur fiche d'exécution (docs/stories/<ID>.md), N au plus (5 par défaut) ; chaque fiche suivie comme /executer-fiche, fusion seulement si tout est vert et le diff reste dans la fiche, puis suivi du déploiement Pages et E2E en ligne ; retour arrière et arrêt au premier échec. « à blanc » liste ce qui serait fait sans rien exécuter.
argument-hint: "[N] [à blanc]"
disable-model-invocation: true
---

# /auto — cycle autonome borné (DistriMatch)

Arguments : `$ARGUMENTS` — un nombre N (5 par défaut) et/ou « à blanc ».

Le couloir : `/auto` n'exécute que ce qu'une fiche a déjà décidé. Tout le reste attend Stéphane.
Pendant le cycle, aucune question : un doute arrête le cycle et va au rapport.

## 1. Choisir les fiches (rien n'est modifié)

1. Sauf « à blanc » (qui lit les fichiers tels quels) : `git checkout master && git pull github master`.
   Lire `docs/stories/README.md`, puis `BACKLOG.md`
   (« Priorite haute » puis « Priorite normale », de haut en bas).
2. Une story est **retenue** si elle n'est pas cochée et que sa fiche `docs/stories/<ID>.md` existe.
   Elle est **écartée**, avec sa raison, si :
   - elle n'a pas de fiche (la faire écrire d'abord : `SKENEA/Capitalisation/workflows/fiche-dexecution.md`) ;
   - sa fiche fait modifier un fichier sous `supabase/`, `scripts/`, `.claude/`, ou un `.env*` (vraie
     base, déploiement, réglages : Claude principal et Stéphane) ;
   - sa fiche demande une relecture par un modèle plus fort avant fusion ;
   - son prérequis n'est ni fusionné ni retenu avant elle.
3. Garder les N premières retenues. **À blanc** : afficher les retenues (ordre, branche, fichiers
   touchés) et les écartées (raison), puis s'arrêter là.

## 2. Pour chaque fiche retenue, une à la fois

1. **Exécuter la fiche** : lire `~/.claude/skills/executer-fiche/SKILL.md` et en suivre les étapes 1 à 8
   (contrôles, test qui échoue d'abord, étapes exactes, vérifications dont `npm test` et
   `npm run test:functional`, PR). Un STOP de cette procédure arrête tout le cycle.
2. **Diff borné** : `git diff --name-only master...HEAD` ne contient que les fichiers de la fiche, plus
   `index.html` (versions `?v=`) et `BACKLOG.md`. Sinon : PR laissée ouverte, arrêt du cycle.
3. **Fusion** : `gh pr merge <N> --merge --delete-branch`, puis `git checkout master && git pull github master`.
4. **Déploiement** : `gh api repos/SKenea/DistriMatch/pages/builds/latest` jusqu'à `built` ;
   `errored` → retour arrière.
5. **En ligne** : `npm run test:e2e` (site en ligne, sans écriture hors du compte E2E) ; un échec qui se
   répète → retour arrière.
6. **Une ligne** : `✓ <ID> — PR #N, test <nom>, en ligne`.

**Retour arrière** : `git checkout -b revert/<ID>`, `git revert -m 1 <commit de fusion>`,
`git push -u github revert/<ID>`, PR, fusion, suivi du build Pages, puis arrêt du cycle.

## 3. Arrêt du cycle

- N fiches livrées, ou plus aucune retenue.
- Un STOP de la fiche, un diff hors fiche, un build Pages en erreur, un E2E en échec (après retour arrière).

## 4. Rapport final

Livrées (ID, PR, commit) ; écartées (raison) ; arrêt (étape, sortie de la commande) ; état de `master`
et du site en ligne (https://skenea.github.io/DistriMatch/).

## Jamais

`--force`, `--no-verify`, commit sur `master`, fusion d'une PR ouverte hors de ce cycle,
`node scripts/supabase-sql.mjs`, `node scripts/deploy-push.mjs`, `node scripts/import-osm.mjs`, du SQL
sur la vraie base, une modification de `.claude/`, le commit d'un secret.
