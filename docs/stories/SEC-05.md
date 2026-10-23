# SEC-05 — Ajout de fiche et niveau de prix : la base impose les valeurs

- **Lot** : 1. Sécurité · **Gravité** : moyen · **Niveau conseillé** : medium, relecture par un modèle plus fort avant fusion
- **Branche** : `fix/base-ajout-prix` · **Taille** : 1 migration SQL + 1 fichier JS (+ `index.html`) + 2 fichiers de tests
- **Prérequis** : s'exécute **après SEC-04 fusionnée** dans `master` (partir de `master` à jour).
  Import map : partir de la valeur courante de `master` ; les versions citées dans cette fiche
  (`?v=91`…) sont des exemples.
- **Constats couverts** (rapport du 2026-10-21) :
  - Ajout de fiche : la limite de 5 par jour se contourne en fixant soi-même created_at — `supabase/022_distributor_review.sql:56`
  - (doublon) Limite « 5 ajouts par jour et par compte » contournable : created_at est fourni par le client — `supabase/022_distributor_review.sql:56`
  - Niveau de prix : aucune contrainte de valeur ni de taille, modifiable en une requête sur toutes les fiches publiées, sans historique — `supabase/013_distributor_update_columns.sql:22` (valeur et portée corrigées ici ; l'historique est hors périmètre, voir plus bas)
  - Fiches ajoutées depuis l'app sans fuseau (tz NULL) — `js/add-distributor.js:310`
  - Défense en profondeur de SEC-02 : contrainte de format sur `distributors.id`

## But
Un membre ne peut plus, par l'API, antidater ses ajouts pour dépasser 5 fiches par jour, falsifier
l'état, la note ou l'auteur d'une fiche, envoyer un nom ou un identifiant hors format, ni changer
le niveau de prix de toutes les fiches d'un coup (ou mettre n'importe quoi à la place de €, €€, €€€).
Les fiches ajoutées depuis l'app reçoivent le fuseau horaire du téléphone.

