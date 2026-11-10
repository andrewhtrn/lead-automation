// Task Planner Agent: turns strategy into concrete, owned, due-dated tasks, and computes an
// explainable priority from urgency, lead quality, engagement and conversion opportunity.
import type { Lead, Priority, Task, TaskKind } from "../types";
import { AGENTS, BROKERAGE, listingById } from "../data/directory";
import { fmtDuration, HOUR, MIN, uid, usdShort } from "../lib/format";
import { engagementIndex } from "./scoring";

export const PRIORITY_WEIGHTS = { urgency: 0.4, quality: 0.3, engagement: 0.15, opportunity: 0.15 };

export const TASK_KIND_META: Record<TaskKind, { label: string; icon: string; verb: string; lift: number }> = {
    call: { label: "Call", icon: "phone", verb: "Start call", lift: 1 },
    sms: { label: "Text", icon: "chat", verb: "Send text", lift: 0.55 },
    email: { label: "Email", icon: "envelope", verb: "Review & send", lift: 0.5 },
    tour: { label: "Tour", icon: "key", verb: "Schedule tour", lift: 1 },
    document: { label: "Share", icon: "document-share", verb: "Share documents", lift: 0.6 },
    review: { label: "Review", icon: "eye-open", verb: "Review", lift: 0.3 },
    nurture: { label: "Nurture", icon: "automatic-updates", verb: "Enroll", lift: 0.15 },
};

interface Spec {
    key: string;
    kind: TaskKind;
    title: string;
    detail: string;
    slaMin: number;
    listingId?: string;
}

/** Desired task set for a lead given what agents currently know. */
export function planSpecs(lead: Lead): Spec[] {
    const f = lead.facts;
    const q = lead.qualification!;
    const s = lead.strategy!;
    const c = lead.contact!;
    const l = listingById(lead.profile.listingId);
    const grade = q.grade;
    const hot = grade === "Hot";
    const out: Spec[] = [];
    if (lead.status === "disqualified") return out;

    if (lead.dedupe?.matched) out.push({ key: "merge", kind: "review", title: `Confirm CRM merge for ${c.name}`, detail: `Matched existing contact (since ${lead.dedupe.since}) at ${Math.round((lead.dedupe.confidence ?? 0.9) * 100)}% confidence. Agents merged history; confirm or split.`, slaMin: 60 });
    if (f.workingWithAgent) out.push({ key: "agency", kind: "review", title: `Verify agency status with ${c.first}`, detail: "Lead indicated existing representation. Confirm before active solicitation.", slaMin: 120 });

    if (!f.connected && grade !== "Cold" && !f.unresponsive) {
        if (f.contactAttempts === 0)
            out.push({ key: "first-call", kind: "call", title: hot ? `Call ${c.first} now (speed to lead)` : `Call ${c.first}: qualify & book next step`, detail: s.nextBestAction, slaMin: hot ? 5 : grade === "Warm" ? 60 : 24 * 60 });
        else out.push({ key: "follow-call", kind: "call", title: `Follow-up call #${f.contactAttempts + 1} to ${c.first}`, detail: "Previous attempt didn't connect. Try a different time of day.", slaMin: hot ? 120 : 24 * 60 });
    }
    if (c.preferredChannel === "text" || f.contactAttempts > 0 || hot)
        if (f.phoneValid && !f.workingWithAgent) out.push({ key: "intro-sms", kind: "sms", title: `Text ${c.first}${c.language === "Spanish" ? " (in Spanish)" : ""}`, detail: s.sms, slaMin: hot ? 5 : 60 });
    if (f.emailValid && grade !== "Cold") out.push({ key: "intro-email", kind: "email", title: `Send personalized email: “${s.email.subject}”`, detail: "Draft personalized from inquiry, enrichment and matched inventory.", slaMin: hot ? 30 : grade === "Warm" ? 120 : 24 * 60 });

    if (s.tours.length && !f.tourScheduled && (f.tourRequested || hot) && !f.workingWithAgent) {
        const t = listingById(s.tours[0].listingId)!;
        out.push({ key: "tour", kind: "tour", title: `Schedule showing: ${t.address}`, detail: `${s.tours.length} matched homes. First suggested slot ${s.tours[0].slot}.`, slaMin: hot ? 120 : 24 * 60, listingId: t.id });
    }
    if (f.tourScheduled) {
        out.push({ key: "tour-confirm", kind: "sms", title: `Confirm showing with ${c.first}`, detail: `Confirmation + parking/access notes for ${f.tourScheduled}.`, slaMin: 120 });
        out.push({ key: "tour-packet", kind: "document", title: "Send pre-tour packet", detail: "Disclosures, comps and a buyer consultation guide ahead of the showing.", slaMin: 24 * 60 });
    }
    const docs = s.documents.filter(d => d.id !== "comps" || !f.tourScheduled);
    if (docs.length && grade !== "Cold") out.push({ key: "docs", kind: "document", title: `Share ${docs.length} resource${docs.length > 1 ? "s" : ""}: ${docs[0].title.split(":")[0]}${docs.length > 1 ? " +" + (docs.length - 1) : ""}`, detail: docs.map(d => d.title).join(" · "), slaMin: hot ? 4 * 60 : 24 * 60 });
    if (f.sellerAddress && f.intent !== "buy") out.push({ key: "cma", kind: "document", title: `Prepare CMA & listing appointment: ${f.sellerAddress.split(",")[0]}`, detail: `Seller opportunity. Est. GCI on listing side ${usdShort(estimatedGci(lead) / 2)}.`, slaMin: 24 * 60 });
    if (f.unresponsive) out.push({ key: "reengage", kind: "sms", title: `Re-engage ${c.first} with new matches`, detail: "Low-pressure text with 2 new listings matching their saved search.", slaMin: 24 * 60 });
    if (grade === "Cold" || grade === "Nurture" || f.unresponsive)
        out.push({ key: "nurture", kind: "nurture", title: `Enroll in ${f.areas[0] ?? "Austin"} market-update drip`, detail: "Bi-weekly listings + monthly market report. Agents re-score on any engagement.", slaMin: 24 * 60 });
    if (f.preApproval === "none" && grade !== "Cold") out.push({ key: "lender", kind: "email", title: `Introduce ${c.first} to a preferred lender`, detail: "Warm intro email to Lakeline Mortgage (simulated) with the lead's consent.", slaMin: 24 * 60 });

    return out.map(x => ({ ...x, listingId: x.listingId ?? l?.id }));
}

