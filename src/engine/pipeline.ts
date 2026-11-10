// The six-agent lead pipeline: pure functions over (immer) Lead drafts, plus the scripted
// console logs each agent "streams" while it works.
import type { IconName } from "@blueprintjs/core";
import type { AgentStageId, ExtractedEntity, Facts, FieldMapping, Lead, LeadProfile, LogLine, Task } from "../types";
import { agentById, listingById, SOURCES } from "../data/directory";
import { renderRaw } from "../data/rawPayload";
import { uid, usd, usdShort } from "../lib/format";
import { engagementIndex, scoreLead } from "./scoring";
import { buildStrategy } from "./strategy";
import { planSpecs, replanTasks, routeLead } from "./tasks";

export interface StageMeta {
    id: AgentStageId;
    label: string;
    short: string;
    agent: string;
    icon: IconName;
    blurb: string;
}

export const STAGES: StageMeta[] = [
    { id: "intake", label: "Intake", short: "Intake", agent: "Intake Agent", icon: "inbox", blurb: "Receives raw payloads from every channel, classifies the inquiry and extracts entities." },
    { id: "normalize", label: "Normalize", short: "Normalize", agent: "Normalization Agent", icon: "clean", blurb: "Standardizes contact data into one schema and de-duplicates against the CRM." },
    { id: "enrich", label: "Enrich", short: "Enrich", agent: "Enrichment Agent", icon: "search-around", blurb: "Adds listing, financing, behavioral and public-record context with provenance." },
    { id: "qualify", label: "Qualify", short: "Qualify", agent: "Qualification Agent", icon: "horizontal-bar-chart", blurb: "Scores the lead with an explainable, weighted model and a confidence level." },
    { id: "strategy", label: "Strategy", short: "Strategy", agent: "Strategy Agent", icon: "lightbulb", blurb: "Routes to the best agent and writes evidence-based conversion recommendations." },
    { id: "plan", label: "Tasks", short: "Tasks", agent: "Task Planner Agent", icon: "list-detail-view", blurb: "Turns recommendations into prioritized, owned, SLA-bound tasks." },
];

export const stageMeta = (id: AgentStageId) => STAGES.find(s => s.id === id)!;

let leadSeq = 4180;

export function log(lead: Lead, actor: string, text: string, intent?: Lead["activity"][number]["intent"], t = Date.now()) {
    lead.activity.unshift({ id: uid("act"), t, actor, text, intent });
}

const DEFAULT_FACTS: Facts = {
    intent: "buy",
    preApproval: "unknown",
    timeline: "unknown",
    housing: "unknown",
    areas: [],
    tourRequested: false,
    workingWithAgent: false,
    phoneValid: false,
    emailValid: false,
    contactAttempts: 0,
    connected: false,
    unresponsive: false,
};

export function createLead(profile: LeadProfile, receivedAt = Date.now()): Lead {
    const lead: Lead = {
        id: `LD-${leadSeq++}`,
        profile,
        raw: renderRaw(profile, receivedAt),
        receivedAt,
        stages: { intake: "running", normalize: "locked", enrich: "locked", qualify: "locked", strategy: "locked", plan: "locked" },
        runs: {},
        extracted: [],
        mappings: [],
        facts: structuredClone(DEFAULT_FACTS),
        provenance: {},
        behavior: { sessions: 0, listingViews: 0, savedHomes: 0, emailOpens: 0, replies: 0, lastActiveAt: receivedAt },
        scoreHistory: [],
        status: "processing",
        signals: [],
        activity: [],
        storyUsed: [],
    };
    log(lead, "Intake Agent", `Received inquiry via ${SOURCES[profile.source].label}`, "primary", receivedAt);
    return lead;
}

export const displayName = (lead: Lead) => lead.contact?.name ?? lead.profile.rawName.replace(/<.*>/, "").trim();
export const isProcessing = (lead: Lead) => Object.values(lead.stages).some(s => s === "running");
export const currentStage = (lead: Lead): AgentStageId => STAGES.find(s => lead.stages[s.id] === "running")?.id ?? "plan";

const NEXT: Partial<Record<AgentStageId, AgentStageId>> = { intake: "normalize", normalize: "enrich", enrich: "qualify", qualify: "strategy", strategy: "plan" };
export function advance(lead: Lead, from: AgentStageId) {
    lead.stages[from] = "complete";
    const n = NEXT[from];
    if (n) lead.stages[n] = "running";
}

