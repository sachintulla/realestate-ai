-- Run once in the Supabase SQL Editor after deploying dispatch-callbacks.
-- Requires the pg_cron and pg_net extensions (enable both under
-- Database > Extensions in the Supabase dashboard first).

select cron.schedule(
  'dispatch-pending-callbacks',
  '*/10 * * * *',  -- every 10 minutes; tighten if you need faster callback SLAs
  $$
  select net.http_post(
    url := 'https://<your-project-ref>.supabase.co/functions/v1/dispatch-callbacks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <your-service-role-key>'
    )
  );
  $$
);

-- To inspect scheduled jobs:  select * from cron.job;
-- To remove it later:        select cron.unschedule('dispatch-pending-callbacks');
