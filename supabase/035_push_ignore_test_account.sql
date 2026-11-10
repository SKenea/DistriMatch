-- ============================================================================
-- 035 : pas de notification app fermee pour un signal du compte de test E2E (TST-01)
-- ============================================================================
-- Revue du 2026-10-21 (lot 7, T2). Apres chaque deploiement, les tests E2E
-- connectes (compte e2e@distrimatch.test, 015 : app_metadata.e2e = true)
-- envoient un vrai signal « En service » sur la fiche de demo dist-007 : le
-- declencheur notify_push_on_signal (024) le transmettait a push-notify, qui
-- prevenait les abonnes de cette fiche.
-- Apres : notify_push_on_signal ignore aussi les signaux d'un compte marque
-- app_metadata.e2e = true (reprise exacte de 024, une condition en plus). Le
-- signal lui-meme est enregistre comme avant.
-- Idempotente, en une seule transaction. Execution (Claude, apres relecture ;
-- d'abord avec « rollback; » a la place du « commit; » final) :
--   node scripts/supabase-sql.mjs supabase/035_push_ignore_test_account.sql
-- ============================================================================

begin;

create or replace function public.notify_push_on_signal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_url text;
    v_secret text;
begin
    if coalesce(new.device_hash, '') like 'demo-%' then return new; end if;
    -- 035 (TST-01) : le compte de test E2E ne notifie personne
    if new.user_id is not null and exists (
        select 1 from auth.users u
        where u.id = new.user_id and coalesce(u.raw_app_meta_data->>'e2e', '') = 'true'
    ) then return new; end if;
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_notify_url';
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_trigger_secret';
    if v_url is null or v_secret is null then return new; end if;
    perform net.http_post(
        url := v_url,
        body := jsonb_build_object('signal_id', new.id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret)
    );
    return new;
exception when others then
    -- Une notification ne bloque jamais un signal.
    raise warning 'push-notify : %', sqlerrm;
    return new;
end;
$$;
revoke all on function public.notify_push_on_signal() from public, anon, authenticated;

commit;
