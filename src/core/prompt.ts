import { CronJob } from "./types.js";

export function renderPrompt(job: CronJob): string {
  const skillSection =
    job.skills.length === 0
      ? ""
      : `Enabled skills:\n${job.skills.map((skill) => `- ${skill}`).join("\n")}\n\n`;

  return [
    "You are running inside a scheduled OpenCode automation job.",
    "Do not create or modify cron jobs from inside this run.",
    "If the task cannot be completed safely, explain why and stop.",
    "",
    skillSection,
    job.prompt.trim(),
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}
