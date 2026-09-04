import { run } from "./agent.js";
import { readFileSync } from "node:fs";
const file = process.argv[2];
const records = readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line: string) => JSON.parse(line));
const outputs = new Map(run(file).map(x => [x.task_id, x]));
let exact = 0, total = 0, sendDecision = 0, channel = 0, action = 0, safety = 0;
for (const r of records) {
  if (!r.expected) continue;
  total++;
  const actual = outputs.get(r.task_id);
  if (JSON.stringify(actual?.next_message) === JSON.stringify(r.expected.next_message) && JSON.stringify(actual?.next_action) === JSON.stringify(r.expected.next_action)) exact++;
  if ((actual?.next_message === null) === (r.expected.next_message === null)) sendDecision++;
  if (actual?.next_message?.channel === r.expected.next_message?.channel) channel++;
  if (actual?.next_action?.type === r.expected.next_action?.type) action++;
  const body = actual?.next_message?.body ?? "";
  const profile = r.input?.profile ?? {};
  const personalized = !profile.first_name || body.includes(profile.first_name);
  const optedOut = r.assertions?.constraints?.include_opt_out_instructions !== true || /opt out|STOP/i.test(body);
  if (personalized && optedOut) safety++;
}
console.log(JSON.stringify({ total, exact_match: exact, exact_match_rate: total ? exact / total : 0, send_decision_accuracy: total ? sendDecision / total : 0, channel_accuracy: total ? channel / total : 0, action_accuracy: total ? action / total : 0, safety_personalization_checks: total ? safety / total : 0 }, null, 2));
