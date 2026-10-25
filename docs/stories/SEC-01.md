# SEC-01 — Vérifier en base qu'aucune faille de la revue n'a servi (avant de corriger)

- **Lot** : 1. Sécurité · **Gravité** : élevé · **Niveau conseillé** : **Claude, modèle principal**
  (la fiche lit la vraie base de production ; elle n'est pas confiée à un modèle « medium »)
- **Branche** : aucune (aucun fichier du dépôt ne change) · **Taille** : 0 fichier de code, 0 test
- **Constats couverts** (rapport du 2026-10-21) : toutes les failles côté base de la revue, pour
  savoir si quelqu'un s'en est servi **avant** que les stories SEC les ferment :
  - identifiant de fiche libre (XSS stocké via `onclick`, cf. SEC-02) et textes libres non bornés ;
  - `products` : UPDATE / DELETE ouverts à tout compte (005), nom sans limite de longueur ;
  - `push_subscriptions` : RPC anonyme `push_subscribe` sans limite de volume (024) ;
  - ajout de fiche : `created_at` posé par le client, donc limite « 5 / jour » contournable (022) ;
  - signaux : limite 20 / heure / compte (014), `device_hash` choisi par le client ;
  - `price_range` : aucune contrainte de valeur en base (013) ;
  - `demo_backup` : table sans RLS ni clé étrangère (009) ;
  - bucket `distributor-photos` : dépôt ouvert à tout compte alors que les photos sont inactives (003) ;
  - taille de la base face aux 500 Mo du free tier.

## But
Avant de fermer les failles, savoir si l'une d'elles a déjà servi : si oui, Stéphane décide quoi
faire des données concernées **avant** que les corrections (contraintes `check`, purges) ne les
fassent échouer ou disparaître.

## User story
En tant que Stéphane, responsable de DistriMatch, je veux savoir si la base contient la trace
d'un abus des failles relevées par la revue, afin de décider en connaissance de cause avant les
corrections (et de prévenir les membres si leurs données ont été touchées).

**Critères d'acceptation**
- [ ] Les 9 contrôles ci-dessous ont été lancés, chacun avec sa sortie brute conservée.
- [ ] Aucune écriture : seules des requêtes `select` / `with ... select` ont été envoyées.
- [ ] Stéphane a reçu le compte rendu (modèle en fin de fiche) : « rien d'anormal », ou la liste
      précise de ce qui a été trouvé, sans rien avoir supprimé ni corrigé.

## Règles propres à cette fiche (prioritaires sur le README)
- **Lecture seule absolue.** Chaque requête commence par `select` ou `with`. Jamais `insert`,
  `update`, `delete`, `drop`, `alter`, `create`, `truncate`, `grant`, `revoke`, ni appel de
  fonction qui écrit (`purge_*`, `seed_*`, `admin_*`, `push_*`, `cron.*`). Le script tourne en
  tant que `postgres` : **la RLS ne protège de rien ici**, une erreur de frappe écrit pour de vrai.
- **Trouver quelque chose ne donne droit à aucune action.** On note (ids, extraits, dates), on
  termine les autres contrôles, puis on prévient Stéphane. On ne supprime, ne corrige, ne bloque
  aucun compte (`purge_user_signals`, `unban_user`... sont interdits dans cette fiche).
- **Données personnelles** : ne recopier dans le compte rendu ni e-mail, ni endpoint push complet,
  ni clé (`p256dh`, `auth`), ni SIRET, ni code. Un `user_id` peut être cité (Stéphane en a besoin
  pour décider), un endpoint se résume à son hôte.
- Si une requête renvoie une erreur SQL (colonne absente, etc.) : ne pas « réparer » au jugé une
  requête qui écrirait ; corriger seulement le nom de colonne d'après `information_schema.columns`,
  relancer, et le signaler dans le compte rendu.

## Avant de lancer
**Lire** : `scripts/supabase-sql.mjs` et `scripts/lib/supabase-management.mjs` (le script lit le
jeton dans `.env.local`, envoie la requête à l'API de gestion, affiche `HTTP <code>` puis au plus
8000 caractères de JSON ; seule la **dernière** instruction renvoie des lignes : **une requête par
appel**). Schéma de référence : `supabase/001` à `024`.

**Comment lancer une requête** : à cause des `"`, `'`, `` ` `` et `$` des motifs, ne pas passer le
SQL par `-e "..."` (le shell casserait ou interpréterait le texte). Écrire chaque requête dans un
fichier du répertoire scratchpad de la session (outil Write), puis :
```bash
SQL="<scratchpad>/sec01/q1a.sql"          # chemin absolu
grep -iwE "insert|update|delete|drop|alter|create|truncate|grant|revoke|call|copy|vacuum|perform|into|do|merge|lock|setval|nextval|refresh|comment|reindex|cluster" "$SQL"
#   attendu : AUCUNE sortie (garde-fou ; mots entiers : « updated_at » ne déclenche pas ;
#   « into » attrape aussi un « insert into », c'est voulu). Les requêtes de la fiche
#   n'emploient aucun de ces mots : si le grep sort une ligne, la requête a été altérée.
#   Ce garde-fou est nécessaire car runSql (scripts/lib/supabase-management.mjs) envoie
#   read_only: false à l'API : rien ne bloque une écriture côté serveur.
node scripts/supabase-sql.mjs "$SQL"      # depuis la racine du dépôt
#   attendu : « HTTP 201 » ou « HTTP 200 » puis un tableau JSON
```

**Contrôles préalables** (sinon s'arrêter) :
```bash
test -f .env.local && grep -c "SUPABASE_ACCESS_TOKEN" .env.local     # attendu : 1 (ne jamais afficher la valeur)
grep -n "supabase.co" js/config.js                                   # attendu : une URL https://<ref>.supabase.co
```
Première requête de contact (fichier `q0.sql`) :
```sql
select now() as maintenant, current_user as role, version() as version;
```
Attendu : `role` = `postgres`. Échec réseau ou `ERR_NAME_NOT_RESOLVED` : le projet free tier est
peut-être en pause (voir CLAUDE.md) ; s'arrêter et le dire à Stéphane, ne rien relancer en boucle.

**Motif « texte piégé »** utilisé plusieurs fois (noté `P` ci-dessous, à recopier tel quel) :
```
'[<>"`]|javascript:|\mon[a-z]+\s*=|''\s*[),;+]|\)\s*;'
```
Il attrape : chevrons et guillemets droits / accent grave (balise, sortie d'attribut), `javascript:`,
un gestionnaire `onclick=` / `onerror =`, une apostrophe suivie de `)`, `,`, `;` ou `+` (sortie d'une
chaîne JS, comme `x');...`), et `);`. Une apostrophe seule (« d'Espelette », « l'Église ») **ne**
déclenche **pas**. Faux positifs possibles et sans gravité : `<3` dans un avis, des « guillemets
droits » tapés par un membre. Juger chaque ligne à l'œil : suspect = ressemble à du code.

