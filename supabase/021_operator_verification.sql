-- ============================================================================
-- 021 : verifier un exploitant (EPIC-T20) : echange direct, SIRET, code par courrier
-- ============================================================================
-- Parcours (maquette 3 « mixte ») :
--   pending          demande envoyee (lien + entreprise + message, sans SIRET)
--   siret_requested  l'admin demande le SIRET (admin_request_siret)
--   siret_received   le membre l'a donne (submit_operator_siret, cle de controle)
--   code_sent        code a 5 chiffres envoye par courrier a l'adresse SIRENE (ou dicte
--                    par telephone, en secours) : admin_send_operator_code
--   approved         bon code (verify_operator_code) ou validation sans code (exception)
--   rejected         refus avec motif (admin_reject_operator_request)
-- Echange direct : operator_request_messages (member / admin / system), ecrit par
-- post_operator_message ; lu par le membre (son fil) et l'admin (tous) via RLS.
-- Le code n'est jamais stocke en clair (bcrypt, pgcrypto) ; 30 jours, 5 essais.
-- Le SIRET et le code ne sont jamais publics. Remplace le « contact » de 020.
-- Idempotent. Execution : node scripts/supabase-sql.mjs supabase/021_operator_verification.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Demande : nouvelles colonnes, nouveaux etats
-- ---------------------------------------------------------------------------
alter table operator_requests alter column contact drop not null;
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'operator_requests'::regclass and contype = 'c'
             and (conname in ('operator_requests_status_check', 'operator_requests_relation_check',
                              'operator_requests_message_check', 'operator_requests_siret_check')
                  or pg_get_constraintdef(oid) like '%contact%' or pg_get_constraintdef(oid) like '%status%')
  loop
    execute format('alter table operator_requests drop constraint %I', c.conname);
  end loop;
end $$;

alter table operator_requests
  add column if not exists relation text,
  add column if not exists message text,
  add column if not exists siret text,
  add column if not exists code_hash text,
  add column if not exists code_channel text,
  add column if not exists code_sent_at timestamptz,
  add column if not exists code_expires_at timestamptz,
  add column if not exists code_attempts int not null default 0,
  add column if not exists mail_name text,
  add column if not exists mail_address text,
  add column if not exists reject_reason text,
  add column if not exists member_read_at timestamptz not null default now(),
  add column if not exists admin_read_at timestamptz;

alter table operator_requests add constraint operator_requests_status_check
  check (status in ('pending', 'siret_requested', 'siret_received', 'code_sent', 'approved', 'rejected'));
alter table operator_requests add constraint operator_requests_relation_check
  check (relation is null or relation in ('owner', 'operator', 'employee'));
alter table operator_requests add constraint operator_requests_message_check
  check (message is null or char_length(message) <= 500);
alter table operator_requests add constraint operator_requests_siret_check
  check (siret is null or siret ~ '^[0-9]{14}$');

-- Une seule demande en cours par compte et par fiche
drop index if exists operator_requests_one_pending;
create unique index if not exists operator_requests_one_active
  on operator_requests (user_id, distributor_id) where status not in ('approved', 'rejected');

-- Droits API : le membre cree (lien, entreprise, message) et lit SA demande, jamais le code
revoke all on operator_requests from anon, authenticated;
grant insert (distributor_id, company, relation, message) on operator_requests to authenticated;
grant select (id, distributor_id, company, relation, message, siret, status, created_at,
              code_sent_at, code_expires_at, code_attempts, reject_reason, member_read_at)
  on operator_requests to authenticated;

