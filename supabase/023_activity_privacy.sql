-- ============================================================================
-- 023 : confidentialite des signaux et journal « Mon activité » (EPIC-T22)
-- ============================================================================
-- 1. Les signaux ne revelent plus qui les a envoyes : l'API ne lit plus les
--    colonnes user_id ni device_hash d'availability_signals (avant : tout le monde
--    pouvait relier un signal a un compte). Les vues publiques product_availability
--    / distributor_status n'utilisent pas ces colonnes : l'etat affiche ne change
--    pas. L'API n'ecrit toujours rien directement (RPC confirm_availability).
-- 2. my_activity() : le journal du compte connecte (ses signaux, ses ajouts de
--    distributeurs, ses avis, ses demandes d'exploitant), du plus recent au plus
--    ancien, 200 lignes au plus.
-- Idempotent. Execution : node scripts/supabase-sql.mjs supabase/023_activity_privacy.sql
-- ============================================================================

revoke all on availability_signals from anon, authenticated;
grant select (id, distributor_id, product_id, state, source, weight, created_at)
  on availability_signals to anon, authenticated;

create or replace function my_activity()
returns table (kind text, at timestamptz, distributor_id text, distributor_name text,
               product_name text, state text, detail text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  return query
    select * from (
      select 'signal'::text, s.created_at, s.distributor_id, d.name, p.name, s.state, null::text
        from availability_signals s
        join distributors d on d.id = s.distributor_id
        left join products p on p.id = s.product_id
       where s.user_id = auth.uid()
      union all
      select 'addition', d.created_at, d.id, d.name, null, d.review_status, d.review_reason
        from distributors d
       where d.added_by = auth.uid() and d.is_user_added
      union all
      select 'review', coalesce(r.updated_at, r.created_at), r.distributor_id, d.name, null, r.rating::text, r.body
        from reviews r
        join distributors d on d.id = r.distributor_id
       where r.user_id = auth.uid()
      union all
      select 'operator', o.created_at, o.distributor_id, d.name, null, o.status, null
        from operator_requests o
        join distributors d on d.id = o.distributor_id
       where o.user_id = auth.uid()
    ) a
    order by 2 desc
    limit 200;
end;
$$;
revoke execute on function my_activity() from public, anon;
grant execute on function my_activity() to authenticated;