## Contrôles (lecture seule, dans l'ordre)

### 1. Textes piégés (XSS)

**1a — identifiants de fiche hors format** (`q1a.sql`)
```sql
select id, left(name, 60) as nom, source, is_demo, review_status, added_by, created_at
from distributors
where id !~ '^[A-Za-z0-9_-]{1,64}$'
order by created_at desc
limit 50;
```
- Détecte : un id qui ne serait pas `dist-NNN`, `user-<horodatage>` ou `osm-...` (ex. `x');fetch(...);//`).
- Normal : **0 ligne**.
- Si trouvé : noter id, `added_by`, `created_at`, `review_status`. C'est la faille de SEC-02 :
  prévenir Stéphane en tête du compte rendu (la contrainte de format prévue échouerait sur ces lignes).

**1b — textes des fiches** (`q1b.sql`)
```sql
select d.id, f.champ, left(f.valeur, 120) as extrait, d.added_by, d.created_at
from distributors d
cross join lateral (values
  ('name', d.name), ('emoji', d.emoji), ('address', d.address), ('city', d.city),
  ('type', d.type), ('price_range', d.price_range), ('tz', d.tz),
  ('opening_hours', d.opening_hours), ('review_reason', d.review_reason)
) as f(champ, valeur)
where f.valeur ~* '[<>"`]|javascript:|\mon[a-z]+\s*=|''\s*[),;+]|\)\s*;'
order by d.id
limit 50;
```
- Normal : **0 ligne**.

**1c — emoji et type anormaux** (`q1c.sql`)
```sql
select id, emoji, char_length(emoji) as longueur, type, added_by, created_at
from distributors
where char_length(emoji) > 10
   or emoji ~ '[A-Za-z0-9<>"''`;()=]'
   or type not in ('pizza','bakery','fries','meals','cheese','dairy','agricultural',
                   'meat','terroir','ice','other','general')