## User story
En tant que membre qui consulte les fiches (et en tant qu'admin qui valide les ajouts), je veux
que la base refuse les valeurs forgées par un compte malveillant, afin que les fiches, les niveaux
de prix et la file des nouveaux distributeurs restent fiables.

**Critères d'acceptation**
- [ ] Un ajout par l'API avec `created_at = '2000-01-01'` est enregistré avec `created_at = now()` ; le 6e ajout du jour est refusé (P0001), même antidaté.
- [ ] À l'ajout par l'API, la base pose elle-même `created_at`, `updated_at`, `added_by`, `modified_by`, `is_user_added`, `last_verified` (null), `status` (`verified`), `rating` (0), `review_count` (0), `author_read_at` (null) ; un `tz` inconnu de `pg_timezone_names` devient null, un fuseau connu est gardé.
- [ ] La base refuse (23514) : un id hors `^[A-Za-z0-9_-]{1,64}$`, un nom de moins de 2 ou de plus de 100 caractères, une adresse ou une ville de plus de 200 caractères, une latitude hors [-90, 90], une longitude hors [-180, 180], un niveau de prix autre que `€`, `€€`, `€€€` ou vide, un emoji de plus de 16 caractères ou contenant un chevron, un guillemet, une apostrophe, un accent grave, un point-virgule ou un signe égal.
- [ ] Par l'API, un UPDATE qui touche plus d'une fiche est refusé (42501 « Une seule fiche par modification ») ; un compte bloqué (`signal_bans`) ne modifie plus rien (42501 « Compte bloque »). Les fonctions de la base (`confirm_availability`, `admin_review_distributor`…) et postgres ne sont pas limitées.
- [ ] L'app envoie `tz` (fuseau du téléphone) à l'ajout ; le formulaire limite le nom à 100 caractères et l'adresse à 200, et refuse un nom d'un seul caractère avec un message.
- [ ] Le changement de prix depuis la fiche et l'ajout d'un distributeur fonctionnent comme avant.

## Pourquoi ça arrive (déjà analysé, ne pas refaire)
- `013` ne restreint que l'UPDATE : les droits par défaut de Supabase laissent `authenticated`
  **insérer toutes les colonnes** de `distributors`. La garde `guard_distributor_review` (022) force
  seulement `review_status`, `review_reason`, `reviewed_at`, `reviewed_by` ; d'autres déclencheurs
  forcent `is_demo` (010), `source` (018), `opening_hours` (019). Tout le reste vient du client,
  dont `created_at`, sur lequel la limite de 5 ajouts par jour compte (022:56-57).
- `price_range` est un `TEXT` libre (001:20) ; la règle RLS UPDATE (005:61-64) accepte tout compte
  connecté sur toute fiche qu'il lit ; `update({ price_range: 'X' }).neq('id', '')` réécrit toutes
  les fiches publiées en une requête. Aucun contrôle de `signal_bans`.
- `publishDistributor` (js/add-distributor.js:310-325) n'envoie pas `tz` et la colonne n'a pas de
  défaut (008:86) : la phrase de rythme d'une fiche ajoutée est calculée en heure UTC.

**Choix faits (ne pas les rediscuter)** :
- Forcer les valeurs **dans le déclencheur** plutôt que poser des droits INSERT par colonne : aucun
  risque de casser le front (il envoie `rating`, `review_count`, `status` : on les garde, la base les écrase).
- Le déclencheur `guard_distributor_review` reste `security definer` et teste `auth.role()` (comme
  aujourd'hui). Le nouveau déclencheur sur l'UPDATE, lui, **n'est pas** `security definer` et teste
  `current_user` (comme 010, 018, 019) : ainsi seules les requêtes directes de l'API sont limitées,
  pas les fonctions `security definer` appelées par un membre (elles tournent en `postgres`).
- `signal_bans` est illisible par `authenticated` : le déclencheur appelle une petite fonction
  `security definer` `account_is_banned()`.
- Formats d'id existants vérifiés : `dist-001`…`dist-025` (002, `data/distributors.json`,
  `EMBEDDED_DATA`), `user-<horodatage>` (js/add-distributor.js:402), `osm-node-<n>` / `osm-way-<n>`
  (scripts/import-osm.mjs:126), `itest-…` (db.test.js). Tous passent `^[A-Za-z0-9_-]{1,64}$`.
- Emojis du front et des données vérifiés (`DISTRIBUTOR_TYPES` et `EMBEDDED_DATA.typeConfig` de
  js/state.js, `data/distributors.json`, défaut `🏪`) : 1 ou 2 caractères (`🍽️`), aucun caractère
  interdit. Ils passent la contrainte `distributors_emoji_check`.
- Niveaux de prix du front : `['€', '€€', '€€€']` (js/fiche-edit.js:35, js/gmaps-ui.js:447,
  js/add-distributor.js:371) ; l'import OSM pose `null`.
- Numéro de migration : **027** (SEC-03 prend 025, SEC-04 prend 026). Garder 027 même si 025/026
  ne sont pas encore dans `master` : 027 n'en dépend pas.

## Avant de coder
**Lire en entier** : `supabase/022_distributor_review.sql` lignes 44-66 ; `supabase/013_distributor_update_columns.sql` ;
`supabase/010_is_demo.sql` lignes 45-70 (modèle `current_user`) ; `js/add-distributor.js` lignes 70-90, 306-339 et 360-377 ;
`tests/integration/db.test.js` lignes 1-55 (fonction `probe`, `AS_USER`) et 498-556 (section 022) ;
`tests/functional/doublons.spec.js` lignes 71-96.

**Réutiliser** (ne pas réécrire) : `probe`, `AS_USER`, `AS_ANON`, `USER`, `DEMO` (`tests/integration/db.test.js`) ;
le modèle de contrainte idempotente `if not exists (select 1 from pg_constraint where conname = ...)` (022:23-29).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n "new.reviewed_by := null;" supabase/022_distributor_review.sql            # attendu : ligne 52
grep -n "where added_by = auth.uid() and created_at > now() - interval '1 day') >= 5 then" supabase/022_distributor_review.sql   # attendu : ligne 57
grep -n "GRANT UPDATE (price_range) ON distributors TO authenticated;" supabase/013_distributor_update_columns.sql               # attendu : ligne 22
ls supabase/027* 2>/dev/null                                                       # attendu : aucune sortie (027 libre)
grep -ln "guard_distributor_review\|price_range\|account_is_banned\|guard_distributor_update_scope" supabase/025*.sql supabase/026*.sql 2>/dev/null
# attendu : aucune sortie. Si 025 ou 026 redéfinit l'un d'eux : s'arrêter et signaler.
grep -n 'id="new-dist-name" placeholder="Nom du distributeur" required>' js/add-distributor.js   # attendu : ligne 79
grep -n "showToast('Nom requis', 'error');" js/add-distributor.js                  # attendu : ligne 374
grep -n "added_by: session?.user?.id || null" js/add-distributor.js                # attendu : ligne 324
grep -n "is_user_added: true });" tests/functional/doublons.spec.js                # attendu : ligne 90
grep -n "6e ajout du jour pour un compte : refuse (P0001)" tests/integration/db.test.js   # attendu : ligne 550
grep -n '"./js/app.js": "./js/app.js?v=' index.html                                # valeur courante de master (noter N)
```

## Étapes

1. **supabase/027_distributor_insert_guard.sql** — nouveau fichier, contenu exact ci-dessous
   (UTF-8 sans BOM, créé avec l'outil Write : le fichier contient le caractère `€`).
   ```sql
   -- ============================================================================
   -- 027 : ajout d'une fiche et niveau de prix, la base impose les valeurs (SEC-05)
   -- ============================================================================
   -- Revue du 2026-10-21. Avant : 013 ne restreint que l'UPDATE, l'API inserait
   -- donc toutes les colonnes de distributors : created_at antidate = limite de
   -- 5 ajouts / jour contournee ; status, rating, review_count, last_verified,
   -- modified_by falsifiables ; aucune borne sur id, name, address, city, lat, lng.
   -- price_range : texte libre, modifiable en une requete sur toutes les fiches
   -- publiees, meme par un compte bloque.
   --
   -- 1. guard_distributor_review (022) : pour l'API, le serveur pose created_at,
   --    updated_at, added_by, modified_by, is_user_added, last_verified, status,
   --    rating, review_count, author_read_at ; tz garde s'il existe dans
   --    pg_timezone_names, sinon null.
   -- 2. Contraintes (NOT VALID puis VALIDATE) : format de l'id, nom 2..100,
   --    adresse et ville <= 200, lat / lng bornees, price_range dans la liste,
   --    emoji court et sans caractere de balisage ou de code.
   -- 3. UPDATE direct par l'API (current_user anon / authenticated) : une seule
   --    fiche par requete, compte bloque refuse. Les fonctions SECURITY DEFINER
   --    (confirm_availability, admin_*, post_review_message...) tournent en
   --    postgres : non concernees.
   -- Aucun droit par colonne retire : compatible avec le front actuel.
   -- Idempotent, tout ou rien (begin / commit). Execution (Claude, apres la
   -- requete de controle de docs/stories/SEC-05.md) :
   -- node scripts/supabase-sql.mjs supabase/027_distributor_insert_guard.sql
   -- ============================================================================

   begin;

   -- 1. Ajout par l'API : valeurs posees par le serveur (remplace la version de 022)
   create or replace function guard_distributor_review() returns trigger
   language plpgsql security definer set search_path = public as $$
   begin
     if coalesce(auth.role(), '') in ('anon', 'authenticated') then
       new.review_status := 'pending';
       new.review_reason := null;
       new.reviewed_at := null;
       new.reviewed_by := null;
       -- SEC-05 : jamais fournies par le client
       new.created_at := now();
       new.updated_at := now();
       new.added_by := auth.uid();
       new.modified_by := auth.uid();
       new.is_user_added := true;
       new.last_verified := null;
       new.status := 'verified';
       new.rating := 0;
       new.review_count := 0;
       new.author_read_at := null;
       if new.tz is not null and not exists (select 1 from pg_timezone_names where name = new.tz) then
         new.tz := null;
       end if;
       if exists (select 1 from signal_bans where user_id = auth.uid()) then
         raise exception 'Compte bloque' using errcode = '42501';
       end if;
       if (select count(*) from distributors
           where added_by = auth.uid() and created_at > now() - interval '1 day') >= 5 then
         raise exception 'Trop d''ajouts aujourd''hui' using errcode = 'P0001';
       end if;
     end if;
     return new;
   end;
   $$;
   -- Le declencheur guard_distributor_review (022, before insert, for each row) reste en place.

   -- 2. Contraintes de valeur (aussi pour postgres et l'admin)
   do $$
   begin
     if not exists (select 1 from pg_constraint where conname = 'distributors_id_format_check') then
       alter table distributors add constraint distributors_id_format_check
         check (id ~ '^[A-Za-z0-9_-]{1,64}$') not valid;
     end if;
     if not exists (select 1 from pg_constraint where conname = 'distributors_name_length_check') then
       alter table distributors add constraint distributors_name_length_check
         check (char_length(btrim(name)) between 2 and 100) not valid;
     end if;
     if not exists (select 1 from pg_constraint where conname = 'distributors_address_length_check') then
       alter table distributors add constraint distributors_address_length_check
         check (char_length(address) <= 200) not valid;
     end if;
     if not exists (select 1 from pg_constraint where conname = 'distributors_city_length_check') then
       alter table distributors add constraint distributors_city_length_check
         check (char_length(city) <= 200) not valid;
     end if;
     if not exists (select 1 from pg_constraint where conname = 'distributors_lat_range_check') then
       alter table distributors add constraint distributors_lat_range_check
         check (lat between -90 and 90) not valid;
     end if;
     if not exists (select 1 from pg_constraint where conname = 'distributors_lng_range_check') then
       alter table distributors add constraint distributors_lng_range_check
         check (lng between -180 and 180) not valid;
     end if;
     if not exists (select 1 from pg_constraint where conname = 'distributors_price_range_check') then
       alter table distributors add constraint distributors_price_range_check
         check (price_range is null or price_range in ('€', '€€', '€€€')) not valid;
     end if;
     if not exists (select 1 from pg_constraint where conname = 'distributors_emoji_check') then
       alter table distributors add constraint distributors_emoji_check
         check (char_length(emoji) <= 16 and emoji !~ '[<>"''`;=]') not valid;
     end if;
   end $$;

   alter table distributors validate constraint distributors_id_format_check;
   alter table distributors validate constraint distributors_name_length_check;
   alter table distributors validate constraint distributors_address_length_check;
   alter table distributors validate constraint distributors_city_length_check;
   alter table distributors validate constraint distributors_lat_range_check;
   alter table distributors validate constraint distributors_lng_range_check;
   alter table distributors validate constraint distributors_price_range_check;
   alter table distributors validate constraint distributors_emoji_check;

   -- 3. UPDATE direct par l'API : une fiche par requete, compte bloque refuse
   -- signal_bans est illisible par l'API : lecture par une fonction SECURITY DEFINER
   create or replace function account_is_banned() returns boolean
   language sql stable security definer set search_path = public as $$
     select exists (select 1 from signal_bans where user_id = auth.uid());
   $$;
   revoke execute on function account_is_banned() from public, anon;
   grant execute on function account_is_banned() to authenticated;

   -- Pas SECURITY DEFINER : current_user doit rester le role de l'API (cf. 010)
   create or replace function guard_distributor_update_scope() returns trigger
   language plpgsql set search_path = public as $$
   begin
     if current_user in ('anon', 'authenticated') then
       if (select count(*) from changed_rows) > 1 then
         raise exception 'Une seule fiche par modification' using errcode = '42501';
       end if;
       if account_is_banned() then
         raise exception 'Compte bloque' using errcode = '42501';
       end if;
     end if;
     return null;
   end;
   $$;

   drop trigger if exists guard_distributor_update_scope on distributors;
   create trigger guard_distributor_update_scope
     after update on distributors
     referencing new table as changed_rows
     for each statement execute function guard_distributor_update_scope();

   commit;

   -- ============================================================================
   -- VERIFICATION (en tant que postgres)
   -- ============================================================================
   -- select conname, convalidated from pg_constraint
   --  where conrelid = 'distributors'::regclass and conname like 'distributors\_%\_check' escape '\'
   --  order by conname;
   -- -> les 8 contraintes de 027 avec convalidated = true (+ source et review_status)
   -- select tgname from pg_trigger where tgrelid = 'distributors'::regclass and not tgisinternal order by tgname;
   -- -> contient guard_distributor_review et guard_distributor_update_scope
   ```

2. **js/add-distributor.js** — formulaire : longueurs maximales (mêmes bornes que la base).
   Avant :
   ```js
               <input type="text" id="new-dist-name" placeholder="Nom du distributeur" required>
               <input type="text" id="new-dist-address" placeholder="Adresse (optionnel)">
   ```
   Après :
   ```js
               <input type="text" id="new-dist-name" placeholder="Nom du distributeur" required maxlength="100">
               <input type="text" id="new-dist-address" placeholder="Adresse (optionnel)" maxlength="200">
   ```

3. **js/add-distributor.js** — `confirmAddDistributorImpl` : un nom d'un caractère est refusé avant
   l'envoi (sinon la base le refuse et la fiche reste sur le téléphone).
   Avant :
   ```js
       if (!name) {
           showToast('Nom requis', 'error');
           return;
       }
   ```
   Après :
   ```js
       if (!name) {
           showToast('Nom requis', 'error');
           return;
       }
       // SEC-05 : la base refuse un nom de moins de 2 caracteres (contrainte 027)
       if (name.length < 2) {
           showToast('Donne-lui un nom d’au moins 2 caractères', 'error');
           return;
       }
   ```

4. **js/add-distributor.js** — `publishDistributor` : envoyer le fuseau du téléphone (même motif
   que `js/push.js:58`). L'ajout se fait sur place, le fuseau du téléphone est celui du distributeur.
   Avant :
   ```js
               is_user_added: true,
               added_by: session?.user?.id || null
           });
   ```
   Après :
   ```js
               is_user_added: true,
               added_by: session?.user?.id || null,
               // SEC-05 : fuseau du telephone (ajout sur place) ; la base l'efface s'il est inconnu
               tz: Intl.DateTimeFormat().resolvedOptions().timeZone || null
           });
   ```
   Ne **pas** retirer `rating`, `review_count`, `status` de l'objet : la base les écrase, et les
   retirer ne sert à rien dans cette story.

5. **index.html** — un module JS change : monter le `?v=` de **toutes** les entrées de l'import map
   à la même valeur N+1 (N = valeur courante de `master`, relevée dans les contrôles). Aucun CSS ne change.

## Tests

### Test 1 — règles de la base (intégration, vraie base, transactions annulées)
- **Fichier** : `tests/integration/db.test.js`, nouveau bloc inséré **juste avant** la ligne
  `// EPIC-T22 (023) : un signal ne revele pas son auteur ; journal du compte`
  (laisser une ligne vide avant et après le bloc ; d'autres stories, comme SEC-03, insèrent aussi à
  cet endroit : ne pas déplacer leurs blocs).
