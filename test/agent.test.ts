import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, runRecords } from "../src/agent.js";

const sample = join(process.cwd(), "sample (1).jsonl");
const results = run(sample);

assert.equal(results.length, 2, "the sample has two output records");
assert.equal(results[0].next_message?.channel, "sms");
assert.equal(results[0].next_message?.send_at, "2025-12-09T09:00:00-06:00");
assert.match(results[0].next_message?.body, /Reply STOP to opt out/);
assert.equal(results[1].next_message?.channel, "email");
assert.equal(results[1].next_message?.send_at, "2025-12-09T10:00:00-06:00");
assert.equal(results[1].next_action.type, "follow_up_in_days");

const noConsent = {
  task_id: "no_consent",
  channel_preferences: ["sms", "email"],
  consent: { sms_opt_in: false, email_opt_in: false },
  input: { last_interaction: "2026-09-01T10:00:00Z", timezone: "UTC" }
};
const dir = mkdtempSync(join(tmpdir(), "message-agent-"));
const file = join(dir, "input.jsonl");
writeFileSync(file, `${JSON.stringify(noConsent)}\n`);
const blocked = run(file)[0];
assert.equal(blocked.next_message, null, "without consent the agent must not send");
assert.equal(blocked.next_action.type, "do_not_contact");

const scenarios = runRecords([
  { task_id: "email_only", channel_preferences: ["sms", "email"], consent: { sms_opt_in: false, email_opt_in: true }, input: { property_name: "Pine Apartments", move_date_target: "2026-10-01", last_interaction: "2026-09-01T10:00:00Z", timezone: "UTC", profile: { first_name: "Sam" } } },
  { task_id: "unsupported_then_email", channel_preferences: ["push", "email"], consent: { push_opt_in: true, email_opt_in: true }, input: { property_name: "Pine Apartments", last_interaction: "2026-09-01T10:00:00Z", timezone: "UTC", profile: {} } },
  { task_id: "missing_profile", channel_preferences: ["email"], consent: { email_opt_in: true }, input: { property_name: "Pine Apartments", last_interaction: "2026-09-01T10:00:00Z", timezone: "UTC", profile: {} } }
]);
assert.equal(scenarios[0].next_message?.channel, "email", "email is selected when SMS is not consented");
assert.equal(scenarios[1].next_message?.channel, "email", "unsupported preferred channels are ignored");
assert.match(scenarios[2].next_message?.body, /Hi there/, "missing names use a neutral greeting");

console.log("All agent tests passed.");
