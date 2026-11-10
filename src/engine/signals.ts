// New information that can arrive after a lead is qualified. Each signal patches what the
// agents know; the Qualification, Strategy and Task Planner agents then re-run on the result.
import type { IconName } from "@blueprintjs/core";
import type { Lead } from "../types";
import { listingById, LISTINGS } from "../data/directory";
import { usdShort, DAY } from "../lib/format";

export interface SignalDef {
    id: string;
    label: string;
    icon: IconName;
    channel: string;
    tone: "positive" | "negative";
    describe: (lead: Lead) => string;
    apply: (lead: Lead, now: number) => void;
}

const touch = (lead: Lead, now: number) => {
    lead.behavior.lastActiveAt = now;
    lead.facts.unresponsive = false;
};

export const SIGNALS: SignalDef[] = [
    {
        id: "sms_reply_tour",
        label: "Replies asking for a tour",
        icon: "chat",
        channel: "SMS",
        tone: "positive",
        describe: l => (l.contact?.language === "Spanish" ? "Replied by text: “¡Sí! El sábado en la mañana nos funciona.” (Saturday morning works)" : `Replied by text: “Saturday morning works. Can we see ${listingById(l.profile.listingId)?.address ?? "a couple of homes"} then?”`),
        apply: (l, now) => {
            touch(l, now);
            l.behavior.replies += 1;
            l.behavior.listingViews += 2;
            l.behavior.sessions += 1;
            l.facts.tourRequested = true;
            l.facts.phoneValid = true;
            if (l.facts.timeline === "unknown" || l.facts.timeline === "6+" || l.facts.timeline === "3-6") l.facts.timeline = "1-3";
            l.provenance.tourRequested = { source: "SMS reply", detail: "Asked to tour Saturday morning", at: now, verified: true };
            l.provenance.timeline = { source: "SMS reply", detail: "Ready to tour this week", at: now, verified: true };
        },
    },
    {
        id: "preapproval_upload",
        label: "Uploads pre-approval letter",
        icon: "document",
        channel: "Secure upload",
        tone: "positive",
        describe: l => `Uploaded a pre-approval letter: ${usdShort(preAmount(l))} from Lakeline Mortgage (simulated)`,
        apply: (l, now) => {
            touch(l, now);
            const amt = preAmount(l);
            l.facts.preApproval = "verified";
            l.facts.preApprovalAmount = amt;
            l.facts.budgetMax = Math.max(l.facts.budgetMax ?? 0, amt);
            l.facts.lender = "Lakeline Mortgage (simulated)";
            l.provenance.preApproval = { source: "Uploaded document", detail: `Letter parsed: ${usdShort(amt)}, expires in 90 days`, at: now, verified: true };
        },
    },
    {
        id: "listing_revisit",
        label: "Revisits the listing",
        icon: "eye-open",
        channel: "Website analytics",
        tone: "positive",
        describe: l => `Viewed ${listingById(l.profile.listingId)?.address ?? "saved-search results"} 4 more times today (6 min on the photo gallery)`,
        apply: (l, now) => {
            touch(l, now);
            l.behavior.listingViews += 4;
            l.behavior.sessions += 2;
            l.provenance.behavior = { source: "Website analytics (simulated)", detail: "Return visits today", at: now, verified: true };
        },
    },
    {
        id: "saved_homes",
        label: "Saves similar homes",
        icon: "heart",
        channel: "Website analytics",
        tone: "positive",
        describe: l => `Saved 2 similar homes in ${l.facts.areas[0] ?? "Austin"}${l.facts.budgetMax ? ` under ${usdShort(l.facts.budgetMax)}` : ""}`,
        apply: (l, now) => {
            touch(l, now);
            l.behavior.savedHomes += 2;
            l.behavior.sessions += 1;
            l.behavior.listingViews += 2;
            if (l.facts.timeline === "6+") l.facts.timeline = "3-6";
            l.provenance.behavior = { source: "Website analytics (simulated)", detail: "Saved homes", at: now, verified: true };
        },
    },
    {
        id: "email_open",
        label: "Opens email & clicks",
        icon: "envelope",
        channel: "Email tracking",
        tone: "positive",
        describe: () => "Opened your email twice and clicked the comparable-sales link",
        apply: (l, now) => {
            touch(l, now);
            l.behavior.emailOpens += 2;
            l.behavior.sessions += 1;
            l.facts.emailValid = true;
            l.provenance.behavior = { source: "Email tracking (simulated)", detail: "Opened + clicked", at: now, verified: true };
        },
    },
    {
        id: "cobuyer",
        label: "Co-buyer joins search",
        icon: "people",
        channel: "Website analytics",
        tone: "positive",
        describe: l => `A co-buyer joined ${l.contact?.first ?? "the lead"}'s saved search and viewed 3 listings`,
        apply: (l, now) => {
            touch(l, now);
            l.behavior.listingViews += 3;
            l.behavior.sessions += 1;
            l.facts.householdSize = Math.max(2, l.facts.householdSize ?? 2);
        },
    },
    {
        id: "seller_intent",
        label: "Requests a home valuation",
        icon: "home",
        channel: "Website form",
        tone: "positive",
        describe: l => `Requested a home valuation for ${sellerAddr(l)}`,
        apply: (l, now) => {
            touch(l, now);
            l.facts.sellerAddress = sellerAddr(l);
            l.facts.housing = "owner-must-sell";
            if (l.facts.intent === "buy") l.facts.intent = "buy-sell";
            l.provenance.sellerAddress = { source: "Valuation form", detail: "Requested CMA", at: now, verified: true };
        },
    },
    {
        id: "other_agent",
        label: "Mentions another agent",
        icon: "warning-sign",
        channel: "Email reply",
        tone: "negative",
        describe: () => "Replied: “We're actually already working with an agent, just curious about this one.”",
        apply: (l, now) => {
            touch(l, now);
            l.behavior.replies += 1;
            l.facts.workingWithAgent = true;
            l.provenance.workingWithAgent = { source: "Email reply", detail: "Said they have an agent", at: now, verified: true };
        },
    },
    {
        id: "went_cold",
        label: "Goes quiet (5 days)",
        icon: "time",
        channel: "Engagement tracking",
        tone: "negative",
        describe: () => "No response to 3 touches over 5 days; no site visits",
        apply: (l, now) => {
            l.facts.unresponsive = true;
            l.facts.contactAttempts += 3;
            l.behavior.lastActiveAt = now - 5 * DAY;
        },
    },
];