// --- 1. Intake ---------------------------------------------------------------------------------

const INTENT_LABEL: Record<Facts["intent"], string> = { buy: "Buyer", sell: "Seller", "buy-sell": "Buyer + Seller", invest: "Investor" };

function entitiesFrom(p: LeadProfile): ExtractedEntity[] {
    const s = p.stated;
    const l = listingById(p.listingId);
    const out: ExtractedEntity[] = [{ label: "Intent", value: INTENT_LABEL[s.intent ?? "buy"], confidence: 0.94 }];
    if (l) out.push({ label: "Property", value: `${l.address} (${l.mls})`, confidence: 0.99 });
    if (s.tourRequested) out.push({ label: "Request", value: "Showing / tour", confidence: 0.96 });
    if (s.timeline && s.timeline !== "unknown") out.push({ label: "Timeline", value: `${s.timeline === "6+" ? "6+" : s.timeline} months · ${p.statedNotes.timeline ?? ""}`, confidence: p.statedNotes.timeline?.startsWith("Form") ? 0.95 : 0.86 });
    if (s.preApproval) out.push({ label: "Financing", value: { stated: "Pre-approved (self-reported)", cash: "Cash", none: "Not pre-approved", verified: "Pre-approved", unknown: "Unknown" }[s.preApproval], confidence: 0.88 });
    if (s.preApprovalAmount || s.budgetMax) out.push({ label: "Budget", value: s.budgetMin ? `${usd(s.budgetMin)} – ${usd(s.budgetMax!)}` : `up to ${usd(s.preApprovalAmount ?? s.budgetMax!)}`, confidence: 0.9 });
    if (s.beds) out.push({ label: "Bedrooms", value: `${s.beds}+`, confidence: 0.92 });
    if (s.householdSize) out.push({ label: "Household", value: `${s.householdSize} people`, confidence: 0.8 });
    if (s.motivation) out.push({ label: "Motivation", value: s.motivation, confidence: 0.83 });
    if (s.sellerAddress) out.push({ label: "Seller property", value: s.sellerAddress, confidence: 0.97 });
    if (s.housing && s.housing !== "unknown") out.push({ label: "Current housing", value: { renting: "Renting", owner: "Owner", "owner-must-sell": "Owner, must sell first", unknown: "" }[s.housing], confidence: 0.85 });
    if (s.workingWithAgent) out.push({ label: "Agency", value: "Working with an agent", confidence: 0.97 });
    if (p.language) out.push({ label: "Language", value: `${p.language} (translated)`, confidence: 0.99 });
    return out;
}

export function completeIntake(lead: Lead, now = Date.now()) {
    const p = lead.profile;
    lead.extracted = entitiesFrom(p);
    const src = SOURCES[p.source];
    const where = p.formExtras && !p.message ? `${src.label} form` : `${src.label} message`;
    for (const [k, v] of Object.entries(p.stated) as [keyof Facts, never][]) {
        if (v === undefined) continue;
        (lead.facts as unknown as Record<string, unknown>)[k] = k === "areas" ? [...(v as string[])] : v;
        if (k !== "areas" && k !== "intent") lead.provenance[k] = { source: where, detail: p.statedNotes[k] ?? "Stated in inquiry", at: now };
    }
    advance(lead, "intake");
    log(lead, "Intake Agent", `Extracted ${lead.extracted.length} entities from ${src.format.toUpperCase()} payload`, "success", now);
}

export function intakeScript(lead: Lead): ScriptStep[] {
    const p = lead.profile;
    const src = SOURCES[p.source];
    const ents = entitiesFrom(p);
    return [
        { text: `Webhook received · ${src.channel}`, ms: 350, level: "agent" },
        { text: `Payload format: ${src.format.toUpperCase()} · ${lead.raw.payload.length.toLocaleString()} bytes · source adapter "${src.id}-v3"`, ms: 380 },
        ...(p.language ? [{ text: `Language detected: ${p.language} (0.99) · translating to English for downstream agents`, ms: 520, level: "ok" as const }] : []),
        { text: `Classified inquiry: ${INTENT_LABEL[p.stated.intent ?? "buy"]}${p.stated.tourRequested ? " · tour request" : p.stated.sellerAddress ? " · valuation request" : " · information request"}`, ms: 450, level: "ok" },
        ...ents.slice(1, 6).map(e => ({ text: `Entity → ${e.label}: ${e.value}  (${Math.round(e.confidence * 100)}%)`, ms: 230 })),
        { text: `${ents.length} entities extracted · handing off to Normalization Agent`, ms: 300, level: "ok" },
    ];
}

