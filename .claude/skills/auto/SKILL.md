---
name: auto
description: Lance un cycle autonome qui traite les stories de BACKLOG.md (haut → bas) jusqu'a la limite indiquee (5 par defaut). Opus orchestre ; pour chaque story, une fiche ecrite par Opus, codee par un sous-agent Sonnet neuf, preuve rouge puis vert verifiee par Opus, double revue, PR fusionnee dans `dev`. Jamais de fusion dans `master` (= prod) : une PR `dev` -> `master` est ouverte pour Stephane a la fin.
---

# /auto — Cycle autonome DistriMatch (E5, 28/11/2026)

`/auto [N]` (N = nombre max de stories, defaut 5). Regles globales appliquees : « Orchestration et
economie de tokens » et « Preuve et tests honnetes » de `~/.claude/CLAUDE.md`.

**Qui fait quoi**
- **Toi (Opus)** : choisir la story, ecrire la fiche, verifier la preuve, relire le diff, decider.
  Tu ne codes que ce qui est plus court a faire qu'a decrire (une ligne, un `?v=`).
- **Sonnet** (`Agent`, `model: "sonnet"`, un agent NEUF par story) : code et tests, sur fiche.
- **Haiku** (`Agent`, `subagent_type: "Explore"` ou `model: "haiku"`) : chercher ou sont les choses,
  quand la story touche du code que tu ne connais pas.
- Deux echecs du meme agent sur la meme story : relancer avec le modele au-dessus (`opus`), une fois.

**Branches** : tout part de `dev` et revient dans `dev`. `master` = GitHub Pages = prod : Claude n'y
fusionne JAMAIS, n'y pousse jamais.

## Phase 1 — Preparation

1. `git fetch github` ; `git checkout dev && git pull github dev` (absente : STOP, la creer est une
   decision de Stephane).
2. Lire `BACKLOG.md` : stories non cochees, haut -> bas. Sans criteres d'acceptation verifiables :
   noter dans « A clarifier », passer a la suivante. Aucune : STOP.

## Phase 2 — Pour chaque story (max N)

```
1. FICHE (toi)
   - Lire seulement les fichiers concernes (Grep + lignes utiles ; Explore/haiku si inconnu).
   - Ecrire docs/stories/<ID>.md au gabarit de docs/stories/README.md : fichiers a toucher,
     controles « avant de coder », etapes exactes, TEST ATTENDU (fichier, nom, raison d'echec
     attendue), commandes de verification CIBLEES, criteres de reussite.
     Une fiche existe deja : la relire et la completer si elle laisse deviner quelque chose.

2. EXECUTION (Sonnet, agent neuf)
   - Prompt : « Execute /story <ID> en partant de la branche dev ; base de la PR : dev. »
     plus le chemin de la fiche, rien d'autre (pas l'historique de la session).
   - Il rend : statut (FAIT / FAIT AVEC RESERVES / BESOIN DE CONTEXTE / BLOQUE), PR, extraits rouge
     et vert. BESOIN DE CONTEXTE : completer la fiche, relancer un agent neuf. BLOQUE : STOP story.

3. PREUVE (toi, jamais sur parole)
   - `gh pr diff <N> --name-only` puis lire le diff des fichiers de code et de test.
   - Rouge : sur la branche de la PR (le code y est commite), remettre le code d'avant
     `git checkout dev -- <fichiers de code seulement>`, lancer le test CIBLE : il doit ECHOUER pour
     la raison de la fiche ; puis `git checkout HEAD -- <memes fichiers>`, relancer : il PASSE.
     Sorties lues ; `git status` propre a la fin.
   - Test retouche pour passer, assertion relachee, `skip`, valeur recopiee : refus, story renvoyee.

4. DOUBLE REVUE (toi)
   - Conformite : chaque critere d'acceptation tenu, avec sa preuve ; rien en plus.
   - Qualite : `/code-review` sur la PR ; recevoir ses retours selon la skill `revue` (verifier avant
     d'appliquer). Correctifs : par un agent Sonnet neuf sur la meme branche, puis preuve a nouveau.

5. TESTS AVANT FUSION
   - `npm test` (rapide). Si la base ou une migration change : `npm run test:integration`.
   - `npm run test:functional` en arriere-plan (serveur 8080 lance a part), ou seulement le fichier du
     domaine touche si la story est locale a un ecran.
   - Echec non instable deux fois : STOP + rapport. Une migration SQL n'est JAMAIS appliquee a la
     vraie base dans /auto : la story s'arrete avant, et le dit.
   - UI changee : capture Playwright localhost (iPhone), regardee par toi.

6. FUSION DANS dev
   - Verifier `gh pr view <N> --json baseRefName` = "dev". Sinon : STOP.
   - `gh pr merge <N> --merge --delete-branch`.
   - Cocher la story dans BACKLOG.md (sur dev, commit `docs(backlog): ...`, PR vers dev si besoin).

7. RAPPORT 1 LIGNE : « ✓ <ID> — rouge/vert verifie, N tests OK, PR #M fusionnee dans dev »
```

## Phase 3 — Fin de cycle

1. S'il y a eu au moins une fusion : ouvrir (ou mettre a jour) UNE PR `dev` -> `master` avec la liste
   des stories, les tests lances et ce que Stephane doit regarder. **Ne pas la fusionner.**
2. Rapport final (ci-dessous). Apres la fusion par Stephane seulement, et sur sa demande : suivre le
   deploiement Pages (`gh api repos/SKenea/DistriMatch/pages/builds/latest`), puis `npm run test:e2e`.

## Conditions d'arret

N stories faites ; test en echec deux fois ; agent BLOQUE deux fois ; preuve rouge impossible ;
story ambigue (-> « A clarifier ») ; backlog vide ; toute action qui toucherait la prod ou la base.

## Rapport final

```markdown
## Session autonome — YYYY-MM-DD HH:MM
### Stories fusionnees dans dev (N)
1. [PR #X] <ID> — preuve rouge/vert — tests : ...
### Non faites (raison)
### PR dev -> master pour Stephane : #Y (a fusionner pour mettre en prod)
### Points a regarder
```

## Garde-fous absolus

JAMAIS : fusionner ou pousser dans `master` ; `--force`, `--no-verify` ; supprimer une branche distante
non fusionnee ; modifier `.claude/settings.json` ; committer un secret (.env*, service_role, secret
hCaptcha) ; SQL sur la vraie base, `scripts/deploy-push.mjs`, `scripts/import-osm.mjs`.

## Communication

Pas de question pendant le cycle sauf STOP. Une ligne par story. Le rapport detaille a la fin.