export const signalById = (id: string) => SIGNALS.find(s => s.id === id)!;

function preAmount(l: Lead) {
    const listing = listingById(l.profile.listingId);
    const base = Math.max(listing?.price ?? 0, l.facts.budgetMax ?? 0, l.facts.preApprovalAmount ?? 0) || 425_000;
    return Math.round((base * (listing ? 1.04 : 1.15)) / 5000) * 5000;
}
function sellerAddr(l: Lead) {
    return l.facts.sellerAddress ?? l.profile.enriched.sellerAddress ?? `${1200 + (l.id.length * 37) % 700} ${["Sendero Dr", "Limestone Ct", "Pecan Hollow Ln"][l.id.length % 3]}, ${LISTINGS[l.id.length % LISTINGS.length].city}`;
}

/** The next unused signal in the lead's scripted story (what a real lead would most likely do next). */
export const nextStorySignal = (l: Lead) => l.profile.story.find(s => !l.storyUsed.includes(s));

// --- Call outcomes --------------------------------------------------------------------------

export interface CallOutcome {
    id: string;
    label: string;
    icon: IconName;
    intent: "success" | "primary" | "warning" | "danger" | "none";
    note: string;
    apply: (l: Lead, now: number) => void;
}

export const CALL_OUTCOMES: CallOutcome[] = [
    {
        id: "connected-hot",
        label: "Connected: ready to tour",
        icon: "endorsed",
        intent: "success",
        note: "Confirmed timeline & financing, wants to see homes this week",
        apply: (l, now) => {
            l.facts.connected = true;
            l.facts.contactAttempts += 1;
            l.facts.tourRequested = true;
            if (l.facts.timeline !== "0-1") l.facts.timeline = "1-3";
            if (l.facts.preApproval === "unknown" || l.facts.preApproval === "none") l.facts.preApproval = "stated";
            if (!l.facts.motivation) l.facts.motivation = "Confirmed on call: ready to move";
            l.behavior.replies += 1;
            l.behavior.lastActiveAt = now;
            l.provenance.timeline = { source: "Phone call", detail: "Confirmed live with lead", at: now, verified: true };
            l.provenance.tourRequested = { source: "Phone call", detail: "Wants to tour this week", at: now, verified: true };
            l.provenance.motivation = { source: "Phone call", detail: "Discussed on call", at: now, verified: true };
        },
    },
    {
        id: "connected-later",
        label: "Connected: not ready yet",
        icon: "time",
        intent: "primary",
        note: "Friendly conversation; 6+ months out, wants listings by email",
        apply: (l, now) => {
            l.facts.connected = true;
            l.facts.contactAttempts += 1;
            l.facts.timeline = "6+";
            l.behavior.lastActiveAt = now;
            l.provenance.timeline = { source: "Phone call", detail: "Said 6+ months out", at: now, verified: true };
        },
    },
    {
        id: "voicemail",
        label: "Left voicemail",
        icon: "inbox",
        intent: "warning",
        note: "Left a voicemail and sent a follow-up text",
        apply: l => {
            l.facts.contactAttempts += 1;
        },
    },
    {
        id: "no-answer",
        label: "No answer",
        icon: "phone",
        intent: "none",
        note: "No answer, no voicemail box",
        apply: l => {
            l.facts.contactAttempts += 1;
        },
    },
    {
        id: "wrong-number",
        label: "Wrong number",
        icon: "error",
        intent: "danger",
        note: "Number belongs to someone else",
        apply: l => {
            l.facts.contactAttempts += 1;
            l.facts.phoneValid = false;
        },
    },
];
