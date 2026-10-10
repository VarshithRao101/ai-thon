-- FlowLedger (hand-written): store "timestamp without time zone" defaults in UTC.
-- The app reads those columns as UTC, but a local cluster on an IST machine
-- filled now() with local time, skewing durations and receipts by 5h30m.
-- Applies to new sessions; Neon already defaults to UTC.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
END
$$;
