// Domain model for the Lead Automation [Notional] demo.
// Everything here is fictional. "Agents" are deterministic functions over these structures.

export type SourceId = "zillow" | "realtor" | "website" | "email" | "facebook" | "openhouse" | "referral";

export type AgentStageId = "intake" | "normalize" | "enrich" | "qualify" | "strategy" | "plan";
export type StageStatus = "locked" | "running" | "complete";

export type Intent = "buy" | "sell" | "buy-sell" | "invest";
export type Timeline = "0-1" | "1-3" | "3-6" | "6+" | "unknown";
export type PreApproval = "verified" | "stated" | "cash" | "none" | "unknown";
export type Housing = "renting" | "owner-must-sell" | "owner" | "unknown";
export type Grade = "Hot" | "Warm" | "Nurture" | "Cold";
export type LeadStatus = "processing" | "new" | "contacted" | "appointment" | "nurture" | "disqualified";

/** What the agents currently believe about a lead. Each key can carry provenance. */
export interface Facts {
    intent: Intent;
    budgetMin?: number;
    budgetMax?: number;
    preApproval: PreApproval;
    preApprovalAmount?: number;
    lender?: string;
    timeline: Timeline;
    housing: Housing;
    beds?: number;
    areas: string[];
    motivation?: string;
    tourRequested: boolean;
    tourScheduled?: string;
    workingWithAgent: boolean;
    phoneValid: boolean;
    emailValid: boolean;
    householdSize?: number;
    sellerAddress?: string;
    contactAttempts: number;
    connected: boolean;
    unresponsive: boolean;
}

export interface Behavior {
    sessions: number;
    listingViews: number;
    savedHomes: number;
    emailOpens: number;
    replies: number;
    lastActiveAt: number;
}

export interface Provenance {
    source: string;
    detail: string;
    at: number;
    verified?: boolean;
}

export interface Contact {
    name: string;
    first: string;
    last: string;
    email: string;
    phone: string;
    preferredChannel: "call" | "text" | "email";
    timezone: string;
    language: string;
}

export interface FieldMapping {
    field: string;
    raw: string;
    normalized: string;
    rule: string;
    changed: boolean;
}

export interface DedupeResult {
    matched: boolean;
    contactId?: string;
    confidence?: number;
    since?: string;
    history?: string[];
}

export interface ExtractedEntity {
    label: string;
    value: string;
    confidence: number;
}

export interface Factor {
    id: string;
    label: string;
    weight: number;
    /** 0..1 strength for positive factors. Negative adjustments carry `penalty` instead. */
    value: number;
    points: number;
    known: boolean;
    verified: boolean;
    evidence: string;
    source: string;
    penalty?: boolean;
}

export interface Qualification {
    score: number;
    grade: Grade;
    confidence: number;
    confidenceLabel: "High" | "Medium" | "Low";
    confidenceNotes: { ok: boolean; text: string }[];
    factors: Factor[];
    summary: string;
}

export interface ScorePoint {
    t: number;
    score: number;
    confidence: number;
    label: string;
}

export interface Evidence {
    text: string;
    cite: string;
    tone: "positive" | "negative" | "neutral";
}

export interface CallScript {
    opener: string;
    talkingPoints: string[];
    objections: { q: string; a: string }[];
    close: string;
}

export interface DocShare {
    id: string;
    title: string;
    why: string;
    kind: "pdf" | "link" | "report";
}

export interface TourSuggestion {
    listingId: string;
    match: number;
    reasons: string[];
    slot: string;
}

export interface Strategy {
    headline: string;
    evidence: Evidence[];
    risks: string[];
    nextBestAction: string;
    callScript: CallScript;
    email: { subject: string; body: string };
    sms: string;
    questions: { q: string; why: string }[];
    documents: DocShare[];
    tours: TourSuggestion[];
}

export type TaskKind = "call" | "email" | "sms" | "tour" | "document" | "review" | "nurture";
export type TaskStatus = "open" | "done" | "dismissed" | "superseded";

export interface Priority {
    score: number;
    band: "P1" | "P2" | "P3" | "P4";
    urgency: number;
    quality: number;
    engagement: number;
    opportunity: number;
    reasons: string[];
}