-- Garde a la creation (remplace celle de 020) : auteur force, lien obligatoire,
-- compte bloque refuse, 5 demandes par jour
create or replace function guard_operator_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- SECURITY DEFINER : current_user est le proprietaire ; le role vient du jeton
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    if auth.uid() is null then
      raise exception 'Connexion requise' using errcode = '28000';
    end if;
    new.user_id := auth.uid();
    new.status := 'pending';
    new.decided_at := null;
    new.decided_by := null;
    new.siret := null;
    new.code_hash := null;
    if new.relation is null then
      raise exception 'Lien avec le distributeur requis' using errcode = '23514';
    end if;
    if exists (select 1 from signal_bans where user_id = auth.uid()) then
      raise exception 'Compte bloque' using errcode = '42501';
    end if;
    if (select count(*) from operator_requests
        where user_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then
      raise exception 'Trop de demandes aujourd''hui' using errcode = 'P0001';
    end if;
  end if;
  new.company := btrim(new.company);
  new.message := nullif(btrim(coalesce(new.message, '')), '');
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Echange direct
-- ---------------------------------------------------------------------------
create table if not exists operator_request_messages (
  id bigint generated always as identity primary key,
  request_id bigint not null references operator_requests(id) on delete cascade,
  author text not null check (author in ('member', 'admin', 'system')),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists operator_request_messages_request on operator_request_messages (request_id, created_at);

-- La regle de lecture ne peut pas lire operator_requests.user_id (colonne non accordee
-- a l'API) : fonction SECURITY DEFINER
create or replace function is_my_operator_request(p_request_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from operator_requests where id = p_request_id and user_id = auth.uid());
$$;
revoke execute on function is_my_operator_request(bigint) from public, anon;
grant execute on function is_my_operator_request(bigint) to authenticated;

alter table operator_request_messages enable row level security;
drop policy if exists "Fil lisible par le demandeur et l'admin" on operator_request_messages;
create policy "Fil lisible par le demandeur et l'admin" on operator_request_messages for select to authenticated
  using (is_admin() or is_my_operator_request(request_id));
revoke all on operator_request_messages from anon, authenticated;
grant select on operator_request_messages to authenticated;

create or replace function add_operator_event(p_request_id bigint, p_body text) returns void
language sql security definer set search_path = public as $$
  insert into operator_request_messages (request_id, author, body) values (p_request_id, 'system', p_body);
$$;
revoke execute on function add_operator_event(bigint, text) from public, anon, authenticated;

create or replace function operator_request_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform add_operator_event(new.id, 'Demande envoyée');
  return new;
end;
$$;
drop trigger if exists operator_request_created on operator_requests;
create trigger operator_request_created after insert on operator_requests
  for each row execute function operator_request_created();

-- Le demandeur ou l'admin ; 30 messages par heure et par auteur sur un fil
create or replace function post_operator_message(p_request_id bigint, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req operator_requests;
  v_author text;
begin
  select * into v_req from operator_requests where id = p_request_id;
  if v_req.id is null then
    raise exception 'Demande introuvable' using errcode = 'P0002';
  end if;
  if v_req.user_id = auth.uid() then
    v_author := 'member';
  elsif is_admin() then
    v_author := 'admin';
  else
    raise exception 'Fil reserve au demandeur et a l''admin' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 1000 then
    raise exception 'Message vide ou trop long' using errcode = '23514';
  end if;
  if (select count(*) from operator_request_messages
      where request_id = p_request_id and author = v_author and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Trop de messages, reessaie plus tard' using errcode = 'P0001';
  end if;
  insert into operator_request_messages (request_id, author, body) values (p_request_id, v_author, btrim(p_body));
  if v_author = 'member' then
    update operator_requests set member_read_at = now() where id = p_request_id;
  else
    update operator_requests set admin_read_at = now() where id = p_request_id;
  end if;
end;
$$;

create or replace function mark_operator_request_read(p_request_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update operator_requests set member_read_at = now() where id = p_request_id and user_id = auth.uid();
  if is_admin() then
    update operator_requests set admin_read_at = now() where id = p_request_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- SIRET (membre) : 14 chiffres, cle de Luhn (exception La Poste : somme des chiffres % 5)
-- ---------------------------------------------------------------------------
create or replace function siret_is_valid(p_siret text) returns boolean
language plpgsql immutable as $$
declare
  s int := 0;
  d int;
  i int;
begin
  if p_siret !~ '^[0-9]{14}$' then
    return false;
  end if;
  -- La Poste (SIREN 356000000) : ses etablissements suivent une autre regle
  if left(p_siret, 9) = '356000000' then
    for i in 1..14 loop s := s + substr(p_siret, i, 1)::int; end loop;
    if s % 5 = 0 then
      return true;
    end if;
    s := 0;
  end if;
  for i in 1..14 loop
    d := substr(p_siret, i, 1)::int;
    if i % 2 = 1 then   -- positions impaires en partant de la gauche (14 chiffres) : doublees
      d := d * 2;
      if d > 9 then d := d - 9; end if;
    end if;
    s := s + d;
  end loop;
  return s % 10 = 0;
end;
$$;

create or replace function submit_operator_siret(p_request_id bigint, p_siret text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req operator_requests;
  v_siret text := regexp_replace(coalesce(p_siret, ''), '[^0-9]', '', 'g');
begin
  select * into v_req from operator_requests where id = p_request_id and user_id = auth.uid();
  if v_req.id is null then
    raise exception 'Demande introuvable' using errcode = 'P0002';
  end if;
  if v_req.status <> 'siret_requested' then
    raise exception 'Le SIRET n''est pas demande pour l''instant' using errcode = 'P0001';
  end if;
  if not siret_is_valid(v_siret) then
    raise exception 'SIRET invalide' using errcode = '22023';
  end if;
  update operator_requests set siret = v_siret, status = 'siret_received', member_read_at = now() where id = p_request_id;
  perform add_operator_event(p_request_id, 'SIRET envoyé');
end;
$$;

-- ---------------------------------------------------------------------------
-- Code (membre) : 5 essais, 30 jours ; un essai rate ne leve pas d'erreur (sinon
-- le compteur serait annule avec la transaction) : retour jsonb
-- ---------------------------------------------------------------------------
create or replace function verify_operator_code(p_request_id bigint, p_code text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_req operator_requests;
  v_code text := regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g');
  v_left int;
begin
  select * into v_req from operator_requests where id = p_request_id and user_id = auth.uid() for update;
  if v_req.id is null then
    raise exception 'Demande introuvable' using errcode = 'P0002';
  end if;
  if v_req.status <> 'code_sent' or v_req.code_hash is null then
    return jsonb_build_object('ok', false, 'reason', 'not_sent');
  end if;
  if v_req.code_expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if v_req.code_attempts >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'left', 0);
  end if;
  if v_code ~ '^[0-9]{5}$' and crypt(v_code, v_req.code_hash) = v_req.code_hash then
    update operator_requests
       set status = 'approved', decided_at = now(), code_hash = null, member_read_at = now()
     where id = p_request_id;
    insert into distributor_operators (distributor_id, user_id) values (v_req.distributor_id, v_req.user_id)
      on conflict (distributor_id, user_id) do nothing;
    perform add_operator_event(p_request_id, 'Code validé : exploitant vérifié');
    return jsonb_build_object('ok', true);
  end if;
  update operator_requests set code_attempts = code_attempts + 1 where id = p_request_id;
  v_left := 5 - (v_req.code_attempts + 1);
  if v_left = 0 then
    perform add_operator_event(p_request_id, 'Code bloqué après 5 essais : l''équipe peut en renvoyer un');
  end if;
  return jsonb_build_object('ok', false, 'reason', 'wrong', 'left', v_left);
end;
$$;

-- ---------------------------------------------------------------------------
-- Administration (l'appelant doit etre admin)
-- ---------------------------------------------------------------------------
create or replace function admin_request_siret(p_id bigint, p_message text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Reserve a l''admin' using errcode = '42501';
  end if;
  update operator_requests set status = 'siret_requested', admin_read_at = now()
   where id = p_id and status in ('pending', 'siret_requested', 'siret_received');
  if not found then
    raise exception 'Demande introuvable ou deja avancee' using errcode = 'P0002';
  end if;
  insert into operator_request_messages (request_id, author, body)
  values (p_id, 'admin', coalesce(nullif(btrim(p_message), ''),
    'Merci pour ta demande ! Pour relier ton compte à l''entreprise, j''ai besoin de son SIRET (14 chiffres, sur un Kbis ou une facture). Il reste privé.'));
end;
$$;

-- Genere le code (renvoi = nouveau code, l'ancien ne marche plus) ; le rend une seule
-- fois a l'admin pour la carte ou l'appel. p_channel : 'mail' (adresse SIRENE) | 'phone'
create or replace function admin_send_operator_code(p_id bigint, p_channel text, p_mail_name text default null, p_mail_address text default null)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_req operator_requests;
  v_code text;
begin
  if not is_admin() then
    raise exception 'Reserve a l''admin' using errcode = '42501';
  end if;
  if p_channel not in ('mail', 'phone') then
    raise exception 'Canal inconnu' using errcode = '22023';
  end if;
  select * into v_req from operator_requests where id = p_id for update;
  if v_req.id is null or v_req.status not in ('siret_received', 'code_sent') or v_req.siret is null then
    raise exception 'SIRET non recu ou demande close' using errcode = 'P0001';
  end if;
  if p_channel = 'mail' and (coalesce(btrim(p_mail_address), '') = '') then
    raise exception 'Adresse SIRENE requise pour le courrier' using errcode = '23514';
  end if;
  v_code := lpad(((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 100000)::text, 5, '0');
  update operator_requests
     set status = 'code_sent', code_hash = crypt(v_code, gen_salt('bf')), code_channel = p_channel,
         code_sent_at = now(), code_expires_at = now() + interval '30 days', code_attempts = 0,
         mail_name = case when p_channel = 'mail' then btrim(p_mail_name) else mail_name end,
         mail_address = case when p_channel = 'mail' then btrim(p_mail_address) else mail_address end,
         admin_read_at = now()
   where id = p_id;
  perform add_operator_event(p_id, case when p_channel = 'mail'
    then 'Courrier envoyé le ' || to_char(now() at time zone 'Europe/Paris', 'DD/MM') || ' à l''adresse officielle de l''entreprise : code valable 30 jours'
    else 'Code communiqué par téléphone à l''entreprise : valable 30 jours' end);
  return v_code;
end;
$$;

-- Valider sans code (exception) : etats en cours, pas seulement 'pending' (remplace 020)
create or replace function admin_decide_operator_request(p_id bigint, p_approve boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_req operator_requests;
begin
  if not is_admin() then
    raise exception 'Reserve a l''admin' using errcode = '42501';
  end if;
  update operator_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_at = now(), decided_by = auth.uid(), code_hash = null, admin_read_at = now()
   where id = p_id and status not in ('approved', 'rejected')
   returning * into v_req;
  if v_req.id is null then
    raise exception 'Demande introuvable ou deja traitee' using errcode = 'P0002';
  end if;
  if p_approve then
    insert into distributor_operators (distributor_id, user_id, granted_by)
    values (v_req.distributor_id, v_req.user_id, auth.uid())
    on conflict (distributor_id, user_id) do nothing;
    perform add_operator_event(p_id, 'Exploitant vérifié par l''équipe');
  else
    perform add_operator_event(p_id, 'Demande refusée');
  end if;
  return v_req.status;
end;
$$;

create or replace function admin_reject_operator_request(p_id bigint, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Reserve a l''admin' using errcode = '42501';
  end if;
  update operator_requests
     set status = 'rejected', decided_at = now(), decided_by = auth.uid(), code_hash = null,
         reject_reason = nullif(btrim(p_reason), ''), admin_read_at = now()
   where id = p_id and status not in ('approved', 'rejected');
  if not found then
    raise exception 'Demande introuvable ou deja traitee' using errcode = 'P0002';
  end if;
  perform add_operator_event(p_id, 'Demande refusée' || coalesce(' : ' || nullif(btrim(p_reason), ''), ''));
end;
$$;

-- Liste admin : demandes en cours + closes depuis 30 jours ; non lus = messages du
-- membre posterieurs a la derniere lecture admin
drop function if exists admin_operator_requests();
create function admin_operator_requests()
returns table (id bigint, distributor_id text, distributor_name text, city text, lat double precision, lng double precision,
               relation text, company text, message text, siret text, status text, email text,
               created_at timestamptz, code_sent_at timestamptz, code_expires_at timestamptz, code_attempts int,
               reject_reason text, last_activity timestamptz, unread bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Reserve a l''admin' using errcode = '42501';
  end if;
  return query
    select r.id, r.distributor_id, d.name, d.city, d.lat::double precision, d.lng::double precision,
           r.relation, r.company, r.message, r.siret, r.status, u.email::text,
           r.created_at, r.code_sent_at, r.code_expires_at, r.code_attempts, r.reject_reason,
           coalesce((select max(m.created_at) from operator_request_messages m where m.request_id = r.id), r.created_at),
           (select count(*) from operator_request_messages m
             where m.request_id = r.id and m.author = 'member' and (r.admin_read_at is null or m.created_at > r.admin_read_at))
    from operator_requests r
    join distributors d on d.id = r.distributor_id
    left join auth.users u on u.id = r.user_id
    where r.status not in ('approved', 'rejected') or r.decided_at > now() - interval '30 days'
    order by 19 desc, 18 desc;
end;
$$;

revoke execute on function post_operator_message(bigint, text) from public, anon;
revoke execute on function mark_operator_request_read(bigint) from public, anon;
revoke execute on function submit_operator_siret(bigint, text) from public, anon;
revoke execute on function verify_operator_code(bigint, text) from public, anon;
revoke execute on function admin_request_siret(bigint, text) from public, anon;
revoke execute on function admin_send_operator_code(bigint, text, text, text) from public, anon;
revoke execute on function admin_reject_operator_request(bigint, text) from public, anon;
revoke execute on function admin_operator_requests() from public, anon;
grant execute on function post_operator_message(bigint, text) to authenticated;
grant execute on function mark_operator_request_read(bigint) to authenticated;
grant execute on function submit_operator_siret(bigint, text) to authenticated;
grant execute on function verify_operator_code(bigint, text) to authenticated;
grant execute on function admin_request_siret(bigint, text) to authenticated;
grant execute on function admin_send_operator_code(bigint, text, text, text) to authenticated;
grant execute on function admin_reject_operator_request(bigint, text) to authenticated;
grant execute on function admin_operator_requests() to authenticated;
