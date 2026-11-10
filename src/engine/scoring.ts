// Qualification Agent: a transparent, weighted scoring model. Every factor carries the evidence and
// source it was computed from, so the score can be explained line by line.
import type { Factor, Facts, Grade, Lead, Qualification } from "../types";
import { listingById, SOURCES } from "../data/directory";
import { DAY } from "../lib/format";
import { usdShort } from "../lib/format";

export const WEIGHTS = {
    timeline: 20,
    financing: 20,
    budget: 15,
    engagement: 15,
    intent: 10,
    reach: 10,
    source: 5,
    motivation: 5,
} as const;

export const GRADE_META: Record<Grade, { intent: "danger" | "warning" | "primary" | "none"; color: string; sla: string; icon: string }> = {
    Hot: { intent: "danger", color: "var(--danger)", sla: "5 min", icon: "flame" },
    Warm: { intent: "warning", color: "var(--warning)", sla: "1 hour", icon: "trending-up" },
    Nurture: { intent: "primary", color: "var(--primary)", sla: "24 hours", icon: "rain" },
    Cold: { intent: "none", color: "var(--muted)", sla: "Drip only", icon: "snowflake" },
};

export const gradeOf = (score: number): Grade => (score >= 75 ? "Hot" : score >= 55 ? "Warm" : score >= 35 ? "Nurture" : "Cold");

const TIMELINE_VALUE: Record<Facts["timeline"], number> = { "0-1": 1, "1-3": 0.8, "3-6": 0.5, "6+": 0.2, unknown: 0.35 };
const TIMELINE_LABEL: Record<Facts["timeline"], string> = {
    "0-1": "Moving within 30 days",
    "1-3": "Moving in 1–3 months",
    "3-6": "Moving in 3–6 months",
    "6+": "6+ months out / browsing",
    unknown: "Timeline not stated",
};

/** 0..100 index of how engaged the lead is right now, with recency decay. */
export function engagementIndex(lead: Lead, now = Date.now()) {
    const b = lead.behavior;
    const pts = b.sessions * 2 + b.listingViews * 3 + b.savedHomes * 5 + b.emailOpens * 4 + b.replies * 12;
    let v = Math.min(1, pts / 60);
    const idleDays = (now - b.lastActiveAt) / DAY;
    if (idleDays > 3) v *= 0.6;
    if (lead.facts.unresponsive) v *= 0.4;
    return Math.round(v * 100);
}

const prov = (lead: Lead, k: keyof Facts | "behavior") => lead.provenance[k];