- **Code** :
  ```js
  // SEC-05 (027) : la base impose les valeurs d'un ajout et du niveau de prix
  describe('base : ajout de fiche et niveau de prix (027, SEC-05)', { skip: SKIP }, () => {
      const COLS = 'id, name, type, lat, lng, is_user_added, added_by, address, price_range';
      // Autre compte, lu en tant que postgres avant le changement de role
      const DECLARE_OTHER = 'v_other uuid := (select id from auth.users where id <> v_uid order by created_at limit 1);';

      it('ajout par l’API : date, auteur, etat, note et fraicheur poses par la base ; fuseau inconnu efface', async () => {
          const p = await probe(`${AS_USER}
              insert into distributors (id, name, type, lat, lng, is_user_added, added_by, created_at, updated_at,
                                        modified_by, last_verified, status, rating, review_count, tz)
              values ('itest-forge', 'Fiche itest', 'other', 43.49, -1.47, true, ${USER}, '2000-01-01', '2000-01-01',
                      v_other, now(), 'warning', 4.9, 999, 'Pas/Un_Fuseau');
              r := (select (created_at = now())::text || '|' || (updated_at = now())::text
                    || '|' || coalesce((modified_by = ${USER})::text, 'null') || '|' || coalesce(last_verified::text, 'null')
                    || '|' || status || '|' || rating::text || '|' || review_count::text || '|' || coalesce(tz, 'null')
                    from distributors where id = 'itest-forge')`, DECLARE_OTHER);
          assert.ok(p.reachedEnd, p.message);
          assert.equal(p.result, 'true|true|true|null|verified|0.0|0|null');
      });

      it('un fuseau connu envoye par l’app est conserve', async () => {
          const p = await probe(`${AS_USER}
              insert into distributors (id, name, type, lat, lng, is_user_added, added_by, tz)
              values ('itest-tz', 'Fiche itest', 'other', 43.49, -1.47, true, ${USER}, 'Europe/Paris');
              r := (select coalesce(tz, 'null') from distributors where id = 'itest-tz')`);
          assert.ok(p.reachedEnd, p.message);
          assert.equal(p.result, 'Europe/Paris');
      });

      it('antidater created_at ne contourne plus la limite de 5 ajouts par jour (P0001)', async () => {
          const add = (n) => `insert into distributors (id, name, type, lat, lng, is_user_added, added_by, created_at)
              values ('itest-old-${n}', 'Fiche itest', 'other', 43.49, -1.47, true, ${USER}, '2000-01-01')`;
          const p = await probe(`${AS_USER} ${add(1)}; ${add(2)}; ${add(3)}; ${add(4)}; ${add(5)}; ${add(6)}`);
          assert.equal(p.reachedEnd, false, 'le 6e ajout aurait du etre refuse');
          assert.equal(p.code, 'P0001');
      });

      it('valeurs hors bornes a l’ajout : refusees (23514)', async () => {
          const CASES = [
              ['id hors format', `('itest bad!', 'Fiche itest', 'other', 43.49, -1.47, true, ${USER}, null, null)`],
              ['nom d’un caractere', `('itest-court', 'x', 'other', 43.49, -1.47, true, ${USER}, null, null)`],
              ['nom de 101 caracteres', `('itest-long', repeat('x', 101), 'other', 43.49, -1.47, true, ${USER}, null, null)`],
              ['latitude 91', `('itest-lat', 'Fiche itest', 'other', 91, -1.47, true, ${USER}, null, null)`],
              ['adresse de 201 caracteres', `('itest-adr', 'Fiche itest', 'other', 43.49, -1.47, true, ${USER}, repeat('a', 201), null)`],
              ['prix hors liste', `('itest-prix', 'Fiche itest', 'other', 43.49, -1.47, true, ${USER}, null, 'XXXX')`],
          ];
          for (const [label, values] of CASES) {
              const p = await probe(`${AS_USER} insert into distributors (${COLS}) values ${values}`);
              assert.equal(p.code, '23514', label);
          }
          const emoji = await probe(`${AS_USER} insert into distributors (id, name, type, emoji, lat, lng, is_user_added, added_by)
              values ('itest-emoji', 'Fiche itest', 'other', '<img>', 43.49, -1.47, true, ${USER})`);
          assert.equal(emoji.code, '23514', 'emoji avec chevrons');
      });

      it('niveau de prix hors liste : refuse (23514)', async () => {
          const p = await probe(`${AS_USER} update distributors set price_range = 'XXXX' where id = '${DEMO}'`);
          assert.equal(p.code, '23514');
      });

      it('niveau de prix : une seule fiche par requete pour l’API (42501) ; postgres n’est pas limite', async () => {
          const api = await probe(`${AS_USER} update distributors set price_range = price_range
              where id in (select id from distributors where is_demo and review_status = 'published' order by id limit 2)`);
          assert.equal(api.code, '42501');
          assert.match(api.message, /Une seule fiche/);
          const admin = await probe(`update distributors set price_range = price_range where is_demo;
              get diagnostics v_n = row_count; r := v_n::text`, 'v_n int;');
          assert.ok(admin.reachedEnd, admin.message);
          assert.ok(Number(admin.result) >= 2, admin.result);
      });

      it('compte bloque : ne change plus le niveau de prix (42501)', async () => {
          const p = await probe(`insert into signal_bans (user_id, reason) values (${USER}, 'itest');
              ${AS_USER} update distributors set price_range = price_range where id = '${DEMO}'`);
          assert.equal(p.code, '42501');
          assert.match(p.message, /Compte bloque/);
      });
  });
  ```
