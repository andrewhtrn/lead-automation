// State transitions shared by the live store and the seeded history.
import type { Lead, LeadStatus, Task } from "../types";
import { listingById } from "../data/directory";
import { scoreLead } from "./scoring";
import { buildStrategy } from "./strategy";
import { replanTasks } from "./tasks";
import { CALL_OUTCOMES, signalById } from "./signals";
import { log } from "./pipeline";

export function deriveStatus(lead: Lead): LeadStatus {
    if (lead.status === "disqualified" || lead.status === "processing") return lead.status;
    if (lead.facts.tourScheduled) return "appointment";
    if (lead.qualification?.grade === "Cold" || lead.facts.unresponsive) return "nurture";
    if (lead.facts.connected) return "contacted";
    return "new";
}

/** Re-run Qualification → Strategy → Task Planner on a lead after new information. */
export function reevaluate(lead: Lead, tasks: Task[], now: number, label: string) {
    const before = lead.qualification;
    lead.qualification = scoreLead(lead, now);
    lead.scoreHistory.push({ t: now, score: lead.qualification.score, confidence: lead.qualification.confidence, label });
    lead.scoreChangedAt = now;
    lead.strategy = buildStrategy(lead);
    lead.status = deriveStatus(lead);
    const r = replanTasks(lead, tasks, now);
    const d = before ? lead.qualification.score - before.score : 0;
    log(
        lead,
        "Qualification Agent",
        `Re-scored ${before?.score ?? "–"} → ${lead.qualification.score} (${d >= 0 ? "+" : ""}${d})${before && before.grade !== lead.qualification.grade ? ` · now ${lead.qualification.grade}` : ""}`,
        d >= 0 ? "success" : "warning",
        now,
    );
    if (r.created || r.closed || r.moved)
        log(lead, "Task Planner Agent", [r.created && `${r.created} new task${r.created > 1 ? "s" : ""}`, r.closed && `${r.closed} superseded`, r.moved && `${r.moved} re-prioritized`].filter(Boolean).join(" · "), "primary", now);
    return { before: before?.score ?? 0, after: lead.qualification.score, ...r };
}

export function applySignal(lead: Lead, signalId: string, now: number) {
    const s = signalById(signalId);
    const text = s.describe(lead);
    s.apply(lead, now);
    if (!lead.storyUsed.includes(signalId)) lead.storyUsed.push(signalId);
    lead.signals.unshift({ id: `${signalId}-${now}`, t: now, signalId, text, scoreBefore: lead.qualification?.score ?? 0 });
    log(lead, s.channel, text, s.tone === "positive" ? "primary" : "warning", now);
    return text;
}

export function finishTask(task: Task, outcome: string, now: number, status: Task["status"] = "done") {
    task.status = status;
    task.outcome = outcome;
    task.completedAt = now;
}

export function applyCallOutcome(lead: Lead, outcomeId: string, now: number) {
    const o = CALL_OUTCOMES.find(x => x.id === outcomeId)!;
    o.apply(lead, now);
    log(lead, "You", `Call outcome: ${o.label}. ${o.note}`, o.intent === "success" ? "success" : o.intent === "danger" ? "danger" : "primary", now);
    return o;
}

export function scheduleTour(lead: Lead, listingId: string, slot: string, now: number) {
    const l = listingById(listingId)!;
    lead.facts.tourScheduled = `${slot} · ${l.address}`;
    lead.facts.tourRequested = true;
    lead.facts.connected = true;
    lead.provenance.tourRequested = { source: "Showing scheduler", detail: `Booked ${slot}`, at: now, verified: true };
    log(lead, "You", `Scheduled showing: ${l.address} · ${slot}`, "success", now);
}