export function scoreLead(lead: Lead, now = Date.now()): Qualification {
    const f = lead.facts;
    const listing = listingById(lead.profile.listingId);
    const factors: Factor[] = [];
    const add = (x: Omit<Factor, "points">) => factors.push({ ...x, points: Math.round(x.weight * x.value * 10) / 10 });

    // 1. Timeline
    {
        const p = prov(lead, "timeline");
        add({
            id: "timeline",
            label: "Timeline urgency",
            weight: WEIGHTS.timeline,
            value: TIMELINE_VALUE[f.timeline],
            known: f.timeline !== "unknown",
            verified: !!p?.verified,
            evidence: f.timeline === "unknown" ? "No move date mentioned yet" : `${TIMELINE_LABEL[f.timeline]}${p ? ` · ${p.detail}` : ""}`,
            source: p?.source ?? "—",
        });
    }
    // 2. Financial readiness
    {
        const p = prov(lead, "preApproval");
        const value = { verified: 1, cash: p?.verified ? 1 : 0.85, stated: 0.7, none: 0.25, unknown: 0.35 }[f.preApproval];
        const label = {
            verified: `Verified pre-approval${f.preApprovalAmount ? ` · ${usdShort(f.preApprovalAmount)}` : ""}${f.lender ? ` · ${f.lender}` : ""}`,
            cash: "Cash buyer",
            stated: `Says pre-approved${f.preApprovalAmount ? ` (~${usdShort(f.preApprovalAmount)})` : ""} · not yet verified`,
            none: "Not pre-approved yet",
            unknown: "Financing unknown",
        }[f.preApproval];
        add({
            id: "financing",
            label: "Financial readiness",
            weight: WEIGHTS.financing,
            value,
            known: f.preApproval !== "unknown",
            verified: f.preApproval === "verified" || !!p?.verified,
            evidence: p ? `${label} · ${p.detail}` : label,
            source: p?.source ?? "—",
        });
    }
    // 3. Budget fit
    {
        const cap = f.preApprovalAmount ?? f.budgetMax;
        let value = 0.4;
        let evidence = "Budget not stated";
        let known = false;
        let source = prov(lead, "budgetMax")?.source ?? prov(lead, "preApproval")?.source ?? "—";
        if (f.intent === "sell" || (f.intent === "buy-sell" && f.sellerAddress && !listing)) {
            value = f.sellerAddress ? 0.85 : 0.5;
            known = !!f.sellerAddress;
            evidence = f.sellerAddress ? `Owner of ${f.sellerAddress} · listing opportunity` : "Seller, property not identified";
            source = prov(lead, "sellerAddress")?.source ?? source;
        } else if (f.preApproval === "cash" && listing) {
            value = cap && cap < listing.price * 0.9 ? 0.6 : 1;
            known = true;
            evidence = cap ? `Est. buying power ${usdShort(cap)} vs list ${usdShort(listing.price)}` : `Cash buyer for ${usdShort(listing.price)} listing`;
        } else if (cap && listing) {
            const r = cap / listing.price;
            value = r >= 1 ? 1 : r >= 0.93 ? 0.75 : r >= 0.85 ? 0.45 : 0.2;
            known = true;
            evidence = `${usdShort(cap)} budget vs ${usdShort(listing.price)} list (${Math.round(r * 100)}%)`;
        } else if (cap) {
            value = 0.7;
            known = true;
            evidence = `Budget ${f.budgetMin ? `${usdShort(f.budgetMin)}–` : "up to "}${usdShort(cap)}, matches active inventory`;
        }
        add({ id: "budget", label: "Budget fit", weight: WEIGHTS.budget, value, known, verified: f.preApproval === "verified", evidence, source });
    }
    // 4. Engagement
    {
        const b = lead.behavior;
        const idx = engagementIndex(lead, now);
        const parts = [
            b.listingViews && `${b.listingViews} listing views`,
            b.savedHomes && `${b.savedHomes} saved`,
            b.emailOpens && `${b.emailOpens} email opens`,
            b.replies && `${b.replies} replies`,
        ].filter(Boolean);
        add({
            id: "engagement",
            label: "Engagement depth",
            weight: WEIGHTS.engagement,
            value: idx / 100,
            known: idx > 0,
            verified: idx > 0,
            evidence: f.unresponsive ? `Unresponsive to recent outreach · ${parts.join(", ") || "no activity"}` : parts.length ? parts.join(", ") : "No tracked activity yet",
            source: prov(lead, "behavior")?.source ?? "—",
        });
    }
    // 5. Intent clarity
    {
        const value = f.tourScheduled ? 1 : f.tourRequested ? 1 : f.sellerAddress && f.intent !== "buy" ? 0.85 : lead.profile.listingId ? 0.6 : 0.3;
        const evidence = f.tourScheduled
            ? `Tour booked · ${f.tourScheduled}`
            : f.tourRequested
              ? `Asked to tour${prov(lead, "tourRequested") ? ` · ${prov(lead, "tourRequested")!.detail}` : ""}`
              : f.sellerAddress && f.intent !== "buy"
                ? "Asked for a home valuation"
                : listing
                  ? `Asked about a specific listing (${listing.address})`
                  : "General inquiry, no specific property";
        add({ id: "intent", label: "Intent clarity", weight: WEIGHTS.intent, value, known: true, verified: !!f.tourScheduled, evidence, source: prov(lead, "tourRequested")?.source ?? SOURCES[lead.raw.source].label });
    }
    // 6. Reachability
    {
        const value = f.connected ? 1 : f.phoneValid && f.emailValid ? 0.9 : f.phoneValid || f.emailValid ? 0.55 : 0.1;
        const evidence = f.connected
            ? "Spoke with lead directly"
            : [f.phoneValid ? "Mobile number valid" : "Phone invalid / unreachable", f.emailValid ? "email deliverable" : "email undeliverable"].join(" · ");
        add({ id: "reach", label: "Contact quality", weight: WEIGHTS.reach, value, known: true, verified: f.connected || (f.phoneValid && f.emailValid), evidence, source: "Normalization Agent" });
    }
    // 7. Source quality
    {
        const s = SOURCES[lead.raw.source];
        add({
            id: "source",
            label: "Source quality",
            weight: WEIGHTS.source,
            value: s.quality,
            known: true,
            verified: true,
            evidence: `${s.label} leads convert at ${Math.round(s.historicalRate * 100)}% here (trailing 12 mo.)`,
            source: "Brokerage CRM history (simulated)",
        });
    }
    // 8. Motivation
    {
        const p = prov(lead, "motivation");
        add({
            id: "motivation",
            label: "Motivation",
            weight: WEIGHTS.motivation,
            value: f.motivation ? 0.9 : 0.3,
            known: !!f.motivation,
            verified: false,
            evidence: f.motivation ?? "No life event or reason to move identified",
            source: p?.source ?? "—",
        });
    }
    // Penalties
    if (f.workingWithAgent)
        factors.push({
            id: "agency",
            label: "Already represented",
            weight: 25,
            value: 1,
            points: -25,
            known: true,
            verified: false,
            penalty: true,
            evidence: `Indicated they're working with another agent${prov(lead, "workingWithAgent") ? ` · ${prov(lead, "workingWithAgent")!.detail}` : ""}`,
            source: prov(lead, "workingWithAgent")?.source ?? "—",
        });
    if (f.unresponsive)
        factors.push({ id: "cold", label: "Gone quiet", weight: 8, value: 1, points: -8, known: true, verified: true, penalty: true, evidence: `${f.contactAttempts} outreach attempts without a response`, source: "Engagement tracking" });

    const raw = factors.reduce((s, x) => s + x.points, 0);
    const score = Math.max(1, Math.min(99, Math.round(raw)));
    const grade = gradeOf(score);

    // Confidence: how much of the score is backed by real, verified, consistent data.
    const core = factors.filter(x => !x.penalty);
    const known = core.filter(x => x.known).length;
    const verified = core.filter(x => x.known && x.verified).length;
    const conflicts: string[] = [];
    if (f.timeline === "6+" && (f.tourRequested || engagementIndex(lead, now) > 55)) conflicts.push("Says “just browsing” but behavior shows active shopping");
    if (f.workingWithAgent && f.tourRequested) conflicts.push("Requested a tour but reports existing representation");
    if (f.preApproval === "stated" && f.preApprovalAmount && listing && f.preApprovalAmount < listing.price * 0.85) conflicts.push("Stated budget well below the listing they asked about");
    const contactOk = f.phoneValid && f.emailValid;
    const confidence = Math.min(0.98, (known / core.length) * 0.55 + (known ? verified / known : 0) * 0.25 + (contactOk ? 0.1 : 0.03) + (conflicts.length ? 0 : 0.1));
    const confidenceLabel = confidence >= 0.75 ? "High" : confidence >= 0.55 ? "Medium" : "Low";
    const confidenceNotes = [
        { ok: known >= 6, text: `${known} of ${core.length} factors backed by data` },
        { ok: verified >= 3, text: `${verified} verified by a third-party or first-hand source` },
        { ok: contactOk, text: contactOk ? "Phone and email validated" : "Contact info incomplete or invalid" },
        ...(conflicts.length ? conflicts.map(c => ({ ok: false, text: c })) : [{ ok: true, text: "No conflicting signals" }]),
    ];

    const top = [...core].sort((a, b) => b.points - a.points).slice(0, 2).map(x => x.label.toLowerCase());
    const weak = core.filter(x => x.value < 0.4).map(x => x.label.toLowerCase());
    const summary =
        `${grade} lead (${score}/100) driven by ${top.join(" and ")}` +
        (weak.length ? `; held back by ${weak.slice(0, 2).join(" and ")}` : "") +
        (f.workingWithAgent ? "; agency conflict applied" : "") +
        ".";

    return { score, grade, confidence, confidenceLabel, confidenceNotes, factors, summary };
}
