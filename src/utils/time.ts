import { CronExpressionParser } from "cron-parser";

export function nowIso(): string {
  return new Date().toISOString();
}

export function computeNextRun(schedule: string, timezone: string, currentDate: Date = new Date()): string {
  const interval = CronExpressionParser.parse(schedule, {
    currentDate,
    tz: timezone,
  });
  return interval.next().toDate().toISOString();
}
