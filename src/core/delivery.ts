import { CronJob, ExecutionResult } from "./types.js";

export async function deliverRun(job: CronJob, result: ExecutionResult): Promise<void> {
  if (job.delivery.mode !== "webhook") {
    return;
  }

  const target =
    result.status === "failed" ? (job.delivery.failureWebhookUrl ?? job.delivery.webhookUrl) : job.delivery.webhookUrl;

  if (!target) {
    return;
  }

  await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jobId: job.id,
      jobName: job.name,
      status: result.status,
      reason: result.reason,
      output: result.output,
      sessionId: result.sessionId,
      exitCode: result.exitCode,
      timestamp: new Date().toISOString(),
    }),
  });
}