- **Doit échouer avant l'application de 027** (6 tests sur 7) : les insertions et mises à jour
  passent (`reachedEnd` vrai, `code` null) et les valeurs forgées sont gardées
  (`'false|false|false|<horodatage>|warning|4.9|999|Pas/Un_Fuseau'` pour le premier). Le test « fuseau connu conservé »
  passe déjà : c'est une non-régression, c'est normal.
- **Important** : ces tests visent la **vraie base**. Ils resteront rouges tant que Claude n'a pas
  appliqué 027 (voir « Application de la migration »). L'exécutant **ne doit pas** appliquer la
  migration ni chercher à faire passer ces tests autrement : il note dans la PR la sortie (6 échecs
  attendus dans le bloc « 027, SEC-05 », tout le reste vert).

### Test 2 — l'app envoie le fuseau (fonctionnel)
- **Fichier** : `tests/functional/doublons.spec.js`, test
  `« Publier ce distributeur » l’envoie a la base avec ses produits ; la fiche passe en attente de validation (EPIC-T21)`.
- Avant :
  ```js
          expect(posted.distributors).toMatchObject({ id: 'user-local-only', name: 'Machine locale de test', is_user_added: true });
  ```
  Après :
  ```js
          expect(posted.distributors).toMatchObject({ id: 'user-local-only', name: 'Machine locale de test', is_user_added: true, tz: expect.any(String) });   // SEC-05 : fuseau du telephone
  ```
