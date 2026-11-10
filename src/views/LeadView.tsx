import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Icon, Menu, MenuDivider, MenuItem, NonIdealState, Popover, Tag, Tooltip } from "@blueprintjs/core";
import { useLead, useStore } from "../state/store";
import { currentStage, displayName, isProcessing, STAGES } from "../engine/pipeline";
import { nextStorySignal, SIGNALS, signalById } from "../engine/signals";
import { AGENTS, agentById, listingById, SOURCES } from "../data/directory";
import { fmtDuration, timeAgo, usdShort } from "../lib/format";
import { AgentConsole } from "../components/common";
import { Panel } from "../components/Panel";
import { AgentFlow, type FlowNodeState } from "../components/AgentFlow";
import { AgentAvatar, ConfidenceMeter, GradeTag, leadIntentLabel, ScoreRing, SourceBadge, Sparkline, StatusTag } from "../components/ui";
import type { AgentStageId, Lead } from "../types";
import { EnrichStage, IntakeStage, NormalizeStage, PlanStage, QualifyStage, StrategyStage } from "./stages/Stages";

const PANELS: Record<AgentStageId, (p: { lead: Lead }) => ReactNode> = {
    intake: IntakeStage,
    normalize: NormalizeStage,
    enrich: EnrichStage,
    qualify: QualifyStage,
    strategy: StrategyStage,
    plan: PlanStage,
};

