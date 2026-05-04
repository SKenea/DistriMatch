---
name: auto
description: Lance un cycle autonome qui traite les items de BACKLOG.md (haut → bas) jusqu'a la limite indiquee (5 par defaut). Pour chaque item : implementation + tests unit/DOM/e2e + commit + PR + merge auto + deploy + smoke test prod + update backlog. S'arrete sur echec critique. Termine avec un rapport final detaille.
---

# /auto — Cycle autonome DistriMatch

L'utilisateur invoque `/auto [N]` (N = nombre max d'items, defaut 5) pour te laisser tourner en autonomie 1-2h.

## Etapes a executer immediatement

### Phase 1 — Verification setup

1. Lire `BACKLOG.md` a la racine du repo
2. Compter les items non-faits dans "Priorite haute" puis "Priorite normale"
3. Si **0 items** : afficher un toast "Aucun item dans le backlog" et STOP
4. Si **items sans acceptance criteria** : les noter dans "A clarifier" et passer aux suivants

### Phase 2 — Cycle par item

Pour chaque item (max N items), execute le pipeline suivant. **Arret immediat** sur tout echec non-flaky.

```
1. PICK
   - Marquer l'item dans la section "## En cours" du BACKLOG.md
   - Lire les acceptance criteria

2. UNDERSTAND
   - Si scope ambigu : lancer 1-3 Explore agents en parallele
   - Sinon : lecture directe des fichiers concernes

3. IMPLEMENT
   - Modifications minimales (KISS, pas d'over-engineering)
   - Pas de feature creep

4. TEST UNIT + DOM
   - `npm test`
   - Si echec : fix + reessai (1 fois max)
   - Si echec persistant : STOP + rapport

5. TEST E2E
   - `npx playwright test tests/e2e.spec.js --workers=1 --timeout=60000`
   - Tolerer flaky (retry deja configure)
   - Si echec non-flaky : STOP + rapport

6. VERIF VISUELLE (si UI changee)
   - Playwright headed : navigate http://localhost:8080 + screenshot
   - Verifier visuellement (au moins absence d'erreur console)

7. COMMIT + PUSH + PR
   - git checkout -b <feat|fix>/<slug>
   - git commit avec Co-Authored-By: Claude
   - git push -u github
   - gh pr create
   - gh pr merge --merge --delete-branch (auto-merge si tests OK)

8. DEPLOY MONITOR
   - Monitor `gh api repos/SKenea/DistriMatch/pages/builds` jusqu'a status=built
   - Si errored : STOP + revert + rapport

9. SMOKE TEST PROD
   - Playwright navigate https://skenea.github.io/DistriMatch/
   - Screenshot + check console errors
   - Si erreur critique : ROLLBACK (revert merge commit) + rapport

10. UPDATE BACKLOG
    - Retirer l'item de "## En cours"
    - Ajouter dans "## Done" : `- [x] YYYY-MM-DD Description (PR #N, commit abc1234)`

11. RAPPORT 1-LIGNE
    - Format : "✓ Item X — N tests OK, PR #M, deploye en Z sec"
```

### Phase 3 — Conditions d'arret

Stoppe immediatement et passe au rapport final si :

- N items completes (limite atteinte)
- Test echoue 2 fois de suite (meme apres fix)
- Build GitHub Pages errored
- Smoke test prod casse → ROLLBACK puis stop
- Item ambigu (pas d'acceptance criteria) → skip + log dans "A clarifier"
- Backlog vide → stop

### Phase 4 — Rapport final

Produit un message recapitulatif au format :

```markdown
## Session autonome — YYYY-MM-DD HH:MM

### Items completes (N)
1. [PR #X] Description courte — commit 1234abc — built en Ys
2. ...

### Items skip (raison)
- [item] : criteres ambigus, deplace dans "A clarifier"

### Regressions / nouveaux items detectes
- [decrire si applicable]

### Etat final
- Tests : XX unit/DOM + YY e2e (FF flaky toleres)
- Prod : https://skenea.github.io/DistriMatch/ (commit XYZ)
- Branche : master a jour

### Pour la prochaine session
- (suggestions auto-detectees)
```

## Garde-fous absolus

JAMAIS :
- `git push --force` ou `--force-with-lease`
- Suppression d'une branche distante non-mergee
- Modification de `.claude/settings.json` (config user)
- Commit de secrets (.env, service_role keys, hCaptcha secret)
- Bypass des tests (`--no-verify`, etc.)
- Commit direct sur master sans PR

## Communication pendant le cycle

- **Pas de question pendant le cycle** sauf STOP critique
- **Update todo list** apres chaque etape importante via TodoWrite
- **Notifications minimales** : 1 ligne par item complete
- **Rapport final detaille** uniquement a la fin