- **Doit échouer avant l'étape 4** parce que `posted.distributors.tz` est `undefined`.

## Vérification (dans l'ordre)
```bash
npm test                                                     # tout vert, dont « cache-busting »
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/   # 200, sinon lancer le serveur à part
npx playwright test --project=functional -g "Publier ce distributeur"   # passed
npx playwright test --project=functional tests/functional/doublons.spec.js tests/functional/validation.spec.js   # tout vert
npx playwright test --project=functional -g "prix"           # tout vert (PATCH distributors inchangé)
node --test tests/integration/db.test.js                     # avant application de 027 : seuls 6 tests du bloc
                                                             # « ajout de fiche et niveau de prix (027, SEC-05) » échouent ;
                                                             # tout le reste vert (dont « aucune trace itest »)
npm run test:functional                                      # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
git diff --stat master                                       # seuls : supabase/027_distributor_insert_guard.sql,
                                                             # js/add-distributor.js, index.html, tests/integration/db.test.js,
                                                             # tests/functional/doublons.spec.js (+ BACKLOG.md si la story y figure)
```

## Application de la migration (Claude, modèle principal — jamais l'exécutant)
1. **Requête de contrôle, lecture seule**, avant toute application. L'écrire dans un fichier du
   scratchpad (le `€` est écrit `chr(8364)` pour éviter tout souci d'encodage en ligne de commande)
   puis `node scripts/supabase-sql.mjs <chemin absolu du fichier>` :
   ```sql
   select id, name, char_length(btrim(name)) as nom, char_length(address) as adresse,
          char_length(city) as ville, lat, lng, price_range, emoji, tz
     from distributors
    where id !~ '^[A-Za-z0-9_-]{1,64}$'
       or char_length(btrim(name)) not between 2 and 100
       or char_length(address) > 200
       or char_length(city) > 200
       or lat not between -90 and 90
       or lng not between -180 and 180
       or (price_range is not null
           and price_range not in (chr(8364), repeat(chr(8364), 2), repeat(chr(8364), 3)))
       or char_length(emoji) > 16
       or emoji ~ '[<>"''`;=]';
   ```
   Attendu : **0 ligne**. Sinon : ne pas appliquer, montrer les lignes à Stéphane et décider avec
   lui (corriger la donnée ou adapter la borne). Ne jamais corriger une fiche réelle sans son accord.
2. Appliquer : `node scripts/supabase-sql.mjs supabase/027_distributor_insert_guard.sql` → HTTP 201.
3. Lancer les deux requêtes du bloc « VERIFICATION » de la migration (8 contraintes `convalidated = true`,
   déclencheur `guard_distributor_update_scope` présent).
4. `node --test tests/integration/db.test.js` → **tout vert** (les 7 tests SEC-05 compris).
5. Fuseau des fiches existantes (facultatif, données du pilote, à signaler à Stéphane) :
   `select id, name, lat, lng, source, is_demo from distributors where tz is null order by created_at;`
   Si toutes les lignes sont en France métropolitaine (lat 41..51.5, lng -5.5..10) :
   `update distributors set tz = 'Europe/Paris' where tz is null and lat between 41 and 51.5 and lng between -5.5 and 10;`
   Sinon, demander à Stéphane pour les autres lignes.
6. Ordre libre avec la fusion du front : 027 ne retire aucun droit, l'app actuelle continue de marcher.

## Hors périmètre
- Historique des changements de prix et quota de changements par compte (RPC `set_price_range`,
  table `price_range_changes`) : story à part si le vandalisme se produit ; ici la portée (une fiche
  par requête), la valeur et le blocage suffisent à rendre l'attaque coûteuse et réparable fiche par fiche.
- Droits INSERT par colonne sur `distributors` (le déclencheur suffit, voir « Choix faits »).
- Limites sur `products` (longueur du nom, quota) : autre story.
- Message d'erreur réel à l'ajout (« 5 ajouts par jour » affiché comme un problème de réseau,
  `describePublishError`, js/add-distributor.js:435) : autre story.
- Paramètre fuseau dans `admin_review_distributor` et affichage dans la console admin.
- Mise à jour de la liste des migrations dans `CLAUDE.md` : faite par Claude après la fusion des
  stories SEC (évite les conflits entre 025, 026 et 027).
- `scripts/import-osm.mjs` : ne pas le toucher ni le relancer (décision Stéphane).
- Ancienne fiche restée sur le téléphone avec un nom d'1 caractère ou de plus de 100 : « Publier
  ce distributeur » recevra 23514 et le message générique « Publication impossible, réessaie plus
  tard (code 23514) ». Cas rare, non corrigé ici : **à signaler dans la PR**.

## Pièges connus
- Le déclencheur par instruction avec `referencing new table` n'accepte qu'**un seul** événement
  (`after update`, sans `of colonne`) et doit être `after` : ne pas écrire `before`, ni
  `after insert or update`, ni `update of price_range`.
- `guard_distributor_update_scope` **sans** `security definer` (sinon `current_user` vaut le
  propriétaire et la garde ne s'applique jamais) ; `guard_distributor_review` **reste**
  `security definer` avec `auth.role()`. Ne pas inverser.
- Ne pas recréer le déclencheur `guard_distributor_review` : `create or replace function` suffit.
- Garder `begin;` en tête et `commit;` avant le bloc de commentaires « VERIFICATION » : la migration
  est tout ou rien (un `VALIDATE` en échec annule tout).
- Dans la contrainte emoji, `''` est une apostrophe échappée en SQL : recopier `'[<>"''`;=]'` tel quel.
- « Publier ce distributeur » sur une ancienne fiche locale au nom d'1 caractère ou de plus de 100 :
  23514 et message générique. Ne pas corriger ici, le signaler dans la PR.
- Dans le bloc `do $$ … $$`, la regex se termine par `$'` : ce n'est pas une fin de bloc, ne pas la modifier.
- Les tests de la base restent rouges tant que 027 n'est pas appliquée : c'est attendu. **Ne jamais**
  lancer `node scripts/supabase-sql.mjs` (ni coller le SQL ailleurs) pour les faire passer.
