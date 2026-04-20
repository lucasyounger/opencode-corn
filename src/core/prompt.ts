import { CronJob } from "./types.js";

export function renderPrompt(job: CronJob): string {
  const skillSection =
    job.skills.length === 0
      ? ""
      : `Enabled skills:\n${job.skills.map((skill) => `- ${skill}`).join("\n")}\n\n`;

  return [
    "This is an unattended one-shot execution.",
    "No follow-up messages will arrive.",
    "Complete the task now instead of asking for more instructions.",
    "Use the current workspace and available tools as needed.",
    "Do not create new recurring work from inside this run.",
    "Return only the final result.",
    "",
    skillSection,
    "Task:",
    "",
    job.prompt.trim(),
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}
