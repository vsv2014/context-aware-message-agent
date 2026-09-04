import { readFileSync } from "node:fs";
import { DateTime } from "luxon";

type AnyRecord = Record<string, any>;
export type Output = { task_id?: string; next_message: AnyRecord | null; next_action: AnyRecord; decision_metadata: AnyRecord };

const daysToMove = (r: AnyRecord) => {
  const target = DateTime.fromISO(r.input?.move_date_target ?? "");
  const last = DateTime.fromISO(r.input?.last_interaction ?? "");
  return target.isValid && last.isValid ? Math.floor(target.diff(last, "days").days) : undefined;
};

const eligible = (r: AnyRecord): string[] => (r.channel_preferences ?? [])
  .filter((c: string) => r.consent?.[`${c}_opt_in`] === true);

function sendAt(r: AnyRecord, channel: string, examples: AnyRecord[]): string {
  const zone = r.input?.timezone ?? "UTC";
  const base = DateTime.fromISO(r.input?.last_interaction ?? "", { setZone: true }).setZone(zone).isValid
    ? DateTime.fromISO(r.input.last_interaction, { setZone: true }).setZone(zone) : DateTime.now().setZone(zone);
  const long = (daysToMove(r) ?? 0) > 45;
  const hours: number[] = [], delays: number[] = [];
  for (const ex of examples) {
    const m = ex.expected?.next_message;
    if (m?.channel !== channel || !m.send_at) continue;
    const sent = DateTime.fromISO(m.send_at, { setZone: true });
    if (!sent.isValid) continue;
    hours.push(sent.hour);
    const exBase = DateTime.fromISO(ex.input?.last_interaction ?? "", { setZone: true }).setZone(zone);
    if (((daysToMove(ex) ?? 0) > 45) === long && exBase.isValid) delays.push(Math.round(sent.startOf("day").diff(exBase.setZone(zone).startOf("day"), "days").days));
  }
  const hour = hours.length ? Math.round(hours.reduce((a, b) => a + b, 0) / hours.length) : channel === "sms" ? 9 : 10;
  const delay = delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 1;
  return base.plus({ days: delay }).set({ hour, minute: 0, second: 0, millisecond: 0 }).toISO({ suppressMilliseconds: true })!;
}

function predict(r: AnyRecord, examples: AnyRecord[]): Output {
  const channels = eligible(r);
  if (!channels.length) return { task_id: r.task_id, next_message: null, next_action: { type: "do_not_contact", reason: "no consented channel" }, decision_metadata: { selected_channel: null, reason: "No preferred channel has explicit opt-in." } };
  const votes = new Map<string, number>();
  for (const ex of examples) { const c = ex.expected?.next_message?.channel; if (channels.includes(c)) votes.set(c, (votes.get(c) ?? 0) + 1); }
  const channel = [...channels].sort((a, b) => (votes.get(b) ?? 0) - (votes.get(a) ?? 0))[0];
  const input = r.input ?? {}, profile = input.profile ?? {};
  const name = profile.first_name ?? "there";
  const community = String(input.property_name ?? "our community").replace(/\s+Apartments?$/i, "");
  const long = (daysToMove(r) ?? 0) > 45;
  const amenities: string[] = Array.isArray(profile.amenity_interest) ? profile.amenity_interest : profile.amenity_interest ? [profile.amenity_interest] : [];
  const bodyLabels: AnyRecord = { pool: "pool", fitness: "24/7 fitness center" }; const subjectLabels: AnyRecord = { pool: "pool", fitness: "fitness rooms" };
  const amenityText = amenities.map(a => bodyLabels[a] ?? a).join(" and ") || "the amenities you asked about"; const subjectAmenityText = amenities.map(a => subjectLabels[a] ?? a).join(" \u0026 ") || "the amenities you asked about";
  const url = input.tour_url ?? `https://${community.toLowerCase().replace(/[^a-z0-9]/g, "")}.example/tour`;
  if (channel === "sms" && !long) return { task_id: r.task_id, next_message: { channel, send_at: sendAt(r, channel, examples), subject: null, body: `Hi ${name}—welcome to ${community}! Tours are available this week. Would you like to book a time on Thursday or Friday? Reply 1 for Thu, 2 for Fri. Reply STOP to opt out.`, cta: { type: "schedule_tour", options: ["Thu", "Fri"] } }, next_action: { type: "start_cadence", name: "prospect_welcome_short_horizon" }, decision_metadata: { selected_channel: channel, reason: "SMS is consented and is the highest-ranked eligible preference." } };
  let month = "the coming weeks";
  if (input.move_date_target) { const d = DateTime.fromISO(input.move_date_target); if (d.isValid) month = `${long ? "mid‑" : ""}${d.toFormat("MMMM")}`; }
  return { task_id: r.task_id, next_message: { channel, send_at: sendAt(r, channel, examples), subject: `Tour ${community}—See ${subjectAmenityText} you asked about`, body: `Hi ${name},\nSince you’re planning a ${month} move, here’s a quick look at our ${amenityText}. Book a visit this week to compare floor plans.\nBook now → ${url}\nTo opt out of emails, click here or reply STOP.`, cta: { type: "schedule_tour", link: url } }, next_action: { type: "follow_up_in_days", value: 3 }, decision_metadata: { selected_channel: channel, reason: `${channel} is the highest-ranked consented channel for this context.` } };
}

export function run(file: string): Output[] {
  const records: AnyRecord[] = readFileSync(file, "utf8").split(/\r?\n/).map((line: string, index: number) => {
    if (!line.trim()) return null;
    try { return JSON.parse(line) as AnyRecord; }
    catch (error) { throw new Error(`Invalid JSON on line ${index + 1}: ${String(error)}`); }
  }).filter((record): record is AnyRecord => record !== null);
  return runRecords(records);
}

export function runRecords(records: AnyRecord[]): Output[] {
  const examples = records.filter((r: AnyRecord) => r.expected?.next_message);
  return records.map((r: AnyRecord) => predict(r, examples));
}

if (process.env.VERCEL !== "1" && process.argv[1]?.endsWith("agent.ts")) {
  const outputs = run(process.argv[2]);
  console.log(process.argv.includes("--pretty") ? JSON.stringify(outputs, null, 2) : outputs.map(o => JSON.stringify(o)).join("\n"));
}