- Tous les ids de test commencent par `itest` (le test « aucune trace itest » vérifie le nettoyage),
  et le bannissement de test a la raison `'itest'`.
- `v_other` se lit en tant que postgres (dans `declare`), jamais après `set local role authenticated`
  (`authenticated` ne lit pas `auth.users`).
- `rating` est `numeric(2,1)` : la valeur forcée 0 se lit `'0.0'`.
- `maxlength` compte en unités UTF-16, la base en caractères : la borne du front est donc au moins
  aussi stricte, pas de cas où le front accepte et la base refuse.
- Bump de **toutes** les entrées de l'import map à la **même** valeur, sinon le test `cache-busting` échoue.

## Terminé quand
- [ ] Contrôles passés, tests écrits (Test 2 échoue avant l'étape 4, passe après ; Test 1 échoue
      pour la raison annoncée, en attente de l'application de 027)
- [ ] Vérifications vertes (hors les 6 tests SEC-05 de la base, attendus rouges avant application)
- [ ] Captures iPhone : non (aucun changement visible, hors un message d'erreur)
- [ ] Story cochée dans BACKLOG.md si elle y figure (sinon le noter dans la PR), PR ouverte (non fusionnée)
- [ ] Après relecture : Claude applique 027 (section dédiée), relance `db.test.js` (tout vert) et l'écrit dans la PR

## Modèle de PR
**Titre** : `fix(securite): la base impose les valeurs d'un ajout et du niveau de prix`

**Corps** : constats corrigés (liste ci-dessus) ; cause (INSERT non restreint par 013, `price_range`
libre, UPDATE multi-fiches) ; correction (migration 027 : valeurs forcées dans `guard_distributor_review`,
8 contraintes (dont emoji), déclencheur une-fiche-par-requête + compte bloqué, le tout dans
`begin` / `commit` ; front : `tz`, `maxlength`, nom de 2 caractères minimum) ; tests ajoutés (7 tests
base, assertion `tz` en fonctionnel) ; sorties des commandes, dont `db.test.js` avec les 6 échecs
attendus ; mention en gras : **migration 027 à appliquer par Claude après la requête de contrôle, avant
de relancer db.test.js** ; limite connue : une ancienne fiche locale au nom d'1 caractère ou de plus
de 100 reçoit 23514 et un message générique à la publication (hors périmètre) ; `CLAUDE.md` mis à jour
par Claude après fusion ; éléments non faits (hors périmètre).
