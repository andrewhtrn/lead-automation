import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { produce } from "immer";
import type { AgentStageId, Lead, Settings, SourceId, Task, View } from "../types";
import { featuredByKey, randomProfile } from "../data/scenarios";
import { agentById, listingById, SOURCES } from "../data/directory";
import {
    completeEnrich,
    completeIntake,
    completeNormalize,
    completePlan,
    completeQualify,
    completeStrategy,
    createLead,
    enrichScript,
    intakeScript,
    isProcessing,
    log,
    normalizeScript,
    planScript,
    qualifyScript,
    reevalScript,
    strategyScript,
    type ScriptStep,
} from "../engine/pipeline";
import { applyCallOutcome, applySignal, deriveStatus, finishTask, reevaluate, scheduleTour } from "../engine/actions";
import { buildSeed } from "../engine/seed";
import { computePriority } from "../engine/tasks";
import { CALL_OUTCOMES, nextStorySignal, signalById } from "../engine/signals";
import { toast } from "../lib/toaster";
import { uid } from "../lib/format";

export interface AppState {
    leads: Lead[];
    tasks: Task[];
    settings: Settings;
    view: View;
    dark: boolean;
    now: number;
    usedFeatured: string[];
    /** Task currently open in the execute dialog. */
    actionTaskId: string | null;
}

type Recipe = (s: AppState) => void;
const reducer = (s: AppState, r: Recipe) => produce(s, r);

const DEFAULT_SETTINGS: Settings = { agentSpeed: "realistic", simulateResponses: true, autoStream: false, autoRoute: true };

function initialState(): AppState {
    const dark = (() => {
        try {
            const saved = localStorage.getItem("lead-theme");
            return saved ? saved === "dark" : true;
        } catch {
            return true;
        }
    })();
    const { leads, tasks } = buildSeed(DEFAULT_SETTINGS);
    return { leads, tasks, settings: DEFAULT_SETTINGS, view: { name: "leads" }, dark, now: Date.now(), usedFeatured: [], actionTaskId: null };
}

export interface ExecutePayload {
    outcome?: string;
    listingId?: string;
    slot?: string;
    body?: string;
    subject?: string;
    note?: string;
}