export function estimatedGci(lead: Lead) {
    const f = lead.facts;
    const l = listingById(lead.profile.listingId);
    const buy = l?.price ?? f.preApprovalAmount ?? f.budgetMax ?? 425_000;
    const sell = f.sellerAddress ? Math.max(380_000, buy * 0.9) : 0;
    return Math.round((buy + sell) * BROKERAGE.commissionRate);
}

export function computePriority(task: Task, lead: Lead, now = Date.now()): Priority {
    const q = lead.qualification?.score ?? 30;
    const remaining = task.dueAt - now;
    const sla = Math.max(MIN, task.dueAt - task.createdAt);
    const abs = remaining <= 0 ? 100 : remaining < 15 * MIN ? 95 : remaining < HOUR ? 80 : remaining < 4 * HOUR ? 60 : remaining < 24 * HOUR ? 42 : 25;
    const rel = remaining <= 0 ? 100 : Math.round(100 - 70 * Math.min(1, remaining / sla));
    let urgency = Math.max(abs, rel);
    if (lead.facts.timeline === "0-1") urgency = Math.min(100, urgency + 8);
    if (task.kind === "nurture") urgency = Math.min(urgency, 40);
    const engagement = engagementIndex(lead, now);
    const gci = estimatedGci(lead);
    const opportunity = Math.round(Math.min(1, gci / 40_000) * 70 + TASK_KIND_META[task.kind].lift * 30);
    const score = Math.round(
        PRIORITY_WEIGHTS.urgency * urgency + PRIORITY_WEIGHTS.quality * q + PRIORITY_WEIGHTS.engagement * engagement + PRIORITY_WEIGHTS.opportunity * opportunity,
    );
    const band = score >= 78 ? "P1" : score >= 62 ? "P2" : score >= 45 ? "P3" : "P4";

    const reasons: { w: number; text: string }[] = [
        { w: urgency * PRIORITY_WEIGHTS.urgency, text: remaining <= 0 ? `Overdue by ${fmtDuration(-remaining)}` : `SLA ${remaining < HOUR ? "expires" : "due"} in ${fmtDuration(remaining)}` },
        { w: q * PRIORITY_WEIGHTS.quality, text: `${lead.qualification?.grade ?? "Unscored"} lead · score ${q}` },
        { w: engagement * PRIORITY_WEIGHTS.engagement, text: engagement >= 50 ? `Highly engaged (${engagement}/100)` : engagement > 0 ? `Engagement ${engagement}/100` : "No engagement yet" },
        { w: opportunity * PRIORITY_WEIGHTS.opportunity, text: `~${usdShort(gci)} est. GCI${lead.facts.sellerAddress ? " (buy + list)" : ""}` },
    ];
    if (lead.facts.timeline === "0-1") reasons.push({ w: 9, text: "Moving within 30 days" });
    return { score, band, urgency, quality: q, engagement, opportunity, reasons: reasons.sort((a, b) => b.w - a.w).map(r => r.text) };
}