export interface Task {
    id: string;
    key: string;
    leadId: string;
    listingId?: string;
    kind: TaskKind;
    title: string;
    detail: string;
    status: TaskStatus;
    createdAt: number;
    dueAt: number;
    assigneeId: string;
    createdBy: string;
    priority: Priority;
    prevPriority?: number;
    changedAt?: number;
    outcome?: string;
    completedAt?: number;
}

export interface LogLine {
    t: number;
    text: string;
    level: "info" | "ok" | "warn" | "error" | "agent";
}

export interface AgentRun {
    key: string;
    status: "running" | "done";
    progress: number;
    lines: LogLine[];
}

export interface ActivityEntry {
    id: string;
    t: number;
    actor: string;
    text: string;
    intent?: "primary" | "success" | "warning" | "danger";
}

export interface SignalEvent {
    id: string;
    t: number;
    signalId: string;
    text: string;
    scoreBefore: number;
    scoreAfter?: number;
}

export interface RawLead {
    source: SourceId;
    receivedAt: number;
    channel: string;
    format: "json" | "email" | "form" | "csv";
    payload: string;
}

/** The hidden "ground truth" a simulated lead is generated from. Agents never read this directly. */
export interface LeadProfile {
    key: string;
    featured?: string;
    blurb?: string;
    source: SourceId;
    listingId?: string;
    first: string;
    last: string;
    rawName: string;
    rawEmail: string;
    rawPhone: string;
    message: string;
    stated: Partial<Facts>;
    statedNotes: Partial<Record<keyof Facts, string>>;
    enriched: Partial<Facts>;
    enrichedNotes: Partial<Record<keyof Facts, string>>;
    behavior: Omit<Behavior, "lastActiveAt">;
    existing?: { since: string; history: string[] };
    formExtras?: Record<string, string>;
    story: string[];
    preferredChannel: Contact["preferredChannel"];
    language?: string;
    translation?: string;
}

export interface Lead {
    id: string;
    profile: LeadProfile;
    raw: RawLead;
    receivedAt: number;
    stages: Record<AgentStageId, StageStatus>;
    runs: Record<string, AgentRun>;
    contact?: Contact;
    extracted: ExtractedEntity[];
    mappings: FieldMapping[];
    dedupe?: DedupeResult;
    facts: Facts;
    provenance: Partial<Record<keyof Facts | "behavior", Provenance>>;
    behavior: Behavior;
    qualification?: Qualification;
    scoreHistory: ScorePoint[];
    strategy?: Strategy;
    assigneeId?: string;
    routingReason?: string;
    status: LeadStatus;
    signals: SignalEvent[];
    activity: ActivityEntry[];
    /** Simulated lead actions, including the user-edited draft. */
    actionHistory?: { id: string; kind: "email" | "sms" | "invite"; recipient: string; subject: string; body: string; listingId?: string; startsAt?: string; createdAt: number }[];
    /** Signal ids already used from the lead's story. */
    storyUsed: string[];
    /** Set while a signal is being processed. */
    pendingSignal?: string;
    /** Run key of the most recent re-evaluation, shown in the signal console. */
    signalRunKey?: string;
    /** Flash marker for UI animation when the score changes. */
    scoreChangedAt?: number;
}

export interface Listing {
    id: string;
    address: string;
    city: string;
    zip: string;
    price: number;
    beds: number;
    baths: number;
    sqft: number;
    type: "Single-family" | "Condo" | "Townhome";
    status: "Active" | "Coming soon" | "Price reduced";
    dom: number;
    yearBuilt: number;
    hoa?: number;
    mls: string;
    listingAgentId: string;
    features: string[];
    hue: number;
    area: string;
}

export interface BrokerAgent {
    id: string;
    name: string;
    initials: string;
    title: string;
    areas: string[];
    specialties: string[];
    capacity: number;
    color: string;
}

export interface Settings {
    agentSpeed: "realistic" | "fast";
    simulateResponses: boolean;
    autoStream: boolean;
    autoRoute: boolean;
}

export type View =
    | { name: "command" }
    | { name: "leads" }
    | { name: "funnel" }
    | { name: "lead"; id: string; stage?: AgentStageId }
    | { name: "properties"; id?: string }
    | { name: "actions"; taskId?: string };