function useStoreValue() {
    const [state, dispatch] = useReducer(reducer, undefined, initialState);
    const stateRef = useRef(state);
    stateRef.current = state;
    const running = useRef(new Set<string>());
    const timers = useRef<number[]>([]);
    const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
    const factor = () => (stateRef.current.settings.agentSpeed === "fast" ? 0.35 : 1);

    const update = useCallback((r: Recipe) => dispatch(r), []);
    const updateLead = useCallback(
        (id: string, r: (lead: Lead, s: AppState) => void) =>
            dispatch(s => {
                const l = s.leads.find(x => x.id === id);
                if (l) r(l, s);
            }),
        [],
    );
    const navigate = useCallback((view: View) => {
        dispatch(s => {
            s.view = view;
        });
        window.scrollTo({ top: 0 });
    }, []);

    /** Streams a scripted agent log into `lead.runs[key]`, then applies `onDone`. */
    const runAgent = useCallback(
        (leadId: string, key: string, steps: ScriptStep[], onDone: (lead: Lead, s: AppState) => void, after?: () => void) => {
            const k = `${leadId}:${key}`;
            if (running.current.has(k) || !steps.length) return;
            running.current.add(k);
            updateLead(leadId, l => {
                l.runs[key] = { key, status: "running", progress: 0, lines: [] };
            });
            let i = 0;
            const tick = () => {
                if (!running.current.has(k)) return;
                const step = steps[i];
                const idx = i;
                updateLead(leadId, l => {
                    const r = l.runs[key];
                    if (!r) return;
                    r.lines.push({ t: Date.now(), text: step.text, level: step.level ?? "info" });
                    r.progress = (idx + 1) / steps.length;
                });
                i++;
                if (i < steps.length) later(tick, steps[i].ms * factor());
                else
                    later(() => {
                        if (!running.current.has(k)) return;
                        updateLead(leadId, (l, s) => {
                            if (l.runs[key]) l.runs[key].status = "done";
                            onDone(l, s);
                        });
                        running.current.delete(k);
                        after?.();
                    }, 380 * factor());
            };
            later(tick, steps[0].ms * factor());
        },
        [updateLead],
    );

    // --- Orchestrator: start each agent as soon as its stage becomes "running" -----------------
    useEffect(() => {
        for (const lead of state.leads) {
            const start = (stage: AgentStageId, script: () => ScriptStep[], done: (l: Lead, s: AppState) => void, after?: () => void) => {
                if (lead.stages[stage] === "running" && !lead.runs[stage]) runAgent(lead.id, stage, script(), done, after);
            };
            start("intake", () => intakeScript(lead), l => completeIntake(l));
            start("normalize", () => normalizeScript(lead), l => completeNormalize(l));
            start("enrich", () => enrichScript(lead), l => completeEnrich(l));
            start("qualify", () => qualifyScript(lead), l => completeQualify(l));
            start("strategy", () => strategyScript(lead, state.leads), (l, s) => completeStrategy(l, s.leads, s.settings.autoRoute));
            start(
                "plan",
                () => planScript(lead),
                (l, s) => completePlan(l, s.tasks),
                () => {
                    const l = stateRef.current.leads.find(x => x.id === lead.id);
                    const q = l?.qualification;
                    if (!l || !q) return;
                    const n = stateRef.current.tasks.filter(t => t.leadId === l.id && t.status === "open").length;
                    toast({
                        intent: q.grade === "Hot" ? "danger" : q.grade === "Warm" ? "warning" : "primary",
                        icon: "endorsed",
                        message: `${l.contact?.name}: ${q.grade} (${q.score}) · ${n} tasks → ${agentById(l.assigneeId)?.name}`,
                        action: stateRef.current.view.name === "lead" && stateRef.current.view.id === l.id ? undefined : { text: "Open", onClick: () => navigate({ name: "lead", id: l.id }) },
                    });
                },
            );
        }
    }, [state.leads, runAgent, navigate]);

    // --- Clock: urgency rises as SLAs approach, so re-prioritize open tasks periodically ---------
    useEffect(() => {
        const t = window.setInterval(
            () =>
                dispatch(s => {
                    s.now = Date.now();
                    for (const task of s.tasks) {
                        if (task.status !== "open") continue;
                        const lead = s.leads.find(l => l.id === task.leadId);
                        if (lead?.qualification) task.priority = computePriority(task, lead, s.now);
                    }
                }),
            15_000,
        );
        return () => clearInterval(t);
    }, []);

    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    // --- New leads ---------------------------------------------------------------------------
    const simulateLead = useCallback(
        (opts: { featured?: string; source?: SourceId; open?: boolean } = {}) => {
            const s = stateRef.current;
            const profile = opts.featured ? featuredByKey(opts.featured)! : randomProfile(opts.source);
            const lead = createLead(profile, Date.now());
            dispatch(d => {
                d.leads.unshift(lead);
                if (opts.featured && !d.usedFeatured.includes(opts.featured)) d.usedFeatured.push(opts.featured);
                if (opts.open) d.view = { name: "lead", id: lead.id };
            });
            if (opts.open) window.scrollTo({ top: 0 });
            toast({
                icon: SOURCES[profile.source].icon,
                intent: "primary",
                message: `New ${SOURCES[profile.source].label} lead: ${profile.first} ${profile.last}. Agents processing…`,
                action: opts.open ? undefined : { text: "Watch", onClick: () => navigate({ name: "lead", id: lead.id }) },
            });
            void s;
            return lead.id;
        },
        [navigate],
    );

    // Live stream mode
    useEffect(() => {
        if (!state.settings.autoStream) return;
        const ms = state.settings.agentSpeed === "fast" ? 12_000 : 24_000;
        const t = window.setInterval(() => simulateLead({}), ms);
        const first = window.setTimeout(() => simulateLead({}), 1200);
        return () => {
            clearInterval(t);
            clearTimeout(first);
        };
    }, [state.settings.autoStream, state.settings.agentSpeed, simulateLead]);

    // --- Re-evaluation with an animated agent run ---------------------------------------------
    const reprocess = useCallback(
        (leadId: string, label: string, patch: (l: Lead, now: number) => void, opts: { signalId?: string; quiet?: boolean } = {}) => {
            const s = stateRef.current;
            const cur = s.leads.find(l => l.id === leadId);
            if (!cur?.qualification) return false;
            if (cur.pendingSignal) {
                // Another re-evaluation is mid-flight; try again shortly.
                later(() => reprocessRef.current(leadId, label, patch, opts), 1500);
                return true;
            }
            const now = Date.now();
            const dry = structuredClone(cur);
            const dryTasks = structuredClone(s.tasks);
            patch(dry, now);
            reevaluate(dry, dryTasks, now, label);
            const key = `sig-${now}`;
            updateLead(leadId, l => {
                l.pendingSignal = label;
                l.signalRunKey = key;
            });
            runAgent(
                leadId,
                key,
                reevalScript(cur, dry, label),
                (l, st) => {
                    const t = Date.now();
                    patch(l, t);
                    const r = reevaluate(l, st.tasks, t, label);
                    if (opts.signalId && l.signals[0]) l.signals[0].scoreAfter = r.after;
                    l.pendingSignal = undefined;
                },
                () => {
                    const l = stateRef.current.leads.find(x => x.id === leadId);
                    const h = l?.scoreHistory ?? [];
                    if (!l || h.length < 2 || opts.quiet) return;
                    const a = h[h.length - 2].score;
                    const b = h[h.length - 1].score;
                    toast({
                        intent: b > a ? "success" : b < a ? "warning" : "none",
                        icon: b > a ? "trending-up" : b < a ? "trending-down" : "refresh",
                        message: `${l.contact?.name}: score ${a} → ${b}${l.qualification!.grade !== gradeFor(a) ? ` (${l.qualification!.grade})` : ""} · tasks re-prioritized`,
                    });
                },
            );
            return true;
        },
        [runAgent, updateLead],
    );
    const reprocessRef = useRef(reprocess);
    reprocessRef.current = reprocess;

    const sendSignal = useCallback(
        (leadId: string, signalId: string) => {
            const lead = stateRef.current.leads.find(l => l.id === leadId);
            if (!lead) return;
            const text = signalById(signalId).describe(lead);
            reprocess(leadId, text, (l, now) => applySignal(l, signalId, now), { signalId });
        },
        [reprocess],
    );

    /** Simulated lead responses after outreach (only when enabled in Automation settings). */
    const maybeRespond = useCallback(
        (leadId: string, kind: Task["kind"]) => {
            if (!stateRef.current.settings.simulateResponses) return;
            const lead = stateRef.current.leads.find(l => l.id === leadId);
            if (!lead) return;
            const next = nextStorySignal(lead);
            let sig: string | undefined;
            if (kind === "sms" && next === "sms_reply_tour") sig = next;
            else if ((kind === "email" || kind === "document") && !lead.storyUsed.includes("email_open")) sig = "email_open";
            else if (kind === "email" || kind === "sms") sig = next && next !== "went_cold" && next !== "other_agent" ? next : undefined;
            if (!sig) return;
            later(() => {
                const l = stateRef.current.leads.find(x => x.id === leadId);
                if (l && !l.storyUsed.includes(sig!)) sendSignal(leadId, sig!);
            }, (kind === "sms" ? 6500 : 5000) * factor());
        },
        [sendSignal],
    );

    const executeTask = useCallback(
        (taskId: string, p: ExecutePayload = {}) => {
            const s = stateRef.current;
            const task = s.tasks.find(t => t.id === taskId);
            const lead = task && s.leads.find(l => l.id === task.leadId);
            if (!task || !lead || task.status !== "open") return;
            const name = lead.contact?.first ?? "lead";
            const markDone = (outcome: string) =>
                update(d => {
                    const t = d.tasks.find(x => x.id === taskId);
                    if (t) finishTask(t, outcome, Date.now());
                });

            if (task.kind === "call" && p.outcome) {
                const o = CALL_OUTCOMES.find(x => x.id === p.outcome)!;
                markDone(`${o.label}${p.note ? ` · ${p.note}` : ""}`);
                reprocess(lead.id, `Call outcome: ${o.label}`, (l, now) => {
                    applyCallOutcome(l, o.id, now);
                });
                toast({ icon: "phone", message: `Call logged for ${name}. Agents re-qualifying…` });
                return;
            }
            if (task.kind === "tour" && p.listingId && p.slot) {
                markDone(`Booked ${p.slot}`);
                reprocess(lead.id, "Showing scheduled", (l, now) => scheduleTour(l, p.listingId!, p.slot!, now));
                toast({ intent: "success", icon: "calendar", message: `Showing booked for ${name} · ${p.slot}. Confirmation queued.` });
                return;
            }
            const verbs: Record<Task["kind"], string> = {
                email: `Email sent to ${name}`,
                sms: `Text sent to ${name}`,
                document: `Documents shared with ${name}`,
                review: "Review completed",
                nurture: `${name} enrolled in drip campaign`,
                call: "Call logged",
                tour: "Showing scheduled",
            };
            markDone(verbs[task.kind]);
            updateLead(lead.id, (l, d) => {
                if (task.kind === "nurture") l.status = deriveStatus(l) === "new" ? "nurture" : deriveStatus(l);
                log(l, "You", `${verbs[task.kind]}: ${task.title}`, "success");
                if (p.body && (task.kind === "email" || task.kind === "sms")) {
                    (l.actionHistory ??= []).unshift({ id: uid("action"), kind: task.kind, recipient: task.kind === "email" ? l.contact?.email ?? "" : l.contact?.phone ?? "", subject: p.subject ?? "Text message", body: p.body, createdAt: Date.now() });
                }
                void d;
            });
            toast({ intent: "success", icon: "tick", message: `${verbs[task.kind]}${task.kind === "email" || task.kind === "sms" ? " (simulated)" : ""}` });
            maybeRespond(lead.id, task.kind);
        },
        [update, updateLead, reprocess, maybeRespond],
    );

    const recordShowingInvite = useCallback((leadId: string, draft: { kind: "email" | "invite"; recipient: string; subject: string; body: string; listingId?: string; startsAt?: string }) => {
        const lead = stateRef.current.leads.find(l => l.id === leadId);
        if (!lead || lead.pendingSignal || isProcessing(lead) || !draft.recipient.trim() || !draft.subject.trim() || !draft.body.trim()) return false;
        if (draft.kind === "invite") {
            if (!draft.listingId || !listingById(draft.listingId) || !draft.startsAt || Number.isNaN(new Date(draft.startsAt).getTime())) return false;
            const slot = new Date(draft.startsAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
            const listingId = draft.listingId;
            reprocess(leadId, "Showing invitation recorded", (l, now) => {
                scheduleTour(l, listingId, slot, now);
                log(l, "You", `Simulated invite to ${draft.recipient}: ${draft.subject}`, "success", now);
            });
        } else {
            updateLead(leadId, l => log(l, "You", `Simulated email to ${draft.recipient}: ${draft.subject}`, "success"));
        }
        updateLead(leadId, l => {
            (l.actionHistory ??= []).unshift({ ...draft, id: uid("action"), createdAt: Date.now() });
        });
        toast({ icon: "tick", intent: "success", message: draft.kind === "email" ? "Email recorded (simulated; nothing sent)." : "Showing invite recorded (simulated; nothing sent)." });
        return true;
    }, [reprocess, updateLead]);

    const actions = useMemo(
        () => ({
            update,
            updateLead,
            navigate,
            simulateLead,
            sendSignal,
            executeTask,
            recordShowingInvite,
            openLeadAction: (leadId: string, kind: "call" | "email" | "sms" | "document") => {
                const s = stateRef.current;
                const l = s.leads.find(x => x.id === leadId);
                if (!l?.strategy || !l.contact || isProcessing(l) || l.pendingSignal) return;
                const existing = s.tasks.filter(t => t.leadId === leadId && t.kind === kind && t.status === "open").sort((a, b) => b.priority.score - a.priority.score)[0];
                if (existing) { update(d => { d.actionTaskId = existing.id; }); return; }
                const now = Date.now();
                const label = { call: "Call", email: "Email", sms: "Text", document: "Share documents with" }[kind];
                const t: Task = { id: uid("task"), key: `manual-${uid("action")}`, leadId, listingId: l.profile.listingId, kind, title: `${label} ${l.contact.first}`, detail: "Action started from the lead profile", status: "open", createdAt: now, dueAt: now + 60 * 60 * 1000, assigneeId: l.assigneeId ?? "skim", createdBy: "You", priority: { score: 0, band: "P4", urgency: 0, quality: 0, engagement: 0, opportunity: 0, reasons: [] } };
                t.priority = computePriority(t, l, now);
                update(d => { d.tasks.push(t); d.actionTaskId = t.id; });
            },
            openAction: (taskId: string | null) =>
                update(s => {
                    if (taskId === null && s.actionTaskId) {
                        const t = s.tasks.find(x => x.id === s.actionTaskId);
                        if (t?.key.startsWith("manual-") && t.status === "open") s.tasks = s.tasks.filter(x => x.id !== t.id);
                    }
                    s.actionTaskId = taskId;
                }),
            dismissTask: (taskId: string) =>
                update(s => {
                    const t = s.tasks.find(x => x.id === taskId);
                    if (!t) return;
                    finishTask(t, "Dismissed by user", Date.now(), "dismissed");
                    const l = s.leads.find(x => x.id === t.leadId);
                    if (l) log(l, "You", `Dismissed: ${t.title}`, "warning");
                }),
            reassignTask: (taskId: string, agentId: string) =>
                update(s => {
                    const t = s.tasks.find(x => x.id === taskId);
                    if (t) t.assigneeId = agentId;
                }),
            reassignLead: (leadId: string, agentId: string) =>
                update(s => {
                    const l = s.leads.find(x => x.id === leadId);
                    if (!l) return;
                    l.assigneeId = agentId;
                    l.routingReason = `${agentById(agentId)!.name}: manually assigned`;
                    s.tasks.forEach(t => {
                        if (t.leadId === leadId && t.status === "open") t.assigneeId = agentId;
                    });
                    log(l, "You", `Reassigned to ${agentById(agentId)!.name}`, "primary");
                }),
            disqualifyLead: (leadId: string) =>
                update(s => {
                    const l = s.leads.find(x => x.id === leadId);
                    if (!l) return;
                    l.status = "disqualified";
                    s.tasks.forEach(t => {
                        if (t.leadId === leadId && t.status === "open") finishTask(t, "Lead disqualified", Date.now(), "superseded");
                    });
                    log(l, "You", "Disqualified lead; open tasks closed", "danger");
                }),
            setDark: (dark: boolean) => {
                try {
                    localStorage.setItem("lead-theme", dark ? "dark" : "light");
                } catch {
                    /* storage unavailable */
                }
                update(s => {
                    s.dark = dark;
                });
            },
            updateSettings: (p: Partial<Settings>) =>
                update(s => {
                    Object.assign(s.settings, p);
                }),
            resetDemo: () => {
                running.current.clear();
                timers.current.forEach(clearTimeout);
                timers.current = [];
                const fresh = initialState();
                update(s => {
                    s.leads = fresh.leads;
                    s.tasks = fresh.tasks;
                    s.usedFeatured = [];
                    s.actionTaskId = null;
                    s.settings.autoStream = false;
                    s.view = { name: "command" };
                });
                toast({ icon: "reset", message: "Demo data reset" });
            },
        }),
        [update, updateLead, navigate, simulateLead, sendSignal, executeTask, recordShowingInvite],
    );

    return { state, actions };
}

const gradeFor = (score: number) => (score >= 75 ? "Hot" : score >= 55 ? "Warm" : score >= 35 ? "Nurture" : "Cold");

type Store = ReturnType<typeof useStoreValue>;
export type StoreActions = Store["actions"];
const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
    const store = useStoreValue();
    return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
    const s = useContext(StoreContext);
    if (!s) throw new Error("useStore outside provider");
    return s;
}

export function useLead(id: string) {
    const { state } = useStore();
    return state.leads.find(l => l.id === id);
}