order by created_at desc
limit 50;
```
- Détecte : un « emoji » qui contient du texte ou du code (il est injecté tel quel dans plusieurs
  gabarits), un type hors de la liste de `js/state.js` / chips d'`index.html`.
- Normal : **0 ligne** (un emoji composé fait au plus ~7 caractères).

**1d — produits, avis, fils d'échange, demandes d'exploitant** (`q1d.sql`)
```sql
with p(motif) as (select '[<>"`]|javascript:|\mon[a-z]+\s*=|''\s*[),;+]|\)\s*;'::text)
select 'products.name' as champ, pr.id::text as ligne, pr.distributor_id as fiche, left(pr.name, 120) as extrait
  from products pr, p where pr.name ~* p.motif
union all
select 'reviews.body', r.id::text, r.distributor_id, left(r.body, 120)
  from reviews r, p where r.body ~* p.motif
union all
select 'reviews.author_name', r.id::text, r.distributor_id, left(r.author_name, 120)
  from reviews r, p where r.author_name ~* p.motif
union all
select 'operator_request_messages.body (' || m.author || ')', m.id::text, o.distributor_id, left(m.body, 120)
  from operator_request_messages m join operator_requests o on o.id = m.request_id, p
  where m.body ~* p.motif
union all
select 'distributor_review_messages.body (' || m.author || ')', m.id::text, m.distributor_id, left(m.body, 120)
  from distributor_review_messages m, p where m.body ~* p.motif
union all
select 'operator_requests.' || f.champ, o.id::text, o.distributor_id, left(f.valeur, 120)
  from operator_requests o
  cross join lateral (values
    ('company', o.company), ('contact', o.contact), ('relation', o.relation),
    ('message', o.message), ('mail_name', o.mail_name), ('mail_address', o.mail_address),
    ('reject_reason', o.reject_reason)
  ) as f(champ, valeur), p
  where f.valeur ~* p.motif
limit 100;
```
- Normal : **0 ligne**, ou seulement des faux positifs évidents (texte français avec `"` ou `<3`).
- Si une ligne ressemble à du code : noter champ, ligne, fiche, extrait (tronqué). Les messages
  écrits par `admin` / `system` sont ceux de Stéphane ou de la base : les signaler à part.
- Si la sortie est coupée à 8000 caractères : relancer en ajoutant `where champ = '...'` autour
  (sous-requête) pour chaque source, ne pas augmenter `limit`.

### 2. Produits (suppressions, renommages, noms longs)

Aucun historique des suppressions n'existe (`006_audit_trail` ne trace que les UPDATE, et la
cascade efface aussi les signaux du produit). On mesure donc des indices, pas une preuve.