export function LeadView({ id, stage }: { id: string; stage?: AgentStageId }) {
    const lead = useLead(id);
    const { state, actions } = useStore();
    const processing = lead ? isProcessing(lead) : false;
    const [follow, setFollow] = useState(processing && !stage);
    const [selected, setSelected] = useState<AgentStageId>(() => stage ?? (lead && processing ? currentStage(lead) : "qualify"));
    const wasProcessing = useRef(processing);

    // Follow the pipeline: the stepper tracks whichever agent is currently working.
    useEffect(() => {
        if (!lead) return;
        if (follow && processing) setSelected(currentStage(lead));
        if (wasProcessing.current && !processing && follow) {
            const t = setTimeout(() => setSelected("qualify"), 900);
            wasProcessing.current = false;
            return () => clearTimeout(t);
        }
        wasProcessing.current = processing;
    }, [lead, follow, processing]);

    useEffect(() => {
        if (stage) {
            setSelected(stage);
            setFollow(false);
        }
    }, [stage]);

    if (!lead) return <NonIdealState icon="search" title="Lead not found" action={<Button text="Back to inbox" onClick={() => actions.navigate({ name: "leads" })} />} />;

    const q = lead.qualification;
    const l = listingById(lead.profile.listingId);
    const src = SOURCES[lead.raw.source];
    const Body = PANELS[selected];
    const states = Object.fromEntries(STAGES.map(s => [s.id, lead.stages[s.id]])) as Record<AgentStageId, FlowNodeState>;
    const openTasks = state.tasks.filter(t => t.leadId === lead.id && t.status === "open");
    const firstTouch = state.tasks
        .filter(t => t.leadId === lead.id && t.status === "done" && ["call", "sms", "email"].includes(t.kind))
        .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0))[0];
    const stl = firstTouch?.completedAt ? firstTouch.completedAt - lead.receivedAt : state.now - lead.receivedAt;

    const sub: Partial<Record<AgentStageId, string>> = {};
    if (lead.stages.intake === "complete") sub.intake = `${lead.extracted.length} entities`;
    if (lead.stages.normalize === "complete") sub.normalize = lead.dedupe?.matched ? "Merged duplicate" : `${lead.mappings.filter(m => m.changed).length} fields fixed`;
    if (lead.stages.enrich === "complete") sub.enrich = `${Object.keys(lead.provenance).length} signals`;
    if (q && lead.stages.qualify === "complete") sub.qualify = `${q.score} · ${q.grade} · ${q.confidenceLabel} conf.`;
    if (lead.strategy && lead.stages.strategy === "complete") sub.strategy = `${agentById(lead.assigneeId)?.name.split(" ")[0]} · ${lead.strategy.tours.length} tours`;
    if (lead.stages.plan === "complete") sub.plan = `${openTasks.length} open tasks`;

    return (
        <div className="page page-lead">
            <div className="lead-hero" data-tour="lead-hero">
                <div className="lead-hero-main">
                    <div className="page-eyebrow">
                        <button className="link-btn" onClick={() => actions.navigate({ name: "leads" })}>
                            Lead inbox
                        </button>{" "}
                        / {lead.id}
                    </div>
                    <h1 className="page-title">{displayName(lead)}</h1>
                    <div className="tx-tags">
                        <SourceBadge source={lead.raw.source} />
                        <Tag minimal icon="person">
                            {leadIntentLabel(lead)}
                        </Tag>
                        {l && (
                            <Tag minimal icon="home" interactive onClick={() => actions.navigate({ name: "properties", id: l.id })}>
                                {l.address} · {usdShort(l.price)}
                            </Tag>
                        )}
                        <Tag minimal icon="time">
                            Received {timeAgo(lead.receivedAt, state.now)} via {src.channel}
                        </Tag>
                        <StatusTag status={lead.status} />
                        <Tooltip content={firstTouch ? "Time from inquiry to first human outreach" : "Clock is running until first outreach"} compact>
                            <Tag minimal intent={firstTouch ? "success" : stl > 5 * 60_000 && q?.grade === "Hot" ? "danger" : "none"} icon="stopwatch" className={!firstTouch && !processing ? "pulse-soft" : ""}>
                                Speed to lead: {fmtDuration(stl)}
                                {firstTouch ? "" : " and counting"}
                            </Tag>
                        </Tooltip>
                    </div>
                    {lead.strategy && <div className="lead-headline">{lead.strategy.headline}</div>}
                </div>
                <div className="lead-hero-side">
                    <div className="lead-score-block" data-tour="lead-score">
                        <ScoreRing score={q?.score} grade={q?.grade} size={92} pending={processing || !!lead.pendingSignal} />
                        <div className="lead-score-meta">
                            <GradeTag grade={q?.grade} />
                            {q && <ConfidenceMeter value={q.confidence} label={q.confidenceLabel} />}
                            <Sparkline points={lead.scoreHistory} width={110} height={24} />
                        </div>
                    </div>
                    <div className="page-actions">
                        <Popover
                            placement="bottom-end"
                            content={
                                <Menu>
                                    <MenuDivider title="Assign to" />
                                    {AGENTS.map(a => (
                                        <MenuItem key={a.id} text={a.name} label={a.title} icon={lead.assigneeId === a.id ? "tick" : "blank"} onClick={() => actions.reassignLead(lead.id, a.id)} />
                                    ))}
                                </Menu>
                            }
                        >
                            <Button icon={lead.assigneeId ? <AgentAvatar id={lead.assigneeId} size={18} /> : "person"} text={agentById(lead.assigneeId)?.name ?? "Unassigned"} endIcon="caret-down" disabled={processing} />
                        </Popover>
                        <Popover
                            placement="bottom-end"
                            content={
                                <Menu>
                                    <MenuItem icon="disable" intent="danger" text="Disqualify lead" disabled={lead.status === "disqualified"} onClick={() => actions.disqualifyLead(lead.id)} />
                                </Menu>
                            }
                        >
                            <Button icon="more" aria-label="More actions" />
                        </Popover>
                    </div>
                </div>
            </div>

            <div className="flow-wrap">
                <AgentFlow
                    states={states}
                    sub={sub}
                    selected={selected}
                    tour="lead-flow"
                    onSelect={s => {
                        setSelected(s);
                        setFollow(false);
                    }}
                />
                {processing && (
                    <div className="flow-follow">
                        <Button size="small" variant="minimal" icon={follow ? "pin" : "unpin"} text={follow ? "Following agents" : "Follow agents"} active={follow} onClick={() => setFollow(!follow)} />
                    </div>
                )}
            </div>

            <div className="lead-grid">
                <section className="stage-panel" key={selected}>
                    <Body lead={lead} />
                </section>
                <aside className="lead-rail">
                    <SignalsPanel lead={lead} />
                    <Panel id="lead-activity" title="Activity" icon="history" count={lead.activity.length}>
                        <div className="activity-feed">
                            {lead.activity.map(a => (
                                <div key={a.id} className="activity-item">
                                    <span className={`dot dot-${a.intent ?? "none"}`} />
                                    <div>
                                        <div>
                                            <b>{a.actor}</b> {a.text}
                                        </div>
                                        <div className="cell-muted">{timeAgo(a.t, state.now)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Panel>
                </aside>
            </div>
        </div>
    );
}

function SignalsPanel({ lead }: { lead: Lead }) {
    const { actions } = useStore();
    const ready = !!lead.qualification && !isProcessing(lead);
    const busy = !!lead.pendingSignal;
    const next = nextStorySignal(lead);
    const nextDef = next ? signalById(next) : undefined;
    const run = lead.signalRunKey ? lead.runs[lead.signalRunKey] : undefined;
    return (
        <Panel id="signals" title="New information" icon="feed" subtitle="Simulate what happens next" tour="signals">
            <div className="panel-body-padded signals-body">
                {!ready ? (
                    <div className="cell-muted">Available once the agents finish qualifying this lead.</div>
                ) : (
                    <>
                        <p className="cell-muted signals-intro">Inject a real-world event. The Qualification, Strategy and Task Planner agents re-run, and scores and priorities update live.</p>
                        {nextDef && (
                            <Button
                                fill
                                large
                                intent="primary"
                                icon={nextDef.icon}
                                className="signal-next"
                                disabled={busy}
                                onClick={() => actions.sendSignal(lead.id, nextDef.id)}
                                data-tour="signal-next"
                                alignText="left"
                                text={
                                    <span>
                                        <span className="signal-next-k">Most likely next</span>
                                        {nextDef.label}
                                    </span>
                                }
                            />
                        )}
                        <div className="signal-grid">
                            {SIGNALS.filter(s => s.id !== next).map(s => (
                                <Tooltip key={s.id} content={s.describe(lead)} compact placement="left">
                                    <Button size="small" icon={s.icon} text={s.label} disabled={busy} intent={s.tone === "negative" ? "warning" : "none"} variant="outlined" fill alignText="left" onClick={() => actions.sendSignal(lead.id, s.id)} />
                                </Tooltip>
                            ))}
                        </div>
                    </>
                )}
                {run && <AgentConsole run={run} title="Re-evaluation" compact maxHeight={200} />}
                {lead.signals.length > 0 && (
                    <div className="signal-history">
                        {lead.signals.map(s => {
                            const d = s.scoreAfter !== undefined ? s.scoreAfter - s.scoreBefore : undefined;
                            return (
                                <div key={s.id} className="signal-item">
                                    <Icon icon={signalById(s.signalId).icon} size={12} />
                                    <span className="signal-text">{s.text}</span>
                                    {d !== undefined ? <span className={d >= 0 ? "delta-up" : "delta-down"}>{d >= 0 ? `+${d}` : d}</span> : <Icon icon="refresh" size={11} className="spin" />}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </Panel>
    );
}
