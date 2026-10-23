# SEC-03 — Produits : plus de perte de données ni de vandalisme de masse

- **Lot** : 1. Sécurité · **Gravité** : élevé · **Niveau conseillé** : medium, relecture par un modèle plus fort avant fusion (SQL de droits)
- **Ordre** : s'exécute **après SEC-01** (fusionnée) et **avant SEC-04, SEC-05, SEC-06**.
  Branche créée à partir de `master` **à jour** (`git switch master && git pull` d'abord).
- **Branche** : `fix/produits-retrait-doux` · **Taille** : 1 migration SQL + 1 fichier JS + 3 fichiers de tests + `CLAUDE.md`.
  Au-dessus de la limite de 3, **exception acceptée** : la base et le front changent ensemble
  (le front ne peut plus faire de DELETE une fois la migration appliquée), à garder dans une seule PR.
- **Constats couverts** (rapport du 2026-10-21) :
  - Produits : n'importe quel compte peut effacer tout le catalogue et l'historique des signaux en une requête — `supabase/005_open_writes_for_authenticated.sql:47`
  - « Retirer » un produit efface définitivement tous ses signaux (ceux des autres membres et de l'exploitant), sans limite ni trace, même depuis un compte bloqué — `js/fiche-edit.js:232`
  - Produits : ni taille maximale, ni limite de débit, ni blocage des comptes bannis, ni auteur enregistré à l'ajout — `supabase/005_open_writes_for_authenticated.sql:38`
  - Produits ajoutables sur une fiche en attente ou refusée d'un autre membre, ou sans fiche du tout — `supabase/005_open_writes_for_authenticated.sql:40`

> **Application sur la vraie base** : c'est **Claude (modèle principal)** qui applique la migration
> 025, **après relecture**, puis fusionne. L'exécutant n'exécute **jamais** de SQL sur la base
> (ni `node scripts/supabase-sql.mjs`, ni SQL Editor). Voir la section « Après la PR (Claude) ».

## But
Plus personne ne peut, en une requête, effacer ou défigurer les produits de toutes les fiches :
« Retirer » cache le produit sans rien détruire (ses signaux restent), chaque écriture est
bornée, tracée et refusée aux comptes bloqués.

## User story
En tant que membre qui a signalé des produits, je veux que mes signaux ne disparaissent jamais
parce qu'un autre compte a retiré (ou voulu effacer) les produits, afin que l'état affiché et
mon activité restent justes, et que l'admin puisse tout restaurer.

**Critères d'acceptation**
- [ ] Un DELETE sur `products` par l'API est refusé (42501), pour un visiteur comme pour un compte.
- [ ] « Retirer » (menu de l'étiquette, fin des 7 s) appelle la RPC `remove_product` ; le produit
      disparaît pour tous, ses signaux restent en base, l'admin le restaure en une ligne SQL.
- [ ] Un produit retiré n'a plus d'état public (`product_availability`) et refuse tout nouveau signal (P0002).
- [ ] Une requête qui modifie plus de 5 produits, ou en ajoute plus de 10, est refusée (P0001).
- [ ] Un compte de `signal_bans` ne peut ni ajouter, ni renommer, ni retirer (42501).
- [ ] 31e écriture de produit dans l'heure pour un compte : refusée (P0001).
- [ ] Nom vide ou de plus de 80 caractères (après trim) : refusé (23514).
- [ ] Ajout refusé sur la fiche non publiée d'un autre membre et sans fiche ; accepté sur sa propre fiche en attente.
- [ ] Par l'API, un compte ne change que `name` (UPDATE) et ne pose que `distributor_id`, `name`, `available` (INSERT).
- [ ] Ajouter, renommer, retirer depuis la fiche marchent comme avant (tests fonctionnels verts).

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- **Retrait doux** : colonnes `removed_at` / `removed_by`. Plus de DELETE pour `anon` / `authenticated`.
  La lecture publique ne montre que les produits non retirés. Restauration par l'admin en SQL (pas d'écran).
- **Pourquoi une RPC `remove_product` et pas un UPDATE direct de `removed_at`** : la règle de
  lecture masque les produits retirés. Or Postgres applique la règle SELECT à la **nouvelle**
  ligne d'un UPDATE dès que la requête a un `WHERE` (ici `id = N`) : la ligne retirée ne passe
  plus la règle et l'UPDATE est refusé (« new row violates row-level security policy »). La RPC
  (`SECURITY DEFINER`, propriétaire `postgres`, qui ne subit pas la RLS) pose `removed_at` ; la
  garde par ligne s'applique quand même (elle lit `auth.role()` / `auth.uid()` dans le jeton).
- **Lectures du front** : `js/app.js:94` lit `distributors?select=*, products(...)`. PostgREST
  applique la RLS de `products` aux produits imbriqués : **aucune modification de `app.js`**.
  Aucun autre module ne lit `products` (le seul autre lecteur est la fonction serveur
  `push-notify`, en service role : inchangée). `my_activity()` (023) garde le nom des produits
  retirés dans l'historique du membre : voulu.
- **Limite par requête** : 5 pour un UPDATE ; **10** pour un INSERT, car `publishDistributor`
  (`js/add-distributor.js:328`) envoie jusqu'à 10 produits d'un coup à la création d'une fiche
  (formulaire limité à 10, `add-distributor.js:123`). Point à confirmer à la relecture.
- **Journal `product_edits`** : une ligne par écriture (ajout, renommage, retrait), illisible par
  l'API ; sert à la limite de 30 / heure / compte et d'historique pour restaurer.
- **Nom** : 1..80 caractères après trim en base (le front borne déjà à 60, `PRODUCT_NAME_MAX`).
  Contrainte posée `NOT VALID` puis validée si les lignes existantes la respectent.

## Avant de coder
**Lire en entier** : `supabase/005_open_writes_for_authenticated.sql`, `supabase/013_distributor_update_columns.sql`,
`supabase/022_distributor_review.sql` ; `js/fiche-edit.js` lignes 1-25 et 193-245 ;
`tests/integration/db.test.js` lignes 1-60 et 470-560 ; `tests/functional/fiche.spec.js` lignes 98-210 ;
`tests/functional/helpers.js` lignes 320-342.

**Réutiliser** (ne pas réécrire) : `distributor_is_published(text)` et `is_my_distributor(text)` (022),
table `signal_bans` (014), `probe` / `query` / `AS_USER` / `AS_ANON` / `USER` / `DEMO` / `DEVICE`
(`tests/integration/db.test.js`), `routeEditWrites` / `routeSignals` / `loginForTest` (`tests/functional/helpers.js`).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
ls supabase/                                                    # dernier fichier numéroté : 024_push_notifications.sql (aucun 025_*)
grep -rni "on products" supabase/*.sql
# attendu exactement 9 lignes : 001_schema.sql:87, 005:39, 005:43, 005:48, 006:66, 006:68, 006:86, 022:40, 022:41
grep -n "ON DELETE CASCADE" supabase/007_availability_signals.sql   # 2 lignes : 37 (distributor_id ... REFERENCES distributors(id)), 38 (product_id ... REFERENCES products(id))
grep -n "create or replace view product_availability" supabase/*.sql   # dernière définition : 020_operators.sql:233 (celle recopiée en section 9)
grep -n "const pre = \`select id into v_product from products where distributor_id = '\${DEMO}' order by id limit 1;" tests/integration/db.test.js   # ligne 386
grep -rn "from('products')" js/
# attendu exactement 4 lignes : add-distributor.js:328 (insert), fiche-edit.js:196 (update),
# fiche-edit.js:232 (delete), fiche-edit.js:379 (insert)
grep -n "products(id, name, price, available)" js/app.js          # ligne 94
grep -n "insert into products (distributor_id, name, price, available)" tests/integration/db.test.js   # ligne 506
grep -n "// EPIC-T22 (023) : un signal ne revele pas son auteur" tests/integration/db.test.js           # ligne 556
grep -n "method === 'DELETE'" tests/functional/fiche.spec.js       # lignes 191, 204, 205, 206
grep -rn "remove_product" js/ tests/                             # aucun résultat
grep -o '"./js/app.js": "./js/app.js?v=[0-9]*"' index.html         # noter la valeur V (ex. 91)
```

## Étapes

1. **supabase/025_product_soft_delete.sql** — nouveau fichier (outil Write), contenu **exact** :
   ```sql
   -- ============================================================================
   -- 025 : produits : retrait doux, droits par colonne, garde-fous (SEC-03)
   -- ============================================================================
   -- Revue du 2026-10-21. Avant : tout compte connecte pouvait, en une requete,
   -- supprimer tous les produits (DELETE ouvert par 005) et, par la cascade de 007
   -- (availability_signals.product_id ON DELETE CASCADE), tous leurs signaux ;
   -- aucune limite, aucune trace, comptes bloques acceptes, fiche non publiee d'un
   -- autre membre modifiable, nom sans longueur maximale.
   -- Apres :
   --   1. « Retirer » = retrait doux (removed_at / removed_by) par la RPC
   --      remove_product(id). Le produit et ses signaux restent en base ; il
   --      disparait de la lecture publique (produits imbriques compris). Plus aucun
   --      DELETE par l'API. Pas d'UPDATE direct de removed_at : la regle de lecture
   --      masquant les produits retires, Postgres refuserait la nouvelle ligne.
   --   2. Droits par colonne (modele de 013) : authenticated INSERT (distributor_id,
   --      name, available) et UPDATE (name) ; anon : rien.
   --   3. Nom de 1 a 80 caracteres apres trim ; fiche obligatoire.
   --   4. Ecriture refusee sur une fiche non publiee sauf pour son auteur, aux comptes
   --      bloques (signal_bans), au-dela de 30 ecritures / heure / compte. Chaque
   --      ecriture est journalisee dans product_edits (illisible par l'API).
   --   5. Une requete qui modifie plus de 5 produits, ou en ajoute plus de 10 (le
   --      formulaire d'ajout d'une fiche en envoie jusqu'a 10), est refusee.
   --   6. admin_pending_distributors() ne liste plus les produits retires.
   --   7. Un produit retire n'a plus d'etat public (vue product_availability) et
   --      ne recoit plus de signal (sauf les signaux de demo du seed nocturne).
   -- En tant que postgres sans jeton (SQL Editor, scripts, pg_cron), les gardes
   -- ne s'appliquent pas (auth.role() vide).
   -- Idempotente, en une seule transaction (un echec entre « drop policy » et
   -- « create policy » laisserait products illisible). Execution (Claude, apres relecture) :
   --   node scripts/supabase-sql.mjs supabase/025_product_soft_delete.sql
   -- ============================================================================

   begin;

   -- ---------------------------------------------------------------------------
   -- 1. Colonnes et contraintes
   -- ---------------------------------------------------------------------------
   alter table products
     add column if not exists removed_at timestamptz,
     add column if not exists removed_by uuid references auth.users(id) on delete set null;

   -- Lignes sans fiche : invisibles (022) et sans signal possible (la RPC des signaux
   -- exige la fiche) : supprimees, puis la fiche devient obligatoire
   delete from products where distributor_id is null;
   alter table products alter column distributor_id set not null;

   do $$
   begin
     if not exists (select 1 from pg_constraint where conname = 'products_name_len') then
       alter table products add constraint products_name_len
         check (char_length(btrim(name)) between 1 and 80) not valid;
     end if;
     -- Validee si les lignes existantes la respectent ; sinon elle ne vaut que pour
     -- les nouvelles ecritures (corriger les noms puis valider a la main)
     if not exists (select 1 from products where char_length(btrim(name)) not between 1 and 80) then
       alter table products validate constraint products_name_len;
     end if;
   end $$;

   -- ---------------------------------------------------------------------------
   -- 2. Journal des ecritures : limite de debit + historique pour restaurer
   -- ---------------------------------------------------------------------------
   create table if not exists product_edits (
     id bigint generated always as identity primary key,
     product_id bigint,              -- sans cle etrangere : ecrit AVANT l'ajout du produit, survit au produit
     distributor_id text,
     user_id uuid references auth.users(id) on delete set null,
     action text not null check (action in ('add', 'rename', 'remove')),
     old_name text,
     new_name text,
     created_at timestamptz not null default now()
   );
   create index if not exists product_edits_user_recent on product_edits (user_id, created_at desc);
   create index if not exists product_edits_product on product_edits (product_id);
   alter table product_edits enable row level security;   -- 0 policy : invisible par l'API
   revoke all on product_edits from anon, authenticated;

   -- ---------------------------------------------------------------------------
   -- 3. Droits par colonne (les droits par defaut de Supabase couvraient tout)
   -- ---------------------------------------------------------------------------
   revoke insert, update, delete, truncate on products from anon, authenticated;
   grant insert (distributor_id, name, available) on products to authenticated;
   grant update (name) on products to authenticated;

   -- ---------------------------------------------------------------------------
   -- 4. Regles RLS : remplacent celles de 005 et la lecture de 022
   -- ---------------------------------------------------------------------------
   drop policy if exists "Ajout produits par users authentifies" on products;
   drop policy if exists "Modif produits par users authentifies" on products;
   drop policy if exists "Suppression produits par users authentifies" on products;
   drop policy if exists "Lecture publique produits" on products;

   -- Lecture : produit non retire d'une fiche visible (la lecture des fiches filtre
   -- deja publiee / auteur / admin). Aucun appel de fonction : rien a ouvrir a anon.
   create policy "Lecture publique produits" on products for select
     using (removed_at is null and exists (select 1 from distributors d where d.id = products.distributor_id));

   create policy "Ajout produits par users authentifies" on products for insert to authenticated
     with check (auth.uid() is not null
                 and (distributor_is_published(distributor_id) or is_my_distributor(distributor_id)));

   create policy "Modif produits par users authentifies" on products for update to authenticated
     using (auth.uid() is not null and removed_at is null)
     with check (auth.uid() is not null
                 and (distributor_is_published(distributor_id) or is_my_distributor(distributor_id)));
   -- Aucune regle DELETE : refus par defaut (et droit DELETE retire ci-dessus)

   -- ---------------------------------------------------------------------------
   -- 5. Garde par ligne : compte, blocage, fiche, debit, journal
   -- ---------------------------------------------------------------------------
   create or replace function guard_product_write() returns trigger
   language plpgsql security definer set search_path = public as $$
   declare
     v_uid uuid := auth.uid();
     v_action text;
     v_old_name text;
   begin
     -- postgres sans jeton (SQL Editor, scripts, pg_cron) : pas de garde
     if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
       return new;
     end if;
     if v_uid is null then
       raise exception 'Connexion requise pour modifier un produit' using errcode = '28000';
     end if;
     if exists (select 1 from signal_bans where user_id = v_uid) then
       raise exception 'Ce compte ne peut plus modifier de produits' using errcode = '42501';
     end if;
     -- Aussi verifie ici car la RPC remove_product ne passe pas par la RLS
     if not (distributor_is_published(new.distributor_id) or is_my_distributor(new.distributor_id)) then
       raise exception 'Distributeur pas encore publie' using errcode = '42501';
     end if;
     if tg_op = 'INSERT' then
       v_action := 'add';
       new.removed_at := null;
       new.removed_by := null;
     else
       v_old_name := old.name;
       if old.removed_at is not null then
         raise exception 'Produit deja retire' using errcode = 'P0002';
       elsif new.removed_at is not null then
         v_action := 'remove';
         new.removed_at := now();
         new.removed_by := v_uid;
       else
         v_action := 'rename';
       end if;
     end if;
     new.name := btrim(new.name);
     if (select count(*) from product_edits
         where user_id = v_uid and created_at > now() - interval '1 hour') >= 30 then
       raise exception 'Trop de modifications de produits pour ce compte, reessaie plus tard' using errcode = 'P0001';
     end if;
     insert into product_edits (product_id, distributor_id, user_id, action, old_name, new_name)
     values (new.id, new.distributor_id, v_uid, v_action, v_old_name, new.name);
     return new;
   end;
   $$;
   drop trigger if exists guard_product_write on products;
   create trigger guard_product_write before insert or update on products
     for each row execute function guard_product_write();

   -- ---------------------------------------------------------------------------
   -- 6. Garde par requete : pas d'ecriture en masse
   -- (deux declencheurs : une table de transition n'accepte qu'un seul evenement)
   -- ---------------------------------------------------------------------------
   create or replace function guard_product_bulk() returns trigger
   language plpgsql security definer set search_path = public as $$
   begin
     if coalesce(auth.role(), '') in ('anon', 'authenticated')
        and (select count(*) from changed_rows) > case when tg_op = 'INSERT' then 10 else 5 end then
       raise exception 'Trop de produits en une seule requete' using errcode = 'P0001';
     end if;
     return null;
   end;
   $$;
   drop trigger if exists guard_product_bulk_insert on products;
   create trigger guard_product_bulk_insert after insert on products
     referencing new table as changed_rows
     for each statement execute function guard_product_bulk();
   drop trigger if exists guard_product_bulk_update on products;
   create trigger guard_product_bulk_update after update on products
     referencing new table as changed_rows
     for each statement execute function guard_product_bulk();

   -- ---------------------------------------------------------------------------
   -- 7. Retirer un produit : seule voie (« Retirer » de la fiche, js/fiche-edit.js)
   -- ---------------------------------------------------------------------------
   create or replace function remove_product(p_product_id bigint) returns void
   language plpgsql security definer set search_path = public as $$
   begin
     if auth.uid() is null then
       raise exception 'Connexion requise pour retirer un produit' using errcode = '28000';
     end if;
     -- guard_product_write verifie blocage, fiche et debit, pose removed_at /
     -- removed_by et journalise
     update products set removed_at = now() where id = p_product_id and removed_at is null;
     if not found then
       raise exception 'Produit % introuvable ou deja retire', p_product_id using errcode = 'P0002';
     end if;
   end;
   $$;
   revoke execute on function remove_product(bigint) from public, anon;
   grant execute on function remove_product(bigint) to authenticated;

   -- ---------------------------------------------------------------------------
   -- 8. Console admin : fiches en attente sans les produits retires (copie de 022)
   -- ---------------------------------------------------------------------------
   create or replace function admin_pending_distributors()
   returns table (id text, name text, type text, emoji text, address text, city text, lat double precision, lng double precision,
                  created_at timestamptz, email text, products text[], unread bigint)
   language plpgsql stable security definer set search_path = public as $$
   begin
     if not is_admin() then
       raise exception 'Reserve a l''admin' using errcode = '42501';
     end if;
     return query
       select d.id, d.name, d.type, d.emoji, d.address, d.city, d.lat::double precision, d.lng::double precision,
              d.created_at, u.email::text,
              coalesce((select array_agg(p.name order by p.id) from products p where p.distributor_id = d.id and p.removed_at is null), '{}'),
              (select count(*) from distributor_review_messages m where m.distributor_id = d.id and m.author = 'member'
                 and m.created_at > coalesce((select max(a.created_at) from distributor_review_messages a where a.distributor_id = d.id and a.author = 'admin'), '-infinity'))
       from distributors d
       left join auth.users u on u.id = d.added_by
       where d.review_status = 'pending'
       order by d.created_at;
   end;
   $$;

   -- ---------------------------------------------------------------------------
   -- 9. Un produit retire n'a plus d'etat public
   -- (reprise exacte de la vue de 020, seule la clause « where exists » est ajoutee)
   -- ---------------------------------------------------------------------------
   create or replace view product_availability with (security_invoker = true) as
   with latest as (
     select distinct on (distributor_id, product_id) id, distributor_id, product_id, state, source, created_at
     from availability_signals where product_id is not null
     order by distributor_id, product_id, created_at desc
   ), owner_latest as (
     select distinct on (distributor_id, product_id) id, distributor_id, product_id, state, created_at
     from availability_signals where product_id is not null and source = 'owner'
     order by distributor_id, product_id, created_at desc
   )
   select s.distributor_id, s.product_id, s.state, s.source, s.weight, s.created_at,
          (extract(epoch from (now() - s.created_at)))::bigint as age_seconds
   from latest l
   left join owner_latest o on o.distributor_id = l.distributor_id and o.product_id = l.product_id
   join availability_signals s on s.id = case
     when o.id is not null and l.source <> 'owner' and o.state <> l.state
          and l.created_at - o.created_at <= interval '30 minutes' then o.id
     else l.id end
   where exists (select 1 from products p where p.id = l.product_id and p.removed_at is null);

   -- ---------------------------------------------------------------------------
   -- 10. Plus de signal sur un produit retire (sauf demo : seed nocturne de 017)
   -- confirm_availability n'est pas recopiee ici (SEC-06 la reprend) : le refus
   -- vient de ce declencheur, appele par son INSERT.
   -- ---------------------------------------------------------------------------
   create or replace function guard_signal_removed_product() returns trigger
   language plpgsql security definer set search_path = public as $$
   begin
     if new.product_id is not null
        and coalesce(new.device_hash, '') not like 'demo-%'
        and exists (select 1 from products where id = new.product_id and removed_at is not null) then
       raise exception 'Produit % retire', new.product_id using errcode = 'P0002';
     end if;
     return new;
   end;
   $$;
   drop trigger if exists guard_signal_removed_product on availability_signals;
   create trigger guard_signal_removed_product before insert on availability_signals
     for each row execute function guard_signal_removed_product();

   commit;

   -- ============================================================================
   -- MODE D'EMPLOI (admin : SQL Editor ou node scripts/supabase-sql.mjs -e "...")
   -- ============================================================================
   -- Restaurer un produit retire :
   --   update products set removed_at = null, removed_by = null where id = <id>;
   -- Restaurer tout ce qu'un compte a retire depuis une date :
   --   update products set removed_at = null, removed_by = null
   --    where id in (select product_id from product_edits
   --                  where user_id = '<uuid>' and action = 'remove' and created_at > '<date>');
   -- Historique d'un compte (ancien nom pour annuler un renommage) :
   --   select product_id, action, old_name, new_name, created_at from product_edits
   --    where user_id = '<uuid>' order by created_at desc;
   -- Bloquer un compte (produits, signaux, avis, demandes) : select purge_user_signals('<uuid>', true, 'motif'); (014)
   --
   -- VERIFICATION
   -- select grantee, privilege_type, column_name from information_schema.column_privileges
   --  where table_name = 'products' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
   --    and grantee in ('anon', 'authenticated') order by 1, 2, 3;
   -- -> authenticated | INSERT | available / distributor_id / name ; authenticated | UPDATE | name
   ```

2. **js/fiche-edit.js** — « Retirer » appelle la RPC `remove_product` au lieu d'un DELETE.
   a) En-tête, avant :
   ```js
    *   - retirer : toast « Annuler » 7 s, la suppression en base n'a lieu qu'a la fin
    *     du delai ;
   ```
   après :
   ```js
    *   - retirer : toast « Annuler » 7 s, le retrait en base (doux, SEC-03 : le produit
    *     et ses signaux restent, l'admin peut le restaurer) n'a lieu qu'a la fin du delai ;
   ```
   b) En-tête, avant :
   ```js
    * est un privilege de compte). RLS : 005 (products), 013 (price_range).
   ```
   après :
   ```js
    * est un privilege de compte). Base : 025 (products : droits par colonne, retrait
    * par la RPC remove_product), 013 (price_range).
   ```
   c) Remplacer toute la fonction `deleteProductForGood`, avant :
   ```js
   async function deleteProductForGood(d, product, index) {
       let error = null;
       if (!supabaseClient) {
           error = { message: 'Service indisponible' };
       } else {
           try {
               const query = supabaseClient.from('products').delete();
               ({ error } = product.id !== null && product.id !== undefined && product.id !== ''
                   ? await query.eq('id', product.id)
                   : await query.eq('distributor_id', d.id).eq('name', product.name));
           } catch (e) {
               error = e;
           }
       }
       if (!error) return;
   ```
   après :
   ```js
   // SEC-03 (migration 025) : retrait doux par la RPC remove_product. Plus aucun DELETE :
   // le produit et ses signaux restent en base, il disparait pour tous.
   async function deleteProductForGood(d, product, index) {
       let error = null;
       if (!supabaseClient) {
           error = { message: 'Service indisponible' };
       } else if (product.id === null || product.id === undefined || product.id === '') {
           error = { message: 'Produit sans identifiant' };
       } else {
           try {
               ({ error } = await supabaseClient.rpc('remove_product', { p_product_id: Number(product.id) }));
           } catch (e) {
               error = e;
           }
       }
       // P0002 : deja retire (par un autre membre) : le resultat est le meme
       if (!error || error.code === 'P0002') return;
   ```
   Le reste de la fonction (`console.warn`, remise en place, `showToast`) ne change pas.
   Le menu « Retirer » n'apparaît que pour un produit à id entier (`isSignalableProduct`,
   `js/distributor.js:133`) : l'ancien repli « par nom » ne servait jamais.

3. **CLAUDE.md** — documenter la migration (deux remplacements, texte sans accents comme le reste).
   a) Ligne UC2, avant :
   ```
   | UC2 | Contribution publique | Produits au toucher (ajouter / renommer / retirer) et niveau de prix, sans mode edition (EPIC-T12) | OUI | Supabase `products` (005), `distributors.price_range` (013) |
   ```
   après :
   ```
   | UC2 | Contribution publique | Produits au toucher (ajouter / renommer / retirer) et niveau de prix, sans mode edition (EPIC-T12) | OUI | Supabase `products` (025 : retirer = retrait doux par la RPC `remove_product`, 30 ecritures / heure / compte, comptes bloques refuses), `distributors.price_range` (013) |
   ```
   b) Liste des migrations, avant (morceau unique de la ligne) :
   ```
   valeurs dans `.env.local`, jamais dans le depot). Tables utilisees par le front
   ```
   après :
   ```
   valeurs dans `.env.local`, jamais dans le depot), `025_product_soft_delete` (SEC-03 : « Retirer » = retrait doux `removed_at` / `removed_by` par la RPC `remove_product`, les signaux restent, mais plus d'etat public (vue `product_availability`) ni de nouveau signal (declencheur `guard_signal_removed_product`, sauf demo) ; plus aucun DELETE sur `products` par l'API ; droits par colonne : INSERT `distributor_id` / `name` / `available`, UPDATE `name` ; nom 1..80 ; ecriture refusee sur une fiche non publiee sauf pour son auteur, aux comptes bloques, au-dela de 30 / heure / compte (journal `product_edits`, illisible par l'API) ou de 5 produits modifies / 10 ajoutes par requete ; restauration par l'admin en SQL, mode d'emploi en fin de fichier). Tables utilisees par le front
   ```

4. **index.html** — `js/fiche-edit.js` change : monter le `?v=` de **toutes** les entrées de
   l'import map à la même valeur V+1 (V noté aux contrôles). Aucun CSS ne change.

## Tests

### Test 1 — base (intégration, vraie base, transactions annulées)
- **Fichier** : `tests/integration/db.test.js`.
- **a) Corriger le test existant de 022** (ligne 506) : il insère `price`, colonne que 025 n'autorise plus.
  Avant :
  ```js
              insert into products (distributor_id, name, price, available) values ('itest-rev', 'Produit itest', 0, true);
  ```
  après :
  ```js
              insert into products (distributor_id, name, available) values ('itest-rev', 'Produit itest', true);
  ```
- **a bis) Corriger le test existant de 020** « priorite : exploitant contredit... » (ligne 386) :
  il prend le premier produit de la démo, qui pourrait être retiré (alors plus de signal accepté
  ni d'état lisible). Avant :
  ```js
          const pre = `select id into v_product from products where distributor_id = '${DEMO}' order by id limit 1; delete from availability_signals where product_id = v_product;`;
  ```
  après :
  ```js
          const pre = `select id into v_product from products where distributor_id = '${DEMO}' and removed_at is null order by id limit 1; delete from availability_signals where product_id = v_product;`;
  ```
- **b) Nouveau bloc**, inséré juste **AVANT** la ligne `// EPIC-T22 (023) : un signal ne revele pas son auteur ; journal du compte`
  (et non après le bloc 022 de façon approximative : SEC-05 utilisera la même ancre et viendra après) :
  ```js
  // SEC-03 (025) : produits : retrait doux, droits par colonne, garde-fous
  describe('base : produits (025)', { skip: SKIP }, () => {
      // Journal du compte vide (dans la transaction annulee) : la limite de 30 / heure ne gene pas les autres cas
      const FRESH = `delete from product_edits where user_id = ${USER};`;
      // Retour en postgres SANS jeton : comme le SQL Editor (gardes inactives)
      const AS_POSTGRES = `perform set_config('request.jwt.claims', '', true); reset role;`;
      const FIRST = `select id into v_product from products where distributor_id = '${DEMO}' and removed_at is null order by id limit 1;`;
      const OTHER = `(select id from auth.users where id <> ${USER} order by created_at limit 1)`;
      const ADD_PENDING = `insert into distributors (id, name, type, lat, lng, is_user_added, added_by) values ('itest-prod', 'Fiche itest', 'pizza', 43.49, -1.47, true, ${USER})`;
      const insertProduct = (name = "'Produit itest'", fiche = DEMO) =>
          `insert into products (distributor_id, name, available) values ('${fiche}', ${name}, true)`;

      it('personne ne supprime un produit par l’API (DELETE refuse, 42501)', async () => {
          for (const role of [AS_USER, AS_ANON]) {
              const p = await probe(`${FIRST} ${role} delete from products where id = v_product`, 'v_product bigint;');
              assert.equal(p.reachedEnd, false);
              assert.equal(p.code, '42501');
          }
      });

      it('retirer = retrait doux : les signaux restent, le produit disparait pour tous, l’admin le restaure en SQL', async () => {
          const p = await probe(`${FRESH} ${FIRST}
              insert into availability_signals (distributor_id, product_id, state, source, weight, device_hash, user_id)
              values ('${DEMO}', v_product, 'available', 'user', 0.8, '${DEVICE}', null);
              v_before := (select count(*) from availability_signals where product_id = v_product);
              ${AS_USER} perform remove_product(v_product);
              v_seen_user := (select count(*) from products where id = v_product);
              ${AS_ANON} v_seen_anon := (select count(*) from products where id = v_product);
              v_state_anon := (select count(*) from product_availability where product_id = v_product);
              ${AS_POSTGRES}
              r := json_build_object(
                  'signaux_avant', v_before,
                  'signaux_apres', (select count(*) from availability_signals where product_id = v_product),
                  'retire_par_moi', (select removed_at is not null and removed_by = ${USER} from products where id = v_product),
                  'journal', (select action from product_edits where product_id = v_product and user_id = ${USER} order by id desc limit 1),
                  'vu_membre', v_seen_user,
                  'vu_visiteur', v_seen_anon,
                  'etat_visiteur', v_state_anon
              )::text;
              update products set removed_at = null, removed_by = null where id = v_product;
              ${AS_ANON} r := r || '|' || (select count(*) from products where id = v_product)::text`,
              'v_product bigint; v_before int; v_seen_user int; v_seen_anon int; v_state_anon int;');
          assert.ok(p.reachedEnd, p.message);
          const [json, restored] = p.result.split('|');
          const res = JSON.parse(json);
          assert.ok(res.signaux_avant >= 1);
          assert.equal(res.signaux_apres, res.signaux_avant, 'aucun signal efface');
          assert.equal(res.retire_par_moi, true);
          assert.equal(res.journal, 'remove');
          assert.equal(res.vu_membre, 0);
          assert.equal(res.vu_visiteur, 0);
          assert.equal(res.etat_visiteur, 0, 'plus d’etat public (vue product_availability)');
          assert.equal(restored, '1', 'restaure par l’admin : de nouveau visible');
      });

      it('produit retire : plus aucun signal accepte (P0002)', async () => {
          const p = await probe(`${FRESH} ${FIRST} ${AS_USER} perform remove_product(v_product);
              perform confirm_availability('${DEMO}', '${DEVICE}', jsonb_build_array(jsonb_build_object('product_id', v_product, 'state', 'available')), null)`,
              'v_product bigint;');
          assert.equal(p.reachedEnd, false);
          assert.equal(p.code, 'P0002');
          assert.match(p.message, /retire/);
      });

      it('retirer deux fois : P0002 ; sans compte : refuse (42501)', async () => {
          const twice = await probe(`${FRESH} ${FIRST} ${AS_USER} perform remove_product(v_product); perform remove_product(v_product)`, 'v_product bigint;');
          assert.equal(twice.code, 'P0002');
          const anon = await probe(`${FIRST} ${AS_ANON} perform remove_product(v_product)`, 'v_product bigint;');
          assert.equal(anon.code, '42501');
      });

      it('renommer : accepte, nom nettoye, ancien nom journalise ; rien d’autre ne se change par l’API', async () => {
          const p = await probe(`${FRESH} ${FIRST} ${AS_USER}
              update products set name = '  Nom itest  ' where id = v_product;
              ${AS_POSTGRES}
              r := (select name from products where id = v_product) || '|'
                || (select action || '|' || (old_name is not null)::text || '|' || new_name
                      from product_edits where product_id = v_product and user_id = ${USER} order by id desc limit 1)`,
              'v_product bigint;');
          assert.ok(p.reachedEnd, p.message);
          assert.equal(p.result, 'Nom itest|rename|true|Nom itest');
          for (const set of ['distributor_id = distributor_id', 'price = 1', 'removed_at = now()', 'available = false']) {
              const k = await probe(`${FIRST} ${AS_USER} update products set ${set} where id = v_product`, 'v_product bigint;');
              assert.equal(k.code, '42501', set);
          }
          const price = await probe(`${AS_USER} insert into products (distributor_id, name, price, available) values ('${DEMO}', 'Produit itest', 1, true)`);
          assert.equal(price.code, '42501');
          const anon = await probe(`${AS_ANON} ${insertProduct()}`);
          assert.equal(anon.code, '42501');
      });

      it('une requete qui modifie plus de 5 produits ou en ajoute plus de 10 : refusee (P0001)', async () => {
          const [c] = await query("select count(*)::int as n from products p join distributors d on d.id = p.distributor_id where d.is_demo and d.review_status = 'published'");
          assert.ok(c.n >= 6, 'il faut au moins 6 produits de demo');
          const demo6 = (n) => `update products set name = name where id in (
              select id from products where distributor_id in (select id from distributors where is_demo) order by id limit ${n})`;
          const six = await probe(`${FRESH} ${AS_USER} ${demo6(6)}`);
          assert.equal(six.reachedEnd, false);
          assert.equal(six.code, 'P0001');
          assert.match(six.message, /une seule requete/);
          const five = await probe(`${FRESH} ${AS_USER} ${demo6(5)}; get diagnostics v_n = row_count; r := v_n::text`, 'v_n int;');
          assert.ok(five.reachedEnd, five.message);
          assert.equal(five.result, '5');
          const eleven = await probe(`${FRESH} ${AS_USER}
              insert into products (distributor_id, name, available)
              select '${DEMO}', 'Produit itest ' || g, true from generate_series(1, 11) g`);
          assert.equal(eleven.code, 'P0001');
          assert.match(eleven.message, /une seule requete/);
      });

      it('compte bloque : ni ajout, ni renommage, ni retrait (42501)', async () => {
          const BAN = `insert into signal_bans (user_id, reason) values (${USER}, 'itest');`;
          for (const action of [insertProduct(), 'update products set name = name where id = v_product', 'perform remove_product(v_product)']) {
              const p = await probe(`${BAN} ${FIRST} ${AS_USER} ${action}`, 'v_product bigint;');
              assert.equal(p.code, '42501', action);
              assert.match(p.message, /ne peut plus modifier/, action);
          }
      });

      it('nom vide ou de plus de 80 caracteres : refuse (23514) ; 80 caracteres : accepte', async () => {
          assert.equal((await probe(`${FRESH} ${AS_USER} ${insertProduct("repeat('a', 81)")}`)).code, '23514');
          assert.equal((await probe(`${FRESH} ${AS_USER} ${insertProduct("'   '")}`)).code, '23514');
          const ok = await probe(`${FRESH} ${AS_USER} ${insertProduct("repeat('a', 80)")}`);
          assert.ok(ok.reachedEnd, ok.message);
      });

      it('31e ecriture de produit dans l’heure pour un compte : refusee (P0001)', async () => {
          const p = await probe(`${FRESH}
              insert into product_edits (distributor_id, user_id, action, new_name)
              select '${DEMO}', ${USER}, 'add', 'itest' from generate_series(1, 30);
              ${AS_USER} ${insertProduct()}`);
          assert.equal(p.code, 'P0001');
          assert.match(p.message, /ce compte/);
      });

      it('fiche en attente : son auteur y ajoute un produit, un autre compte non ; sans fiche : refuse', async () => {
          const own = await probe(`${FRESH} ${AS_USER} ${ADD_PENDING}; ${insertProduct("'Produit itest'", 'itest-prod')};
              r := (select count(*) from products where distributor_id = 'itest-prod')::text`);
          assert.ok(own.reachedEnd, own.message);
          assert.equal(own.result, '1');
          const other = await probe(`${FRESH} ${AS_USER} ${ADD_PENDING};
              ${AS_POSTGRES} update distributors set added_by = ${OTHER} where id = 'itest-prod';
              ${AS_USER} ${insertProduct("'Produit itest'", 'itest-prod')}`);
          assert.equal(other.code, '42501');
          const orphan = await probe(`${FRESH} ${AS_USER} insert into products (distributor_id, name, available) values (null, 'Produit itest', true)`);
          assert.equal(orphan.code, '42501');
      });
  });
  ```
- **Doit échouer avant l'application de 025** : la colonne `removed_at`, la table `product_edits`
  et la RPC `remove_product` n'existent pas encore (codes 42703 / 42P01 / 42883), et le DELETE
  est accepté. **L'exécutant ne peut pas les faire passer** (il n'applique pas la migration) :
  il les lance une fois, constate l'échec, colle la sortie dans la PR. Claude les fait passer
  après application (section « Après la PR »). Tous les **autres** tests de `db.test.js`
  doivent rester verts, **sauf** le test 020 corrigé en a bis : il lit `removed_at`, colonne
  absente avant 025 (42703), donc rouge lui aussi jusqu'à l'application ; le test 022 corrigé
  en a reste vert.
- Sans jeton dans `.env.local`, tout le fichier est sauté : le noter dans la PR, ne rien contourner.

### Test 2 — fiche (fonctionnel, serveur simulé)
- **Fichier** : `tests/functional/helpers.js`, fonction `routeEditWrites`. Avant :
  ```js
      await page.route(url => url.pathname.endsWith('/rest/v1/products'), handler('products'));
      await page.route(url => url.pathname.endsWith('/rest/v1/distributors'), handler('distributors'));
  ```
  après :
  ```js
      await page.route(url => url.pathname.endsWith('/rest/v1/products'), handler('products'));
      await page.route(url => url.pathname.endsWith('/rest/v1/distributors'), handler('distributors'));
      // SEC-03 : « Retirer » passe par la RPC remove_product (retrait doux)
      await page.route(url => url.pathname.endsWith('/rest/v1/rpc/remove_product'), handler('rpc/remove_product'));
  ```
- **Fichier** : `tests/functional/fiche.spec.js`, bloc `5bis. Modifier au toucher (EPIC-T12)`.
  a) `openEditable` accepte un refus simulé. Avant (3 lignes, uniques ensemble ; la 3e ligne seule
  existe aussi ligne 281, ne pas la remplacer là) :
  ```js
      async function openEditable(page, { products } = {}) {
          await routeSignals(page);
          const log = await routeEditWrites(page);
  ```
  après :
  ```js
      async function openEditable(page, { products, fail } = {}) {
          await routeSignals(page);
          const log = await routeEditWrites(page, { fail });
  ```
  b) Test « retirer : menu -> Retirer, toast « Annuler » ... », avant :
  ```js
          await page.waitForTimeout(500);
          expect(log.filter(l => l.method === 'DELETE')).toEqual([]);
      });
  ```
  après :
  ```js
          await page.waitForTimeout(500);
          expect(log.filter(l => l.method === 'DELETE' || l.table === 'rpc/remove_product')).toEqual([]);
      });
  ```
  c) Remplacer tout le test « retirer : la suppression part a la fin du delai (7 s) ; plus de menu au clic droit », avant :
  ```js
      test('retirer : la suppression part a la fin du delai (7 s) ; plus de menu au clic droit', async ({ page }) => {
          const { log } = await openEditable(page);
          const second = page.locator('#dist-products-list .product-row[data-editable]').nth(1);
          const pid = await second.getAttribute('data-product-id');
          await second.click({ button: 'right' });
          await expect(second.locator('.product-choices')).toBeHidden();
          await second.locator('.product-status-btn').click();
          await second.locator('.product-menu-action[data-action="remove"]').click();
          await page.mouse.move(5, 5);   // un toast survole ne s'efface pas
          await expect(page.locator(`#dist-products-list .product-row[data-product-id="${pid}"]`)).toHaveCount(0);
          expect(log.filter(l => l.method === 'DELETE')).toEqual([]);   // pas tout de suite
          await expect.poll(() => log.filter(l => l.method === 'DELETE').length, { timeout: 10000 }).toBe(1);
          expect(log.find(l => l.method === 'DELETE').query).toBe(`?id=eq.${pid}`);
      });
  ```
  après (le test modifié + deux nouveaux) :
  ```js
      test('retirer : le retrait part a la fin du delai (7 s) par remove_product, jamais un DELETE ; plus de menu au clic droit', async ({ page }) => {
          const { log } = await openEditable(page);
          const second = page.locator('#dist-products-list .product-row[data-editable]').nth(1);
          const pid = await second.getAttribute('data-product-id');
          await second.click({ button: 'right' });
          await expect(second.locator('.product-choices')).toBeHidden();
          await second.locator('.product-status-btn').click();
          await second.locator('.product-menu-action[data-action="remove"]').click();
          await page.mouse.move(5, 5);   // un toast survole ne s'efface pas
          await expect(page.locator(`#dist-products-list .product-row[data-product-id="${pid}"]`)).toHaveCount(0);
          const removals = () => log.filter(l => l.table === 'rpc/remove_product');
          expect(removals()).toEqual([]);   // pas tout de suite
          await expect.poll(() => removals().length, { timeout: 10000 }).toBe(1);
          expect(removals()[0]).toEqual(expect.objectContaining({ method: 'POST', body: { p_product_id: Number(pid) } }));
          expect(log.filter(l => l.method === 'DELETE')).toEqual([]);
      });

      // SEC-03 : la base refuse (compte bloque, 42501) -> le produit revient, un message le dit
      test('retirer refuse par la base (42501) : le produit revient et un message le dit', async ({ page }) => {
          const { log } = await openEditable(page, { fail: { table: 'rpc/remove_product', method: 'POST', status: 403, code: '42501' } });
          const first = page.locator('#dist-products-list .product-row[data-editable]').first();
          const pid = await first.getAttribute('data-product-id');
          const name = await first.locator('.product-name-clean').textContent();
          await first.locator('.product-status-btn').click();
          await first.locator('.product-menu-action[data-action="remove"]').click();
          await page.mouse.move(5, 5);
          await expect.poll(() => log.filter(l => l.table === 'rpc/remove_product').length, { timeout: 10000 }).toBe(1);
          await expect(page.locator(`#dist-products-list .product-row[data-product-id="${pid}"]`)).toHaveCount(1);
          await expect(page.locator('#toast-container')).toContainText(`${name} n'a pas pu être retiré`);
      });

      // SEC-03 : deja retire par un autre membre (P0002) -> meme resultat, aucun message d'erreur
      test('retirer : deja retire par un autre membre (P0002) : pas d’erreur, le produit reste retire', async ({ page }) => {
          const { log } = await openEditable(page, { fail: { table: 'rpc/remove_product', method: 'POST', status: 400, code: 'P0002' } });
          const first = page.locator('#dist-products-list .product-row[data-editable]').first();
          const pid = await first.getAttribute('data-product-id');
          await first.locator('.product-status-btn').click();
          await first.locator('.product-menu-action[data-action="remove"]').click();
          await page.mouse.move(5, 5);
          await expect.poll(() => log.filter(l => l.table === 'rpc/remove_product').length, { timeout: 10000 }).toBe(1);
          await page.waitForTimeout(300);
          await expect(page.locator(`#dist-products-list .product-row[data-product-id="${pid}"]`)).toHaveCount(0);
          await expect(page.locator('#toast-container')).not.toContainText("n'a pas pu être retiré");
      });
  ```
- **Doivent échouer avant l'étape 2** : le front envoie encore un DELETE sur `products` ; aucun
  appel à `rpc/remove_product` n'arrive, les `expect.poll` expirent (les trois tests c).
  Le test b passe avant comme après (normal).

## Vérification (dans l'ordre)
```bash
grep -rn "from('products').delete()" js/              # attendu : aucun résultat
grep -n "rpc('remove_product'" js/fiche-edit.js       # attendu : 1 ligne
grep -n "products(id, name, price, available)" js/app.js   # attendu : ligne 94, inchangée
npm test                                              # tout vert, dont « cache-busting »
npx playwright test --project=functional -g "Modifier au toucher"   # tout vert (dont les 3 tests « retirer »)
node --test tests/integration/db.test.js              # AVANT 025 : seuls les tests « base : produits (025) » et le test 020
                                                      # « priorite » (lit removed_at) échouent ; tous les autres verts
                                                      # (dont 022 corrigé). Coller la sortie dans la PR.
npm run test:functional                               # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
git diff --stat                                       # seuls les fichiers de la fiche (+ index.html)
```

## Après la PR (Claude, modèle principal — jamais l'exécutant)
1. Relecture du SQL (droits, règles, déclencheurs) par un modèle plus fort.
2. État des données : `node scripts/supabase-sql.mjs -e "select count(*) filter (where distributor_id is null) as sans_fiche, count(*) filter (where char_length(btrim(name)) not between 1 and 80) as noms_hors_bornes, (select tableowner from pg_tables where tablename = 'products') as proprietaire from products;"`
   (attendu : propriétaire `postgres` ; si `noms_hors_bornes` > 0, la contrainte reste NOT VALID : le signaler à Stéphane).
3. Appliquer : `node scripts/supabase-sql.mjs supabase/025_product_soft_delete.sql`, puis `node --test tests/integration/db.test.js` : tout vert.
4. Fusionner **juste après** (entre les deux, l'ancien front voit « Retirer » refusé : le produit revient avec un message, rien n'est perdu), puis `npm run test:e2e` après le déploiement Pages.

## Hors périmètre
- Écran admin de restauration, fonction `purge_user_products` : restauration en SQL seulement (décision).
- Plafond de produits par fiche, colonne `added_by` sur `products` (le journal `product_edits` garde l'auteur).
- Vue `distributor_status` (signaux du distributeur, sans produit) : inchangée.
- Recopier `confirm_availability` (SEC-06 la reprend ; ici le refus vient du déclencheur
  `guard_signal_removed_product`) ; messages d'erreur plus précis au renommage (P0001 / 42501
  gardent le toast générique actuel).
- `maxlength` du nom de produit dans le formulaire d'ajout d'une fiche, et limite de 30 écritures /
  heure atteinte par 3 ajouts de fiche à 10 produits : à signaler dans la PR (voir Pièges), ne pas corriger ici.
- Nettoyage des noms à l'ajout d'une fiche (`add-distributor.js`, constat séparé), `kpi_top_distributors`.
- Sauvegardes planifiées (`pg_dump`) : story OPS.
- Ne pas modifier `js/app.js` ni `js/add-distributor.js`.

## Pièges connus
- **Ne jamais exécuter la migration** (ni SQL Editor, ni `scripts/supabase-sql.mjs`) : les tests
  « base : produits (025) » échouent tant qu'elle n'est pas appliquée, c'est attendu.
- Ne pas remplacer la RPC par `update({ removed_at })` côté front : refusé par la RLS (voir « déjà tranché »).
- `product_edits.product_id` **sans** clé étrangère : le journal est écrit dans un déclencheur
  BEFORE INSERT, avant que le produit existe ; une clé étrangère ferait échouer chaque ajout.
- Table de transition : un déclencheur par événement (INSERT, UPDATE), même fonction.
- Dans les tests, revenir en postgres avec `AS_POSTGRES` (efface aussi le jeton) : un simple
  `reset role` laisse `auth.role()` à `anon` / `authenticated` et la garde refuserait la restauration.
- Le test 022 de la ligne 506 insère `price` : le corriger (Test 1 a), sinon il échouera après 025.
- `openEditable` : la ligne `const log = await routeEditWrites(page);` existe deux fois (105 et 281) :
  remplacer le bloc de 3 lignes, pas la ligne seule.
- Bump de **toutes** les entrées de l'import map à la **même** valeur, sinon `cache-busting` échoue.
- Fichiers en CRLF : utiliser l'outil Edit (il garde les fins de ligne) ; le nouveau `.sql` avec Write.
- Garder `begin;` / `commit;` autour de toute la migration (avant la section 1, après la section 10).
- La vue `product_availability` (section 9) doit garder **exactement** les colonnes et l'ordre de 020
  (`create or replace view` refuse sinon) : ne rien changer d'autre que la clause `where exists`.
- Effets de bord à **signaler dans la PR** (hors périmètre, ne pas corriger) : le formulaire d'ajout
  d'une fiche (`js/add-distributor.js:132`) n'a pas de `maxlength` sur le nom de produit ; un nom
  de plus de 80 caractères fait refuser tout l'ajout groupé des produits, en silence (simple
  `console.warn`, `add-distributor.js:331`). Et 3 ajouts de fiche à 10 produits dans l'heure
  atteignent la limite de 30 écritures : le 3e ajout perd ses produits de la même façon.

## Terminé quand
- [ ] Contrôles passés ; tests fonctionnels écrits (échouent avant l'étape 2, passent après) ;
      tests base écrits (échouent avant 025, sortie collée dans la PR)
- [ ] Vérifications vertes (hors tests « base : produits (025) », attendus rouges avant 025)
- [ ] Captures iPhone : non (aucun changement visible)
- [ ] Story cochée dans BACKLOG.md, PR ouverte (non fusionnée), mention « migration 025 à appliquer par Claude avant fusion »

## Modèle de PR
**Titre** : `fix(securite): produits : retrait doux, droits par colonne, garde-fous (migration 025)`

**Corps** : constats corrigés (liste ci-dessus) ; cause (DELETE ouvert à tout compte depuis 005 +
cascade des signaux depuis 007, aucune borne) ; correction (retrait doux par `remove_product`,
droits par colonne, garde par ligne et par requête, journal `product_edits`) ; pourquoi une RPC
et pas un UPDATE ; ce qui change pour l'utilisateur (rien de visible, sauf un message si la base
refuse) ; tests ajoutés ; sortie de `npm test`, des tests fonctionnels et de `db.test.js`
(tests 025 rouges avant application, attendu) ; **« Migration 025 à appliquer par Claude après
relecture, avant fusion »** ; points à relire : limite d'INSERT à 10, propriétaire de `products` ;
effets de bord connus, hors périmètre : pas de `maxlength` produit dans le formulaire d'ajout
(nom > 80 = ajout groupé des produits refusé en silence), 3 ajouts de fiche à 10 produits dans
l'heure atteignent la limite de 30.