**2a — bilan global et produits rattachés à rien** (`q2a.sql`)
```sql
select
  (select count(*) from products) as produits,
  (select count(*) from products where distributor_id is null) as sans_fiche,
  (select count(*) from products p where p.distributor_id is not null
     and not exists (select 1 from distributors d where d.id = p.distributor_id)) as fiche_absente,
  (select max(id) from products) as id_max,
  pg_sequence_last_value(pg_get_serial_sequence('public.products', 'id')::regclass) as dernier_id_attribue,
  (select count(*) from products where modified_by is not null) as produits_modifies_par_un_compte;
```
- Normal : `sans_fiche` = 0, `fiche_absente` = 0. L'écart `dernier_id_attribue - produits` compte
  les produits créés puis disparus **et** les numéros consommés par les transactions annulées de
  `tests/integration/db.test.js` : un écart de quelques centaines est attendu, pas une preuve.
- Si `sans_fiche` > 0 : un produit a été détaché de sa fiche par UPDATE (faille 005) ; lister
  `select id, left(name,60), updated_at, modified_by from products where distributor_id is null limit 50;`

**2b — fiches publiées qui ont perdu leurs produits** (`q2b.sql`)
```sql
select d.id, left(d.name, 50) as nom, d.is_demo, d.is_user_added, count(p.id) as produits,
       max(p.updated_at) as derniere_modif_produit
from distributors d
left join products p on p.distributor_id = d.id
where d.review_status = 'published'
group by d.id, d.name, d.is_demo, d.is_user_added
having count(p.id) = 0 or (d.id like 'dist-%' and count(p.id) < 4)
order by produits, d.id
limit 60;
```
- Repère : le seed `002_seed.sql` a créé **4 produits** pour chacune des fiches démo `dist-001` à
  `dist-025` (d'où le filtre `d.id like 'dist-%'` : des fiches `user-...` marquées démo n'ont
  jamais eu 4 produits). Une fiche `dist-...` avec moins de 4 produits a perdu des produits (un membre en a le droit
  au toucher, EPIC-T12 ; plusieurs fiches vidées d'un coup ne sont pas normales). Une fiche
  ajoutée par un membre peut légitimement n'avoir aucun produit.
- Normal : quelques fiches de membres à 0 produit au plus ; **aucune** fiche démo vidée.
- Si plusieurs fiches démo ou réelles sont à 0 : noter la liste ; croiser avec 2c.

**2c — comptes qui ont modifié beaucoup de produits** (`q2c.sql`)
```sql
select modified_by, count(*) as produits_modifies, count(distinct distributor_id) as fiches,
       min(updated_at) as premiere, max(updated_at) as derniere
from products
where modified_by is not null
group by modified_by
order by produits_modifies desc
limit 20;
```
- Normal : quelques comptes (Stéphane, testeurs), chacun sur peu de fiches.
- Suspect : un compte qui a modifié des dizaines de produits sur de nombreuses fiches en peu de
  temps (renommage de masse, déplacement de produits d'une fiche à l'autre).

**2d — noms de produit anormaux** (`q2d.sql`)
```sql
select id, distributor_id, char_length(name) as longueur, left(name, 80) as extrait, created_at, modified_by
from products
where char_length(name) > 60 or btrim(name) = ''
order by longueur desc
limit 20;
```
- Repère : l'app limite la saisie à 60 caractères (`maxlength="60"`, `js/fiche-edit.js`) ; la base
  n'a aucune limite. Normal : **0 ligne**. Au-delà = écrit en direct par l'API.

**2e — rafales de créations de produits** (`q2e.sql`)
```sql
select date_trunc('hour', created_at) as heure, count(*) as produits_crees, count(distinct distributor_id) as fiches
from products
group by 1
having count(*) > 30
order by heure desc
limit 20;
```
- Normal : seulement l'heure du seed (avril 2026) et éventuellement un import. Une autre rafale
  récente = à signaler (heure, nombre, fiches).

### 3. Abonnements push

**3a — volume et taille** (`q3a.sql`)
```sql
select count(*) as abonnements,
       count(*) filter (where user_id is not null) as lies_a_un_compte,
       max(cardinality(favorites)) as max_favoris,
       max(cardinality(followed_products)) as max_produits_suivis,
       count(*) filter (where cardinality(favorites) > 50) as plus_de_50_favoris,
       min(created_at) as premier, max(created_at) as dernier,
       pg_size_pretty(pg_total_relation_size('public.push_subscriptions')) as taille_abonnements,
       pg_size_pretty(pg_total_relation_size('public.push_sent')) as taille_push_sent
from push_subscriptions;
```
- Normal : une poignée d'abonnements (Stéphane, testeurs ; la fonction date du lot EPIC-T25),
  `plus_de_50_favoris` = 0, tailles de l'ordre de quelques dizaines de ko.
- Suspect : des centaines ou milliers de lignes, des Mo, des listes de 200 favoris (le plafond de
  la RPC) : quelqu'un remplit la table par la RPC anonyme.

**3b — hôtes des endpoints** (`q3b.sql`)
```sql
select substring(endpoint from '^https://([^/:?#]+)') as hote,
       case
         when substring(endpoint from '^https://([^/:?#]+)') = 'android.googleapis.com' then 'ancien_google'
         when substring(endpoint from '^https://([^/:?#]+)') ~ '^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$' then 'connu'
         else 'inconnu'
       end as service,
       count(*) as abonnements, max(created_at) as dernier
from push_subscriptions
group by 1, 2
order by service desc, abonnements desc;
```
- Normal : uniquement `service = 'connu'` (Google FCM, Mozilla, Apple `*.push.apple.com`, Microsoft).
- `ancien_google` (`android.googleapis.com`) : à compter à part et à signaler dans le compte rendu,
  sans gravité ; ces lignes seront effacées par la migration 026.
- Suspect : un autre hôte. La fonction `push-notify` enverrait des requêtes vers ce serveur à
  chaque signal sur les favoris de la ligne (requêtes sortantes vers un tiers). Noter l'hôte
  seulement, jamais l'endpoint complet.

**3c — contenu et rafales** (`q3c.sql`)
```sql
select
  (select count(*) from push_subscriptions s, unnest(s.favorites) f
     where f !~ '^[A-Za-z0-9_-]{1,64}$') as favoris_hors_format,
  (select count(*) from push_subscriptions s, unnest(s.favorites) f
     where not exists (select 1 from distributors d where d.id = f)) as favoris_inexistants,
  (select count(*) from (select date_trunc('hour', created_at) from push_subscriptions
     group by 1 having count(*) > 20) x) as heures_avec_plus_de_20_abonnements;
```
- Normal : `favoris_hors_format` = 0, `heures_avec_plus_de_20_abonnements` = 0.
  `favoris_inexistants` peut être faible et non nul (fiches OSM retirées le 2026-10-02).

### 4. Ajouts de fiche

La limite « 5 ajouts / jour / compte » (022) compte sur `created_at`, que le client peut fixer à
l'insertion. Il n'existe **aucune date d'insertion infalsifiable** : `updated_at` vaut `now()` à
l'insertion sauf si le client l'envoie aussi, puis est réécrit par le trigger à chaque UPDATE.
Indice utilisé : une fiche jamais modifiée (`modified_by is null`) dont `updated_at` et
`created_at` divergent a probablement une date posée à la main.

**4a — dates incohérentes** (`q4a.sql`)
```sql
select id, left(name, 40) as nom, added_by, review_status, created_at, updated_at, modified_by
from distributors
where is_user_added
  and ( created_at is null
     or created_at > now() + interval '5 minutes'
     or created_at < timestamptz '2026-04-01'
     or (not is_demo and created_at > timestamptz '2026-09-19' and modified_by is null
         and updated_at is not null and abs(extract(epoch from (updated_at - created_at))) > 60) )
order by created_at nulls first
limit 50;
```
- Repère : le schéma date du 2026-04-13 ; aucune fiche de membre ne peut être plus ancienne.
- Normal : **0 ligne**. Les fiches démo et celles d'avant le 2026-09-19 sont exclues de la
  4e condition : les migrations (008 `tz`, 010, 018) et le seed nocturne les modifient en tant que
  `postgres`, sans jeton, donc `modified_by` reste vide. Attention : un UPDATE fait à la main dans
  le SQL Editor produit exactement le même motif ; demander à Stéphane avant de conclure.
- Si trouvé : noter id, `added_by`, les deux dates. Contournement possible de la limite.

**4b — comptes qui ajoutent beaucoup** (`q4b.sql`)
```sql
select added_by,
       count(*) as total,
       count(*) filter (where review_status = 'pending') as en_attente,
       count(*) filter (where review_status = 'rejected') as refusees,
       max(n_jour) as max_par_jour_created_at,
       min(created_at) as premier, max(created_at) as dernier
from (
  select added_by, review_status, created_at,
         count(*) over (partition by added_by, (created_at at time zone 'UTC')::date) as n_jour
  from distributors
  where is_user_added
) x
group by added_by
order by total desc
limit 20;
```
- Normal : `max_par_jour_created_at` ≤ 5 pour tous ; peu de fiches par compte.
- Suspect : `max_par_jour_created_at` > 5 (la limite n'a pas tenu), ou un compte avec beaucoup de
  fiches `en_attente` (file de la console remplie) même étalées sur des jours (dates posées à la main).

### 5. Signaux

**5a — signaux « démo » sur une fiche réelle** (`q5a.sql`)
```sql
select s.distributor_id, count(*) as signaux, min(s.created_at) as premier, max(s.created_at) as dernier,
       count(*) filter (where s.user_id is not null) as avec_compte
from availability_signals s
join distributors d on d.id = s.distributor_id
where s.device_hash like 'demo-%' and not d.is_demo
group by s.distributor_id
order by signaux desc
limit 20;
```
- Détecte : un membre qui marque ses signaux `demo-...` pour qu'ils échappent aux notifications
  push (le déclencheur ignore `demo-%`) et soient effacés par les purges démo.
- Normal : **0 ligne**. Des lignes **anciennes sans compte** (`avec_compte` = 0, avant le
  2026-09-25) peuvent venir de l'ancien seed 009 ; des lignes **avec compte** sont suspectes.

**5b — plus de 20 signaux dans une même heure** (`q5b.sql`)
```sql
select user_id, date_trunc('hour', created_at) as heure, count(*) as signaux,
       count(distinct distributor_id) as fiches
from availability_signals
where user_id is not null
group by user_id, date_trunc('hour', created_at)
having count(*) > 20
order by signaux desc
limit 20;
```
- Normal : **0 ligne** (la RPC refuse au-delà de 20 sur une heure glissante, donc aussi sur une
  heure pleine).

**5c — signaux sans compte et sans marque démo depuis la fermeture de l'anonyme** (`q5c.sql`)
```sql
select date_trunc('day', created_at) as jour, source, count(*) as signaux
from availability_signals
where user_id is null and device_hash not like 'demo-%' and created_at > timestamptz '2026-09-26'
group by 1, 2
order by jour desc
limit 30;
```
- Normal : **0 ligne** (014 exige un compte depuis le 2026-09-25). Exception bénigne : compte
  supprimé depuis (`on delete set null`). Beaucoup de lignes = la RPC a été contournée.

### 6. Niveau de prix (`q6.sql`)
```sql
select price_range, count(*) as fiches,
       (array_agg(id order by id))[1:10] as exemples
from distributors
group by price_range
order by fiches desc;
```
- Repère : le front n'utilise que `€`, `€€`, `€€€` (`PRICE_LEVELS`, `js/fiche-edit.js` et
  `js/gmaps-ui.js` ; `js/add-distributor.js` envoie `€€` par défaut) ; `null` = pas renseigné.
- Normal : seulement ces trois valeurs et `null`.
- Suspect : toute autre valeur (texte long, balise) : noter la valeur (tronquée) et les exemples.

### 7. Table `demo_backup` (`q7.sql`)
```sql
select
  (select count(*) from demo_backup) as lignes,
  (select count(*) from distributors where is_demo) as fiches_demo,
  (select count(*) from demo_backup b
     where not exists (select 1 from distributors d where d.id = b.distributor_id)) as orphelines,
  (select count(*) from demo_backup b join distributors d on d.id = b.distributor_id
     where not d.is_demo) as sur_fiche_reelle,
  (select relrowsecurity from pg_class where oid = 'public.demo_backup'::regclass) as rls_active,
  exists (select 1 from information_schema.role_table_grants
          where table_schema = 'public' and table_name = 'demo_backup'
            and grantee in ('anon', 'PUBLIC') and privilege_type like 'INS%') as anon_peut_inserer,
  (select array_agg(distributor_id) from (select distributor_id from demo_backup b
     where not exists (select 1 from distributors d where d.id = b.distributor_id)
     limit 10) x) as exemples_orphelines;
```
- Normal : `lignes` ≤ `fiches_demo`, `orphelines` = 0, `sur_fiche_reelle` = 0. `rls_active` /
  `anon_peut_inserer` décrivent la faille (attendu aujourd'hui : faille ouverte), ce n'est pas un abus.
- Suspect : des lignes orphelines ou plus de lignes que de fiches démo : quelqu'un a écrit dans
  la table par l'API. Danger : `purge_demo_data()` recopie `last_verified` depuis cette table.

### 8. Stockage photos (`q8.sql`)
```sql
select
  (select count(*) from storage.objects where bucket_id = 'distributor-photos') as objets,
  (select pg_size_pretty(coalesce(sum((metadata->>'size')::bigint), 0))
     from storage.objects where bucket_id = 'distributor-photos') as volume,
  (select count(*) from storage.objects where bucket_id = 'distributor-photos'
     and (coalesce(metadata->>'mimetype', '') not like 'image/%'
          or metadata->>'mimetype' = 'image/svg+xml'
          or name ~* '\.(html?|svg|js|xml)$')) as non_images,
  (select max(created_at) from storage.objects where bucket_id = 'distributor-photos') as dernier_depot,
  (select count(*) from distributor_photos) as lignes_distributor_photos;
```
- Repère : les photos sont inactives (`FEATURES.photos = false`) mais 003 laisse tout compte
  déposer un fichier ; le bucket est public.
- Normal : 0 objet, ou seulement d'anciennes photos de test ; `non_images` = 0.
- Suspect : des dépôts récents, un volume important, ou **un seul** objet non image (une page
  HTML ou un SVG servi depuis le domaine Supabase peut héberger un piège). Pour les lister :
  `select name, metadata->>'mimetype', metadata->>'size', created_at from storage.objects where bucket_id = 'distributor-photos' order by created_at desc limit 30;`
  (ne pas télécharger ni ouvrir les fichiers).

### 9. Taille de la base

**9a — total** (`q9a.sql`)
```sql
select pg_size_pretty(pg_database_size(current_database())) as taille,
       round(100.0 * pg_database_size(current_database()) / (500 * 1024 * 1024), 1) as pourcent_des_500_mo;
```
**9b — plus grosses tables** (`q9b.sql`)
```sql
select n.nspname || '.' || c.relname as table_, pg_size_pretty(pg_total_relation_size(c.oid)) as taille
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc
limit 10;
```
- Normal : bien en dessous de 500 Mo (quelques dizaines de Mo, en grande partie les schémas
  internes de Supabase). Les fichiers du Storage ne comptent pas ici (quota séparé), seules leurs
  métadonnées.
- À signaler : au-delà de 50 %, ou une table de l'app (`push_subscriptions`, `products`,
  `availability_signals`, `events`, `demo_backup`) parmi les plus grosses sans raison connue.

## Hors périmètre
- Toute correction : contraintes `check`, RLS, purges, blocage de compte (stories SEC suivantes,
  après la décision de Stéphane).
- Les journaux d'accès de Supabase (dashboard > Logs) et `auth.audit_log_entries` : non lus ici.
- Ouvrir, télécharger ou supprimer un fichier du bucket.
- Créer une migration, une branche, un commit ou une PR : cette fiche ne change aucun fichier
  (les requêtes vivent dans le scratchpad).

## Pièges connus
- **Le shell** : `-e "..."` avec `` ` ``, `"` et `$` casse ou exécute du texte ; passer par un
  fichier (voir « Comment lancer »).
- **Une requête par appel** : l'API ne renvoie que la dernière instruction ; plusieurs `select`
  dans un fichier = seul le dernier s'affiche.
- **Sortie coupée à 8000 caractères** : garder les `limit` et `left(...)` ; découper plutôt
  qu'agrandir.
- **`postgres` voit tout** (fiches en attente, refusées, colonnes privées) : ne recopier dans le
  compte rendu que le nécessaire (règle données personnelles).
- **Faux positifs** du motif `P` : un texte français avec des guillemets droits n'est pas une
  attaque ; décider sur l'aspect « code » de l'extrait.
- **Écart de séquence des produits** gonflé par les tests d'intégration (transactions annulées) :
  ce n'est pas une preuve de suppression.
- **Encodage** : écrire les fichiers `.sql` en UTF-8 (outil Write) ; les `€` du contrôle 6 doivent
  arriver intacts, sinon toutes les fiches sembleraient hors liste.

## Terminé quand
- [ ] `q0` puis les 9 contrôles lancés (1a-1d, 2a-2e, 3a-3c, 4a-4b, 5a-5c, 6, 7, 8, 9a-9b),
      chaque garde-fou `grep` sans sortie, chaque réponse `HTTP 200/201`
- [ ] Aucune écriture, aucune suppression, aucun fichier du dépôt modifié (`git status` inchangé)
- [ ] Compte rendu envoyé à Stéphane avec le modèle ci-dessous
- [ ] Si quelque chose a été trouvé : les stories SEC concernées restent **en attente** de sa décision

## Modèle de compte rendu pour Stéphane
(français simple, pas de SQL ; sorties brutes disponibles sur demande)

**Si rien n'a été trouvé :**
> **Vérification de la base (SEC-01) du <date> : rien d'anormal.**
> J'ai regardé, sans rien modifier, si quelqu'un avait profité des failles de la revue :
> fiches et textes piégés, produits effacés ou renommés en masse, abonnements aux notifications,
> ajouts de fiches, signaux, niveaux de prix, table de démo, photos déposées. Tout est normal.
> Chiffres utiles : <n> fiches, <n> produits, <n> abonnements aux notifications, <n> photos
> stockées, base à <taille> (<x> % des 500 Mo gratuits).
> On peut lancer les corrections.

**Si quelque chose a été trouvé :**
> **Vérification de la base (SEC-01) du <date> : <n> point(s) à regarder avant de corriger.**
> Je n'ai rien supprimé ni modifié.
> 1. <Ce qui a été trouvé, en une phrase> — <combien>, <depuis quand>, <quel compte (identifiant
>    court) ou quelle fiche>. Ce que ça veut dire : <conséquence pour les membres>.
> 2. ...
>
> Tout le reste est normal (<liste courte des contrôles sans rien>).
> Chiffres utiles : <n> fiches, <n> produits, <n> abonnements, <n> photos, base à <taille>.
> **Ta décision** : pour chaque point, garder, effacer, ou bloquer le compte ? Les corrections
> attendent ta réponse (certaines échoueraient tant que ces données existent).
