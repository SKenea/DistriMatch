-- ============================================================================
-- 017 : demo toujours vivante (US-2, decision Stephane 2026-10-01)
-- ============================================================================
-- Chaque nuit, pg_cron regenere les signaux et evenements de demo des fiches
-- is_demo (seed_demo_signals, 009 / 010) : la demo affiche toujours des infos des
-- dernieres heures. Les vraies fiches et les vrais signaux ne sont jamais touches
-- (seed_demo_signals ne supprime que device_hash LIKE 'demo-%').
--
-- Horaire : 02:00 UTC = 4 h a Paris en ete, 3 h en hiver (pg_cron tourne en UTC).
-- Idempotent : rejouer cette migration remplace le job.
--
-- AVANT L'OUVERTURE DU VRAI PILOTE (a faire une fois, dans cet ordre) :
--   select cron.unschedule('distrimatch-demo-nightly');
--   select purge_demo_data();
--   -- puis, si les fiches de demo doivent disparaitre : cf. 010_is_demo.sql
-- ============================================================================

create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'distrimatch-demo-nightly';

select cron.schedule(
  'distrimatch-demo-nightly',
  '0 2 * * *',
  $$select public.seed_demo_signals(14)$$
);
