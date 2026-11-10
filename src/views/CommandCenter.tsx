import { useMemo } from "react";
import { Button, Icon, NonIdealState, Popover, Tag } from "@blueprintjs/core";
import { useStore } from "../state/store";
import { displayName, isProcessing, STAGES } from "../engine/pipeline";
import { estimatedGci } from "../engine/tasks";
import { AGENTS, SOURCE_LIST } from "../data/directory";
import { fmtDuration, HOUR, timeAgo, usdShort } from "../lib/format";
import { Kpi } from "../components/common";
import { PageHeader, Panel } from "../components/Panel";
import { AgentFlow, type FlowNodeState } from "../components/AgentFlow";
import { SimulateMenu } from "../components/SimulateMenu";
import { TaskRow } from "../components/TaskRow";
import { AgentAvatar, Bar, ConfidenceMeter, GradeTag, SourceBadge, StatusTag } from "../components/ui";
import type { AgentStageId } from "../types";

export function CommandCenter() {
    const { state, actions } = useStore();
    const { leads, tasks, now } = state;

    const stats = useMemo(() => {
        const day = leads.filter(l => now - l.receivedAt < 24 * HOUR);
        const hot = leads.filter(l => l.qualification?.grade === "Hot" && l.status !== "disqualified");
        const open = tasks.filter(t => t.status === "open");
        const p1 = open.filter(t => t.priority.band === "P1");
        const overdue = open.filter(t => t.dueAt < now);
        const firstTouch = leads
            .map(l => {
                const t = tasks.filter(x => x.leadId === l.id && x.status === "done" && (x.kind === "call" || x.kind === "sms" || x.kind === "email")).sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0))[0];
                return t?.completedAt ? t.completedAt - l.receivedAt : undefined;
            })
            .filter((x): x is number => x !== undefined)
            .sort((a, b) => a - b);
        const median = firstTouch.length ? firstTouch[Math.floor(firstTouch.length / 2)] : undefined;
        const gci = leads.filter(l => l.qualification && (l.qualification.grade === "Hot" || l.qualification.grade === "Warm") && l.status !== "disqualified").reduce((s, l) => s + estimatedGci(l), 0);
        return { day, hot, open, p1, overdue, median, gci };
    }, [leads, tasks, now]);

    const inStage = (id: AgentStageId) => leads.filter(l => l.stages[id] === "running");
    const states = Object.fromEntries(STAGES.map(s => [s.id, inStage(s.id).length ? "running" : "idle"])) as Record<AgentStageId, FlowNodeState>;
    const anyRunning = leads.some(isProcessing);
    const queue = useMemo(() => [...stats.open].sort((a, b) => b.priority.score - a.priority.score).slice(0, 7), [stats.open]);
    const recent = leads.slice(0, 8);
    const activity = useMemo(
        () =>
            leads
                .flatMap(l => l.activity.map(a => ({ l, a })))
                .sort((x, y) => y.a.t - x.a.t)
                .slice(0, 18),
        [leads],
    );
    const bySource = SOURCE_LIST.map(s => ({ s, n: leads.filter(l => l.raw.source === s.id).length, hot: leads.filter(l => l.raw.source === s.id && (l.qualification?.grade === "Hot" || l.qualification?.grade === "Warm")).length }));
    const maxSrc = Math.max(1, ...bySource.map(x => x.n));
    const load = AGENTS.map(a => ({ a, n: leads.filter(l => l.assigneeId === a.id && l.status !== "disqualified").length, t: stats.open.filter(t => t.assigneeId === a.id).length }));

    return (
        <div className="page">
            <PageHeader
                eyebrow="Brokerage-wide · live"
                title="Command Center"
                sub="Every inbound lead, from any source, is captured, normalized, enriched, qualified and turned into prioritized work by six AI agents. Humans approve every outbound touch."
                actions={
                    <Popover content={<SimulateMenu />} placement="bottom-end">
                        <Button intent="primary" icon="new-person" endIcon="caret-down" text="Simulate incoming lead" large />
                    </Popover>
                }
            />

            <div className="kpi-row kpi-row-5" data-tour="kpis">
                <Kpi icon="inbox" intent="primary" label="Leads (24h)" value={stats.day.length} sub={`${leads.length} in pipeline`} onClick={() => actions.navigate({ name: "leads" })} />
                <Kpi icon="flame" intent="danger" label="Hot leads" value={stats.hot.length} sub="score ≥ 75" onClick={() => actions.navigate({ name: "leads" })} />
                <Kpi icon="stopwatch" intent="success" label="Median speed to lead" value={stats.median !== undefined ? fmtDuration(stats.median) : "–"} sub="Industry avg. ≈ 15h" />
                <Kpi icon="take-action" intent="warning" label="P1 tasks open" value={stats.p1.length} sub={`${stats.open.length} open · ${stats.overdue.length} overdue`} onClick={() => actions.navigate({ name: "actions" })} />
                <Kpi icon="dollar" intent="primary" label="Hot + warm GCI (est.)" value={usdShort(stats.gci)} sub="2.8% blended commission" />
            </div>

            <Panel
                id="cc-pipeline"
                title="Live agent pipeline"
                icon="flow-linear"
                subtitle={anyRunning ? "Agents are processing leads right now" : "Idle. Simulate a lead to watch the agents work"}
                tour="live-pipeline"
                actions={anyRunning ? <Tag intent="primary" minimal round icon="predictive-analysis" className="pulse-tag">{leads.filter(isProcessing).length} in flight</Tag> : undefined}
            >
                <div className="panel-body-padded">
                    <AgentFlow
                        states={states}
                        size="large"
                        sub={Object.fromEntries(STAGES.map(s => [s.id, inStage(s.id).length ? `${inStage(s.id).length} working` : `${leads.filter(l => l.stages[s.id] === "complete").length} processed`]))}
                        below={id => (
                            <div className="af-chips">
                                {inStage(id).map(l => (
                                    <button key={l.id} className="af-chip" onClick={() => actions.navigate({ name: "lead", id: l.id })}>
                                        <SourceBadge source={l.raw.source} compact />
                                        {displayName(l)}
                                    </button>
                                ))}
                            </div>
                        )}
                    />
                </div>
            </Panel>

            <div className="dash-grid">
                <div className="dash-main">
                    <Panel
                        id="cc-queue"
                        title="Priority queue"
                        icon="take-action"
                        subtitle="Top open tasks across the brokerage, ranked by the Task Planner"
                        count={stats.open.length}
                        tour="cc-queue"
                        actions={<Button size="small" variant="minimal" endIcon="arrow-right" text="Action Center" onClick={() => actions.navigate({ name: "actions" })} />}
                    >
                        {queue.length ? (
                            <div className="trow-list">
                                {queue.map(t => (
                                    <TaskRow key={t.id} task={t} onSelect={() => actions.navigate({ name: "actions", taskId: t.id })} />
                                ))}
                            </div>
                        ) : (
                            <NonIdealState icon="endorsed" title="Queue clear" description="New tasks appear here as agents qualify leads." />
                        )}
                    </Panel>

                    <Panel id="cc-inbox" title="Latest leads" icon="inbox" count={leads.length} actions={<Button size="small" variant="minimal" endIcon="arrow-right" text="Lead inbox" onClick={() => actions.navigate({ name: "leads" })} />}>
                        <div className="lead-mini-list">
                            {recent.map(l => (
                                <button key={l.id} className={`lead-mini ${now - l.receivedAt < 60_000 ? "lead-mini-new" : ""}`} onClick={() => actions.navigate({ name: "lead", id: l.id })}>
                                    <SourceBadge source={l.raw.source} />
                                    <div className="lead-mini-text">
                                        <div className="cell-strong">{displayName(l)}</div>
                                        <div className="cell-muted">{l.strategy?.headline ?? "Agents processing…"}</div>
                                    </div>
                                    {l.qualification ? <ConfidenceMeter value={l.qualification.confidence} label={l.qualification.confidenceLabel} compact /> : null}
                                    {isProcessing(l) ? <StatusTag status="processing" /> : <GradeTag grade={l.qualification?.grade} score={l.qualification?.score} />}
                                    <span className="cell-muted lead-mini-time">{timeAgo(l.receivedAt, now)}</span>
                                </button>
                            ))}
                        </div>
                    </Panel>
                </div>

                <div className="dash-side">
                    <Panel id="cc-sources" title="Lead sources" icon="send-to-graph" subtitle="Volume · % hot/warm">
                        <div className="src-chart">
                            {bySource.map(({ s, n, hot }) => (
                                <div key={s.id} className="src-row">
                                    <span className="src-name">
                                        <SourceBadge source={s.id} />
                                    </span>
                                    <span className="src-bar">
                                        <i style={{ width: `${(n / maxSrc) * 100}%`, background: s.color }} />
                                    </span>
                                    <span className="src-n">{n}</span>
                                    <span className="cell-muted src-q">{n ? `${Math.round((hot / n) * 100)}%` : "–"}</span>
                                </div>
                            ))}
                        </div>
                    </Panel>
                    <Panel id="cc-team" title="Agent team" icon="people" subtitle="Leads routed · open tasks">
                        <div className="team-list">
                            {load.map(({ a, n, t }) => (
                                <div key={a.id} className="team-row">
                                    <AgentAvatar id={a.id} size={26} />
                                    <div className="team-text">
                                        <div className="cell-strong">{a.name}</div>
                                        <div className="cell-muted">{a.title}</div>
                                    </div>
                                    <div className="team-load">
                                        <Bar value={(n / a.capacity) * 100} intent={n / a.capacity > 0.8 ? "warning" : "primary"} width={54} />
                                        <span className="cell-muted">
                                            {n}/{a.capacity} · {t} tasks
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Panel>
                    <Panel id="cc-activity" title="Agent activity" icon="history" tour="cc-activity">
                        <div className="activity-feed">
                            {activity.map(({ l, a }) => (
                                <button key={a.id} className="activity-item activity-btn" onClick={() => actions.navigate({ name: "lead", id: l.id })}>
                                    <span className={`dot dot-${a.intent ?? "none"}`} />
                                    <div>
                                        <div>
                                            <b>{a.actor}</b> {a.text}
                                        </div>
                                        <div className="cell-muted">
                                            {displayName(l)} · {timeAgo(a.t, now)}
                                        </div>
                                    </div>
                                </button>
                            ))}
                            {!activity.length && (
                                <div className="empty-pad">
                                    <Icon icon="history" /> No activity yet
                                </div>
                            )}
                        </div>
                    </Panel>
                </div>
            </div>
        </div>
    );
}
