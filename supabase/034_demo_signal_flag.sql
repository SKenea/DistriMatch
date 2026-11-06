-- ============================================================================
-- 034 : signaux de demo reconnaissables par l'app (NOTIF-02)
-- ============================================================================
-- Revue du 2026-10-21. La veille des favoris (app ouverte, js/favorites-watch.js)
-- annoncait les signaux de demo regeneres chaque nuit (017) : « ... de nouveau vu
-- dispo », alors que push-notify les ignore (device_hash 'demo-%', 024). Depuis
-- 023, l'API ne lit plus device_hash : l'app ne pouvait pas les reconnaitre.
-- Apres :
--   1. Colonne generee availability_signals.is_demo_signal (vrai si device_hash
--      commence par 'demo-'), lisible par l'API. device_hash reste illisible.
--   2. Les vues product_availability (reprise exacte de 025) et distributor_status
--      (reprise exacte de 020) l'exposent en DERNIERE colonne (create or replace
--      view n'accepte un ajout qu'en fin de liste ; droits des vues inchanges).
-- Ne jamais ecrire s.device_hash dans ces vues : security_invoker, anon ne lit
-- pas cette colonne, les vues echoueraient pour tous les visiteurs.
-- Idempotente, en une seule transaction. Execution (Claude, apres relecture ;
-- d'abord avec « rollback; » a la place du « commit; » final) :
--   node scripts/supabase-sql.mjs supabase/034_demo_signal_flag.sql
-- ============================================================================

begin;

alter table availability_signals
  add column if not exists is_demo_signal boolean
  generated always as (coalesce(device_hash, '') like 'demo-%') stored;

grant select (is_demo_signal) on availability_signals to anon, authenticated;

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
       (extract(epoch from (now() - s.created_at)))::bigint as age_seconds,
       s.is_demo_signal
from latest l
left join owner_latest o on o.distributor_id = l.distributor_id and o.product_id = l.product_id
join availability_signals s on s.id = case
  when o.id is not null and l.source <> 'owner' and o.state <> l.state
       and l.created_at - o.created_at <= interval '30 minutes' then o.id
  else l.id end
where exists (select 1 from products p where p.id = l.product_id and p.removed_at is null);

create or replace view distributor_status with (security_invoker = true) as
with latest as (
  select distinct on (distributor_id) id, distributor_id, state, source, created_at
  from availability_signals where product_id is null
  order by distributor_id, created_at desc
), owner_latest as (
  select distinct on (distributor_id) id, distributor_id, state, created_at
  from availability_signals where product_id is null and source = 'owner'
  order by distributor_id, created_at desc
)
select s.distributor_id, s.state, s.source, s.weight, s.created_at,
       (extract(epoch from (now() - s.created_at)))::bigint as age_seconds,
       s.is_demo_signal
from latest l
left join owner_latest o on o.distributor_id = l.distributor_id
join availability_signals s on s.id = case
  when o.id is not null and l.source <> 'owner' and o.state <> l.state
       and l.created_at - o.created_at <= interval '30 minutes' then o.id
  else l.id end;

commit;

-- Controle (postgres) :
-- select is_demo_signal, count(*) from availability_signals group by 1;
-- select distributor_id, state, is_demo_signal from distributor_status limit 5;