/** Pick a brokerage agent by area, specialty and current load. Returns id + plain-English rationale. */
export function routeLead(lead: Lead, load: Record<string, number>): { id: string; reason: string } {
    const f = lead.facts;
    const q = lead.qualification!;
    const l = listingById(lead.profile.listingId);
    const wants = [
        f.intent === "invest" && "investor",
        (f.intent === "buy-sell" || f.intent === "sell") && "seller",
        /relocat/i.test(f.motivation ?? "") && "relocation",
        /first-time/i.test(f.motivation ?? "") && "first-time",
        l && l.price >= 1_000_000 && "luxury",
    ].filter(Boolean) as string[];
    if (q.grade === "Cold" || (q.grade === "Nurture" && !wants.length)) {
        return { id: "skim", reason: `${q.grade} lead → Inside Sales nurture queue (Sofia Kim, ${load.skim ?? 0}/${AGENTS.find(a => a.id === "skim")!.capacity} capacity)` };
    }
    const area = l?.area ?? f.areas[0];
    let best = AGENTS[0];
    let bestScore = -1;
    let why: string[] = [];
    for (const a of AGENTS.filter(x => x.id !== "skim")) {
        const r: string[] = [];
        let s = 0;
        if (area && a.areas.includes(area)) {
            s += 3;
            r.push(`covers ${area}`);
        }
        const spec = wants.filter(w => a.specialties.includes(w));
        if (spec.length) {
            s += 2 * spec.length;
            r.push(`${spec.join(" + ")} specialist`);
        }
        if (l && l.listingAgentId === a.id) {
            s += 1;
            r.push("listing agent");
        }
        const util = (load[a.id] ?? 0) / a.capacity;
        s -= util * 2.5;
        if (s > bestScore) {
            bestScore = s;
            best = a;
            why = [...r, `${load[a.id] ?? 0}/${a.capacity} active leads`];
        }
    }
    return { id: best.id, reason: `${best.name}: ${why.join(", ")}` };
}

/**
 * Re-plan a lead's tasks in place: create new ones, refresh open ones, and supersede open tasks that
 * no longer apply. Returns counts for the activity log.
 */
export function replanTasks(lead: Lead, all: Task[], now = Date.now(), by = "Task Planner Agent") {
    const specs = planSpecs(lead);
    const mine = all.filter(t => t.leadId === lead.id);
    let created = 0;
    let closed = 0;
    for (const sp of specs) {
        const ex = mine.find(t => t.key === sp.key);
        if (ex) {
            if (ex.status === "open") {
                ex.title = sp.title;
                ex.detail = sp.detail;
                // An SLA can tighten when the lead heats up, never loosen.
                ex.dueAt = Math.min(ex.dueAt, now + sp.slaMin * MIN);
            }
            continue;
        }
        const t: Task = {
            id: uid("task"),
            key: sp.key,
            leadId: lead.id,
            listingId: sp.listingId,
            kind: sp.kind,
            title: sp.title,
            detail: sp.detail,
            status: "open",
            createdAt: now,
            dueAt: now + sp.slaMin * MIN,
            assigneeId: lead.assigneeId ?? "skim",
            createdBy: by,
            priority: { score: 0, band: "P4", urgency: 0, quality: 0, engagement: 0, opportunity: 0, reasons: [] },
        };
        t.priority = computePriority(t, lead, now);
        all.push(t);
        created++;
    }
    for (const t of mine) {
        if (t.status === "open" && !specs.some(s => s.key === t.key)) {
            t.status = "superseded";
            t.outcome = "No longer needed after new information";
            t.completedAt = now;
            closed++;
        }
    }
    let moved = 0;
    for (const t of all) {
        if (t.leadId !== lead.id || t.status !== "open") continue;
        const p = computePriority(t, lead, now);
        if (t.priority.score && Math.abs(p.score - t.priority.score) >= 1) {
            t.prevPriority = t.priority.score;
            t.changedAt = now;
            moved++;
        }
        t.priority = p;
    }
    return { created, closed, moved, total: specs.length };
}