// --- 2. Normalize ------------------------------------------------------------------------------

const digits = (s: string) => s.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
export const fmtPhone = (raw: string) => {
    const d = digits(raw);
    return d.length === 10 ? `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw;
};

function nameRule(raw: string) {
    if (raw.includes("<")) return "Parsed display name from email header";
    if (raw.includes("&")) return "Split joint name: primary contact + co-buyer";
    if (/^dr\.?\s/i.test(raw)) return "Removed honorific (Dr.), kept for salutation";
    if (/\s\w\.?$/.test(raw.trim())) return "Expanded surname from email local-part";
    if (raw === raw.toUpperCase()) return "Title-cased · diacritics restored (name dictionary)";
    if (raw === raw.toLowerCase()) return "Title-cased";
    return "Validated";
}

export function normalizeMappings(lead: Lead): FieldMapping[] {
    const p = lead.profile;
    const l = listingById(p.listingId);
    const name = `${p.first} ${p.last}`;
    const email = p.rawEmail.trim().toLowerCase();
    const emailOk = p.enriched.emailValid !== false;
    const m: FieldMapping[] = [
        { field: "Name", raw: p.rawName.replace(/<.*>/, "").trim(), normalized: name, rule: nameRule(p.rawName), changed: p.rawName.trim() !== name },
        { field: "Email", raw: p.rawEmail, normalized: emailOk ? email : `${email} ⚠`, rule: emailOk ? "Trimmed, lower-cased · MX record OK (simulated)" : "Invalid domain, flagged undeliverable", changed: p.rawEmail !== email || !emailOk },
        { field: "Phone", raw: p.rawPhone, normalized: fmtPhone(p.rawPhone), rule: "E.164 · line type: mobile (simulated carrier lookup)", changed: p.rawPhone !== fmtPhone(p.rawPhone) },
    ];
    if (l) m.push({ field: "Property", raw: p.source === "zillow" ? `zpid / "${l.address}, ${l.city}"` : l.address, normalized: `${l.mls} · ${l.address}, ${l.city} ${l.zip}`, rule: "Resolved to MLS record by address + ID", changed: true });
    if (p.stated.timeline && p.stated.timeline !== "unknown" && p.statedNotes.timeline)
        m.push({ field: "Timeline", raw: p.statedNotes.timeline.replace(/^Form answer: /, ""), normalized: `${p.stated.timeline} months`, rule: "Phrase → canonical timeline bucket", changed: true });
    if (p.formExtras?.["Price range"]) m.push({ field: "Budget", raw: p.formExtras["Price range"], normalized: `${usd(p.stated.budgetMin ?? 0)} – ${usd(p.stated.budgetMax ?? 0)}`, rule: "Parsed range, expanded k-notation", changed: true });
    else if (p.stated.preApprovalAmount) m.push({ field: "Budget", raw: p.statedNotes.preApproval ?? "", normalized: `max ${usd(p.stated.preApprovalAmount)}`, rule: "Extracted currency amount from free text", changed: true });
    if (p.language) m.push({ field: "Language", raw: "es", normalized: `${p.language} · reply in ${p.language}`, rule: "Set preferred language for outreach", changed: true });
    m.push({ field: "Source", raw: lead.raw.channel, normalized: `${SOURCES[p.source].label} · ${p.source === "referral" ? "Referral (Ana Ruiz)" : "Paid portal"}`.replace(" · Paid portal", ["website", "email", "openhouse"].includes(p.source) ? " · Owned channel" : p.source === "facebook" ? " · Paid social" : " · Paid portal"), rule: "Attribution for ROI reporting", changed: true });
    m.push({ field: "Channel pref.", raw: "—", normalized: { call: "Phone call", text: "Text message", email: "Email" }[p.preferredChannel], rule: p.preferredChannel === "text" ? "Inferred: mobile + portal app user" : "Inferred from inquiry channel", changed: true });
    return m;
}

export function completeNormalize(lead: Lead, now = Date.now()) {
    const p = lead.profile;
    lead.contact = {
        name: `${p.first} ${p.last}`,
        first: p.first,
        last: p.last,
        email: p.rawEmail.trim().toLowerCase(),
        phone: fmtPhone(p.rawPhone),
        preferredChannel: p.preferredChannel,
        timezone: p.rawPhone.includes("206") ? "Pacific (relocating to Central)" : "Central",
        language: p.language ?? "English",
    };
    lead.mappings = normalizeMappings(lead);
    lead.facts.phoneValid = p.enriched.phoneValid !== false;
    lead.facts.emailValid = p.enriched.emailValid !== false;
    lead.dedupe = p.existing ? { matched: true, contactId: `C-${2000 + p.last.length * 17}`, confidence: 0.96, since: p.existing.since, history: p.existing.history } : { matched: false };
    advance(lead, "normalize");
    const changed = lead.mappings.filter(x => x.changed).length;
    log(lead, "Normalization Agent", `Standardized ${changed} fields${lead.dedupe.matched ? ` · merged with existing contact (since ${p.existing!.since})` : " · new contact"}`, lead.dedupe.matched ? "warning" : "success", now);
}

export function normalizeScript(lead: Lead): ScriptStep[] {
    const p = lead.profile;
    const m = normalizeMappings(lead);
    return [
        { text: "Mapping source fields to canonical lead schema v4", ms: 350, level: "agent" },
        ...m.filter(x => x.changed).slice(0, 6).map(x => ({ text: `${x.field}: "${x.raw.slice(0, 42)}" → "${x.normalized.slice(0, 46)}"`, ms: 260, level: (x.normalized.includes("⚠") ? "warn" : "info") as LogLine["level"] })),
        { text: "Searching CRM for duplicates (email, phone, fuzzy name + address)…", ms: 600 },
        p.existing
            ? { text: `Match found · contact since ${p.existing.since} · 96% confidence · merging ${p.existing.history.length} history items`, ms: 500, level: "warn" }
            : { text: "No duplicate found · creating new contact", ms: 400, level: "ok" },
    ];
}

// --- 3. Enrich ---------------------------------------------------------------------------------

const ENRICH_SOURCE: Partial<Record<keyof Facts, string>> = {
    preApproval: "Lender network (simulated)",
    lender: "Lender network (simulated)",
    housing: "Property records (simulated)",
    budgetMax: "Property records + model (simulated)",
    sellerAddress: "County records (simulated)",
    phoneValid: "Carrier lookup (simulated)",
    emailValid: "Email verification (simulated)",
};

export function completeEnrich(lead: Lead, now = Date.now()) {
    const p = lead.profile;
    for (const [k, v] of Object.entries(p.enriched) as [keyof Facts, never][]) {
        if (v === undefined) continue;
        // Enrichment can upgrade a self-reported fact (stated → verified) but never erase one.
        if (k === "preApproval" && lead.facts.preApproval === "cash" && v === "stated") continue;
        (lead.facts as unknown as Record<string, unknown>)[k] = v;
        const note = p.enrichedNotes[k];
        if (note || k === "preApproval" || k === "housing" || k === "budgetMax" || k === "sellerAddress")
            lead.provenance[k] = { source: ENRICH_SOURCE[k] ?? "Enrichment", detail: note ?? "Found by enrichment", at: now, verified: true };
    }
    if (p.preferredChannel === "text") lead.facts.phoneValid = lead.facts.phoneValid || true;
    const b = p.behavior;
    lead.behavior = { ...b, lastActiveAt: now - 20 * 60_000 };
    if (b.sessions + b.listingViews > 0)
        lead.provenance.behavior = { source: p.existing ? "CRM + website analytics (simulated)" : "Website analytics (simulated)", detail: `${b.sessions} sessions matched by email hash`, at: now, verified: true };
    advance(lead, "enrich");
    log(lead, "Enrichment Agent", `Added ${Object.keys(p.enriched).length + (b.sessions ? 1 : 0)} enrichment signals${lead.facts.preApproval === "verified" ? " · pre-approval verified" : ""}`, "success", now);
}

export function enrichScript(lead: Lead): ScriptStep[] {
    const p = lead.profile;
    const l = listingById(p.listingId);
    const lines: ScriptStep[] = [{ text: "Fan-out to 5 enrichment providers (all simulated)", ms: 350, level: "agent" }];
    if (l) lines.push({ text: `MLS: ${l.address} · ${usd(l.price)} · ${l.beds}bd/${l.baths}ba · ${l.status} · DOM ${l.dom}`, ms: 420, level: "ok" });
    lines.push({ text: p.behavior.sessions ? `Website analytics: ${p.behavior.sessions} sessions, ${p.behavior.listingViews} listing views, ${p.behavior.savedHomes} saved homes` : "Website analytics: no prior sessions for this email hash", ms: 480, level: p.behavior.sessions ? "ok" : "info" });
    for (const [k, note] of Object.entries(p.enrichedNotes)) lines.push({ text: `${ENRICH_SOURCE[k as keyof Facts] ?? "Enrichment"}: ${note}`, ms: 520, level: /no valid|invalid/i.test(note!) ? "warn" : "ok" });
    if (p.enriched.preApproval === "verified" && !p.enrichedNotes.preApproval) lines.push({ text: "Lender network: pre-approval on file", ms: 450, level: "ok" });
    lines.push({ text: `Carrier lookup: ${p.enriched.phoneValid === false ? "number not in service" : "mobile, SMS-capable"}`, ms: 300, level: p.enriched.phoneValid === false ? "warn" : "info" });
    lines.push({ text: "Market context: median DOM 31 · list-to-sale 97.6% · inventory 3.1 mo (simulated)", ms: 380 });
    return lines;
}

// --- 4. Qualify --------------------------------------------------------------------------------

export function completeQualify(lead: Lead, now = Date.now(), label = "Initial qualification") {
    lead.qualification = scoreLead(lead, now);
    lead.scoreHistory.push({ t: now, score: lead.qualification.score, confidence: lead.qualification.confidence, label });
    lead.scoreChangedAt = now;
    if (lead.stages.qualify === "running") advance(lead, "qualify");
    const q = lead.qualification;
    log(lead, "Qualification Agent", `Scored ${q.score}/100 · ${q.grade} · ${q.confidenceLabel.toLowerCase()} confidence (${Math.round(q.confidence * 100)}%)`, q.grade === "Hot" ? "danger" : q.grade === "Warm" ? "warning" : "primary", now);
}

export function qualifyScript(lead: Lead): ScriptStep[] {
    const q = scoreLead(lead);
    return [
        { text: "Loading scoring model: Residential Lead Quality v2026.4 (8 factors + 2 adjustments)", ms: 400, level: "agent" },
        ...q.factors.map(f => ({ text: `${f.penalty ? "−" : "+"}${Math.abs(f.points).toFixed(1).padStart(4)} ${f.label.padEnd(20)} ${f.known ? "" : "(no data) "}${f.evidence.slice(0, 64)}`, ms: 300, level: (f.penalty ? "warn" : f.value >= 0.7 ? "ok" : "info") as LogLine["level"] })),
        { text: `Confidence ${Math.round(q.confidence * 100)}% (${q.confidenceLabel}): ${q.confidenceNotes.filter(n => !n.ok).map(n => n.text).join("; ") || "data complete and consistent"}`, ms: 420, level: q.confidenceLabel === "Low" ? "warn" : "info" },
        { text: `Score ${q.score}/100 → ${q.grade.toUpperCase()}`, ms: 380, level: q.grade === "Hot" ? "error" : q.grade === "Warm" ? "warn" : "ok" },
    ];
}

// --- 5. Strategy -------------------------------------------------------------------------------

export function loadByAgent(leads: Lead[]) {
    const load: Record<string, number> = {};
    for (const l of leads) if (l.assigneeId && l.status !== "disqualified") load[l.assigneeId] = (load[l.assigneeId] ?? 0) + 1;
    return load;
}

export function completeStrategy(lead: Lead, leads: Lead[], autoRoute: boolean, now = Date.now()) {
    if (!lead.assigneeId) {
        if (lead.dedupe?.matched && /Maya Lopez/.test(lead.dedupe.history?.join(" ") ?? "")) {
            lead.assigneeId = "mlopez";
            lead.routingReason = "Maya Lopez: prior relationship with this contact (CRM history)";
        } else if (autoRoute) {
            const r = routeLead(lead, loadByAgent(leads));
            lead.assigneeId = r.id;
            lead.routingReason = r.reason;
        } else {
            lead.assigneeId = "skim";
            lead.routingReason = "Auto-routing off → Inside Sales queue for manual assignment";
        }
    }
    lead.strategy = buildStrategy(lead);
    if (lead.stages.strategy === "running") advance(lead, "strategy");
    log(lead, "Strategy Agent", `Routed to ${agentById(lead.assigneeId)!.name} · ${lead.strategy.tours.length} tour matches · ${lead.strategy.documents.length} documents`, "primary", now);
}

export function strategyScript(lead: Lead, leads: Lead[]): ScriptStep[] {
    const r = lead.dedupe?.matched ? { reason: "Maya Lopez: prior relationship with this contact" } : routeLead(lead, loadByAgent(leads));
    const f = lead.facts;
    return [
        { text: "Assembling evidence graph from intake, enrichment and score factors", ms: 380, level: "agent" },
        { text: `Routing → ${r.reason}`, ms: 520, level: "ok" },
        { text: "Matching inventory against budget, area, beds and preferences…", ms: 520 },
        { text: `Drafting call script${lead.contact?.language === "Spanish" ? " (bilingual)" : ""} · ${f.tourRequested ? "tour-close" : f.sellerAddress ? "listing-appointment close" : "discovery close"}`, ms: 450 },
        { text: "Drafting personalized email + SMS from inquiry context", ms: 450 },
        { text: "Selecting discovery questions for unknown / unverified factors", ms: 360 },
        { text: "Strategy ready · handing off to Task Planner", ms: 300, level: "ok" },
    ];
}

// --- 6. Plan -----------------------------------------------------------------------------------

export function completePlan(lead: Lead, tasks: Task[], now = Date.now()) {
    const r = replanTasks(lead, tasks, now);
    lead.status = lead.qualification!.grade === "Cold" ? "nurture" : lead.facts.workingWithAgent ? "new" : "new";
    if (lead.stages.plan === "running") advance(lead, "plan");
    log(lead, "Task Planner Agent", `Created ${r.created} prioritized tasks → Action Center`, "success", now);
}

export function planScript(lead: Lead): ScriptStep[] {
    const specs = planSpecs(lead);
    return [
        { text: "Converting recommendations into tasks with owners + SLAs", ms: 380, level: "agent" },
        ...specs.map(s => ({ text: `+ [${s.kind.toUpperCase()}] ${s.title.slice(0, 70)} · SLA ${s.slaMin < 60 ? `${s.slaMin}m` : `${Math.round(s.slaMin / 60)}h`}`, ms: 260 })),
        { text: "Priority = 40% urgency + 30% lead quality + 15% engagement + 15% opportunity", ms: 420 },
        { text: `Published ${specs.length} tasks to ${agentById(lead.assigneeId)?.name ?? "queue"} + brokerage Action Center`, ms: 320, level: "ok" },
    ];
}

// --- Re-evaluation after new information --------------------------------------------------------

export function reevalScript(lead: Lead, after: Lead, reason: string): ScriptStep[] {
    const before = lead.qualification!;
    const q = after.qualification!;
    const changed = q.factors.filter(f => {
        const b = before.factors.find(x => x.id === f.id);
        return !b || Math.abs(b.points - f.points) >= 0.5;
    });
    const gone = before.factors.filter(b => !q.factors.some(f => f.id === b.id));
    const d = q.score - before.score;
    return [
        { text: `Signal: ${reason}`, ms: 300, level: "agent" },
        { text: "Qualification Agent re-weighting affected factors…", ms: 450 },
        ...changed.map(f => {
            const b = before.factors.find(x => x.id === f.id);
            return { text: `  ${f.label}: ${b ? b.points.toFixed(1) : "0.0"} → ${f.points.toFixed(1)}  (${f.evidence.slice(0, 56)})`, ms: 280, level: (f.points >= (b?.points ?? 0) ? "ok" : "warn") as LogLine["level"] };
        }),
        ...gone.map(b => ({ text: `  ${b.label}: removed`, ms: 260, level: "ok" as const })),
        { text: `Score ${before.score} → ${q.score} (${d >= 0 ? "+" : ""}${d}) · ${q.grade}${q.grade !== before.grade ? ` (was ${before.grade})` : ""} · confidence ${Math.round(before.confidence * 100)}% → ${Math.round(q.confidence * 100)}%`, ms: 420, level: d >= 0 ? "ok" : "warn" },
        { text: "Strategy Agent refreshing recommendations", ms: 360 },
        { text: "Task Planner re-prioritizing open tasks", ms: 360, level: "ok" },
    ];
}

export function engagementSummary(lead: Lead) {
    const e = engagementIndex(lead);
    return `${e}/100`;
}

export function fmtBudget(lead: Lead) {
    const f = lead.facts;
    const cap = f.preApprovalAmount ?? f.budgetMax;
    if (!cap) return "Unknown";
    return f.budgetMin ? `${usdShort(f.budgetMin)}–${usdShort(cap)}` : `≤ ${usdShort(cap)}`;
}

export interface ScriptStep {
    text: string;
    level?: LogLine["level"];
    ms: number;
}
