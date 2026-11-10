import { useMemo, useState } from "react";
import { Button, HTMLSelect, Menu, MenuItem, NonIdealState, Popover, SegmentedControl } from "@blueprintjs/core";
import { useStore } from "../state/store";
import { displayName } from "../engine/pipeline";
import { PRIORITY_WEIGHTS, TASK_KIND_META } from "../engine/tasks";
import { AGENTS, agentById, LISTINGS, listingById } from "../data/directory";
import { HOUR, timeAgo } from "../lib/format";
import { Kpi } from "../components/common";
import { PageHeader, Panel } from "../components/Panel";
import { TaskRow } from "../components/TaskRow";
import { ConfidenceMeter, GradeTag, ScoreRing, SourceBadge } from "../components/ui";
import { PriorityExplainer } from "./stages/Stages";
import type { TaskKind } from "../types";

export function ActionCenter({ taskId }: { taskId?: string }) {
    const { state, actions } = useStore();
    const { tasks, now } = state;
    const [tab, setTab] = useState<"open" | "done">("open");
    const [who, setWho] = useState("all");
    const [kind, setKind] = useState<"all" | TaskKind>("all");
    const [band, setBand] = useState("all");
    const [prop, setProp] = useState("all");
    const [sel, setSel] = useState<string | undefined>(taskId);

    const open = tasks.filter(t => t.status === "open");
    const rows = useMemo(() => {
        let r = tab === "open" ? tasks.filter(t => t.status === "open") : tasks.filter(t => t.status !== "open");
        if (who !== "all") r = r.filter(t => t.assigneeId === who);
        if (kind !== "all") r = r.filter(t => t.kind === kind);
        if (band !== "all") r = r.filter(t => t.priority.band === band);
        if (prop !== "all") r = r.filter(t => t.listingId === prop);
        return [...r].sort((a, b) => (tab === "open" ? b.priority.score - a.priority.score || a.dueAt - b.dueAt : (b.completedAt ?? 0) - (a.completedAt ?? 0)));
    }, [tasks, tab, who, kind, band, prop]);

    const selected = rows.find(t => t.id === sel) ?? (tab === "open" ? rows[0] : undefined);
    const lead = selected && state.leads.find(l => l.id === selected.leadId);
    const doneToday = tasks.filter(t => t.status === "done" && t.completedAt && now - t.completedAt < 24 * HOUR).length;

    return (
        <div className="page">
            <PageHeader
                eyebrow="Brokerage-wide"
                title="Action Center"
                sub={
                    <>
                        One master queue for every agent-generated task. Priority = <b>{PRIORITY_WEIGHTS.urgency * 100}%</b> urgency + <b>{PRIORITY_WEIGHTS.quality * 100}%</b> lead quality + <b>{PRIORITY_WEIGHTS.engagement * 100}%</b> engagement +{" "}
                        <b>{PRIORITY_WEIGHTS.opportunity * 100}%</b> conversion opportunity. It re-ranks live as SLAs tick and new information arrives.
                    </>
                }
            />
            <div className="kpi-row kpi-row-5">
                <Kpi icon="flame" intent="danger" label="P1 · act now" value={open.filter(t => t.priority.band === "P1").length} onClick={() => { setTab("open"); setBand("P1"); }} />
                <Kpi icon="trending-up" intent="warning" label="P2 · today" value={open.filter(t => t.priority.band === "P2").length} onClick={() => { setTab("open"); setBand("P2"); }} />
                <Kpi icon="time" intent="danger" label="Overdue" value={open.filter(t => t.dueAt < now).length} sub="past SLA" />
                <Kpi icon="stopwatch" intent="primary" label="Due within 1h" value={open.filter(t => t.dueAt >= now && t.dueAt - now < HOUR).length} />
                <Kpi icon="tick-circle" intent="success" label="Completed (24h)" value={doneToday} onClick={() => setTab("done")} />
            </div>
            <div className="toolbar">
                <SegmentedControl
                    value={tab}
                    onValueChange={v => {
                        setTab(v as "open" | "done");
                        setSel(undefined);
                    }}
                    options={[
                        { label: `Open (${open.length})`, value: "open" },
                        { label: `Completed (${tasks.length - open.length})`, value: "done" },
                    ]}
                />
                <HTMLSelect value={who} onChange={e => setWho(e.currentTarget.value)} options={[{ label: "All agents", value: "all" }, ...AGENTS.map(a => ({ label: a.name, value: a.id }))]} />
                <HTMLSelect value={kind} onChange={e => setKind(e.currentTarget.value as never)} options={[{ label: "All task types", value: "all" }, ...Object.entries(TASK_KIND_META).map(([k, v]) => ({ label: v.label, value: k }))]} />
                <HTMLSelect value={band} onChange={e => setBand(e.currentTarget.value)} options={[{ label: "Any priority", value: "all" }, "P1", "P2", "P3", "P4"].map(x => (typeof x === "string" ? { label: x, value: x } : x))} />
                <HTMLSelect value={prop} onChange={e => setProp(e.currentTarget.value)} options={[{ label: "All properties", value: "all" }, ...LISTINGS.map(l => ({ label: l.address, value: l.id }))]} />
                {(who !== "all" || kind !== "all" || band !== "all" || prop !== "all") && (
                    <Button
                        variant="minimal"
                        icon="filter-remove"
                        text="Clear"
                        onClick={() => {
                            setWho("all");
                            setKind("all");
                            setBand("all");
                            setProp("all");
                        }}
                    />
                )}
            </div>
            <div className="ac-split">
                <Panel id="ac-list" title={tab === "open" ? "Ranked queue" : "Completed"} icon="sort" count={rows.length} tour="ac-list">
                    {rows.length ? (
                        <div className="trow-list">
                            {rows.map((t, i) => (
                                <div key={t.id} className="ac-rank-row">
                                    {tab === "open" && <span className="ac-rank">{i + 1}</span>}
                                    <TaskRow task={t} selected={selected?.id === t.id} onSelect={() => setSel(t.id)} />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <NonIdealState icon="endorsed" title={tab === "open" ? "Nothing matches" : "Nothing completed yet"} />
                    )}
                </Panel>
                <div className="ac-detail">
                    {selected && lead ? (
                        <>
                            {selected.status === "open" ? (
                                <PriorityExplainer taskId={selected.id} onExecute={() => actions.openAction(selected.id)} />
                            ) : (
                                <div className="prio-explain">
                                    <div className="enrich-h">Completed task</div>
                                    <div className="cell-strong">{selected.title}</div>
                                    <p className="cell-muted">
                                        {selected.outcome} · {timeAgo(selected.completedAt ?? now, now)}
                                    </p>
                                </div>
                            )}
                            <div className="ac-lead">
                                <div className="ac-lead-head">
                                    <ScoreRing score={lead.qualification?.score} grade={lead.qualification?.grade} size={52} stroke={5} label={false} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className="cell-strong">
                                            {displayName(lead)} <SourceBadge source={lead.raw.source} compact />
                                        </div>
                                        <div className="cell-muted">{listingById(selected.listingId)?.address ?? lead.facts.areas[0] ?? ""}</div>
                                    </div>
                                    <GradeTag grade={lead.qualification?.grade} />
                                    {lead.qualification && <ConfidenceMeter value={lead.qualification.confidence} label={lead.qualification.confidenceLabel} compact />}
                                </div>
                                {lead.strategy && <p className="ac-headline">{lead.strategy.headline}</p>}
                                <div className="ac-lead-actions">
                                    <Button icon="person" text="Open lead" onClick={() => actions.navigate({ name: "lead", id: lead.id, stage: "plan" })} />
                                    {selected.status === "open" && (
                                        <>
                                            <Popover
                                                content={
                                                    <Menu>
                                                        {AGENTS.map(a => (
                                                            <MenuItem key={a.id} text={a.name} label={a.title} icon={selected.assigneeId === a.id ? "tick" : "blank"} onClick={() => actions.reassignTask(selected.id, a.id)} />
                                                        ))}
                                                    </Menu>
                                                }
                                            >
                                                <Button icon="swap-horizontal" text={`Owner: ${agentById(selected.assigneeId)?.name.split(" ")[0]}`} />
                                            </Popover>
                                            <Button icon="disable" text="Dismiss" variant="minimal" onClick={() => actions.dismissTask(selected.id)} />
                                        </>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <NonIdealState icon="take-action" title="Select a task" description="See why it's ranked where it is and execute it." />
                    )}
                </div>
            </div>
        </div>
    );
}
