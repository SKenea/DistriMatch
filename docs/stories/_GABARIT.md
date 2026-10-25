# <ID> — <titre court>

- **Lot** : <n. nom du lot> · **Gravité** : <élevé | moyen | faible> · **Niveau conseillé** : medium
  <!-- ou : « medium, relecture par un modèle plus fort avant fusion » -->
- **Branche** : `fix/<slug>` · **Taille** : <n> fichiers de code + tests
- **Constats couverts** (rapport du 2026-10-21) :
  - <titre> — `<fichier>:<ligne>`

## But
<Une phrase : ce que l'utilisateur ne subit plus après la correction.>

## User story
En tant que <…>, je veux <…>, afin de <…>.

**Critères d'acceptation**
- [ ] <vérifiable, observable>

## Avant de coder
**Lire en entier** : <fichiers>

**Réutiliser** (ne pas réécrire) : <fonction — chemin>

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
<grep -n "..." fichier>   # attendu : <ligne / extrait>
```

## Étapes
1. **<fichier>** — <ce qu'on change et pourquoi, en une ligne>
   Avant :
   ```js
   <extrait exact>
   ```
   Après :
   ```js
   <extrait exact>
   ```
2. **index.html** — versions `?v=` (voir README).

## Tests
- **Fichier** : `<chemin>` · **Nom** : `<nom exact du test>`
- **Ce qu'il fait** : <simulation>
- **Assertion** : <exacte>
- **Doit échouer avant la correction** parce que <raison>.

## Vérification (dans l'ordre)
```bash
<commande>   # attendu : <résultat>
```

## Hors périmètre
- <ce qu'on ne touche pas, même si c'est tentant>

## Pièges connus
- <erreur probable et comment l'éviter>

## Terminé quand
- [ ] Contrôles passés, test écrit (échoue avant, passe après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : <oui, écrans … | non>
- [ ] Story cochée dans BACKLOG.md, PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `<type>(<zone>): <résumé>`

**Corps** : constats corrigés, ce qui change pour l'utilisateur, tests ajoutés, sorties des
commandes de vérification, captures, éléments non faits.
