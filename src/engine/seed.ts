// Pre-seeded pipeline so the demo looks lived-in. Seeds run through the exact same agents,
// synchronously and back-dated, then replay a little history (calls, signals, completed tasks).
import type { Lead, Settings, Task } from "../types";
import { featuredByKey, randomProfile } from "../data/scenarios";
import { completeEnrich, completeIntake, completeNormalize, completePlan, completeQualify, completeStrategy, createLead } from "./pipeline";
import { applyCallOutcome, applySignal, finishTask, reevaluate, scheduleTour } from "./actions";
import { computePriority } from "./tasks";
import { MIN } from "../lib/format";

export function processSync(lead: Lead, leads: Lead[], tasks: Task[], settings: Settings, at: number) {
    completeIntake(lead, at + 4_000);
    completeNormalize(lead, at + 7_000);
    completeEnrich(lead, at + 10_000);
    completeQualify(lead, at + 12_000);
    completeStrategy(lead, leads, settings.autoRoute, at + 15_000);
    completePlan(lead, tasks, at + 17_000);
}

interface SeedStep {
    at: number; // minutes after receipt
    call?: string;
    signal?: string;
    done?: string[];
    tour?: boolean;
}

const SEEDS: { key: string; ageMin: number; steps: SeedStep[]; keepOverdue?: string[] }[] = [
    { key: "nguyen", ageMin: 3, steps: [] },
    { key: "patel", ageMin: 48, steps: [{ at: 20, signal: "listing_revisit" }] },
    { key: "whitaker", ageMin: 75, steps: [{ at: 14, call: "voicemail" }, { at: 35, signal: "seller_intent" }] },
    { key: "bell", ageMin: 190, steps: [{ at: 8, done: ["merge"] }, { at: 22, call: "connected-hot" }, { at: 40, tour: true }] },
    { key: "clarke", ageMin: 320, steps: [{ at: 30, done: ["intro-email"] }, { at: 70, call: "no-answer" }] },
    { key: "hayes", ageMin: 26 * 60, steps: [{ at: 25, done: ["intro-email"] }, { at: 40, call: "voicemail" }, { at: 300, signal: "email_open" }], keepOverdue: ["follow-call"] },
    { key: "ortiz", ageMin: 2 * 24 * 60, steps: [{ at: 60, done: ["agency", "nurture"] }] },
];

export function buildSeed(settings: Settings): { leads: Lead[]; tasks: Task[] } {
    const leads: Lead[] = [];
    const tasks: Task[] = [];
    const now = Date.now();

    const specs = [
        ...SEEDS.map(s => ({ profile: featuredByKey(s.key)!, ...s })),
        ...[6, 9, 30, 52, 70].map((h, i) => ({ profile: randomProfile(), key: `r${i}`, ageMin: h * 60, steps: [{ at: 50, done: ["*"] }] as SeedStep[], keepOverdue: [] as string[] })),
    ].sort((a, b) => b.ageMin - a.ageMin);

    for (const s of specs) {
        const at = now - s.ageMin * MIN;
        const lead = createLead(s.profile, at);
        leads.push(lead);
        processSync(lead, leads, tasks, settings, at);
        for (const st of s.steps) {
            const t = at + st.at * MIN;
            if (t > now) continue;
            const mine = tasks.filter(x => x.leadId === lead.id && x.status === "open");
            if (st.done) for (const x of mine) if (st.done.includes(x.key) || st.done.includes("*")) finishTask(x, "Completed", t);
            if (st.call) {
                const callTask = mine.find(x => x.kind === "call" && x.status === "open");
                const o = applyCallOutcome(lead, st.call, t);
                if (callTask) finishTask(callTask, `${o.label}: ${o.note}`, t);
                reevaluate(lead, tasks, t, `Call: ${o.label}`);
            }
            if (st.signal) {
                const text = applySignal(lead, st.signal, t);
                const r = reevaluate(lead, tasks, t, text);
                lead.signals[0].scoreAfter = r.after;
            }
            if (st.tour && lead.strategy?.tours[0]) {
                const tourTask = tasks.find(x => x.leadId === lead.id && x.kind === "tour" && x.status === "open");
                scheduleTour(lead, lead.strategy.tours[0].listingId, lead.strategy.tours[0].slot, t);
                if (tourTask) finishTask(tourTask, `Booked ${lead.strategy.tours[0].slot}`, t);
                reevaluate(lead, tasks, t, "Showing scheduled");
            }
        }
        // History realism: the team already handled anything that came due before "now".
        for (const x of tasks) if (x.leadId === lead.id && x.status === "open" && x.dueAt < now && !s.keepOverdue?.includes(x.key)) finishTask(x, "Completed", x.dueAt - 5 * MIN);
        lead.activity = lead.activity.filter(a => a.t <= now);
    }
    for (const t of tasks) {
        const lead = leads.find(l => l.id === t.leadId)!;
        if (t.status === "open") {
            t.priority = computePriority(t, lead, now);
            t.prevPriority = undefined;
        }
    }
    return { leads: leads.reverse(), tasks };
}
