/**
 * Hive queue topology (docs/07, D-033). Postgres-native via pg-boss: jobs live
 * in the `pgboss` schema next to the data they describe, so a run row and its
 * job commit in the same transaction.
 */

export const PGBOSS_SCHEMA = "pgboss";

export const QUEUES = {
  /** One job per workflow execution (and per resume after a durable wait). */
  runs: "hive-runs",
  /** Runs whose job failed every infrastructure retry. */
  runsDead: "hive-runs-dlq",
  /** Cron-fired jobs for Schedule triggers (pg-boss schedules, key = workflow id). */
  schedules: "hive-schedules",
} as const;

export type ScheduleJobData = {
  workflowId: string;
  workspaceId: string;
};

/**
 * Infrastructure retries only (worker crash, DB blip). Step-level retries for
 * flaky integrations happen inside the engine with jittered backoff.
 */
export const RUNS_QUEUE_OPTIONS = {
  retryLimit: 3,
  retryDelay: 2,
  retryBackoff: true,
  retryDelayMax: 60,
  // A run (including in-engine step retries) must finish within this window.
  expireInSeconds: 15 * 60,
  // Live workers refresh this; a crashed worker's job is failed after ~15s and retried,
  // and the retry resumes from the run's checkpoint.
  heartbeatSeconds: 15,
  deadLetter: QUEUES.runsDead,
} as const;

export type RunJobData = {
  executionId: string;
  workspaceId: string;
  /** Present when this job resumes a run after a durable wait. */
  resume?: boolean;
};
