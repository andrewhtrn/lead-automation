import { useState, type ReactNode } from "react";
import { Button, Callout, HTMLTable, Icon, NonIdealState, Tab, Tabs, Tag, Tooltip } from "@blueprintjs/core";
import type { AgentStageId, Lead, Provenance } from "../../types";
import { useStore } from "../../state/store";
import { stageMeta } from "../../engine/pipeline";
import { engagementIndex, GRADE_META, WEIGHTS } from "../../engine/scoring";
import { PRIORITY_WEIGHTS, TASK_KIND_META } from "../../engine/tasks";
import { agentById, listingById, SOURCES } from "../../data/directory";
import { fmtClock, pct, timeAgo, usd, usdShort } from "../../lib/format";
import { AgentConsole, Labeled } from "../../components/common";
import { Panel } from "../../components/Panel";
import { TaskRow } from "../../components/TaskRow";
import { AgentAvatar, Bar, ConfidenceMeter, GradeTag, ListingThumb, ScoreRing } from "../../components/ui";

export interface StageProps {
    lead: Lead;
}

/** Common frame: agent console on top, the agent's output below once it has finished. */
function StageFrame({ lead, id, children }: StageProps & { id: AgentStageId; children: ReactNode }) {
    const m = stageMeta(id);
    const st = lead.stages[id];
    return (
        <div className="step">
            <div className="step-head">
                <div>
                    <h2>
                        <Icon icon={m.icon} /> {m.agent}
                    </h2>
                    <p className="cell-muted">{m.blurb}</p>
                </div>
                {st === "complete" && (
                    <Tag minimal intent="success" icon="tick-circle" round>
                        Complete
                    </Tag>
                )}
            </div>
            <AgentConsole run={lead.runs[id]} title={`${m.agent} · ${lead.id}`} idleText={st === "locked" ? "Waiting for upstream agents" : "Completed before this session (seed history)"} defaultOpen={st !== "complete" || !!lead.runs[id]} maxHeight={220} />
            {st === "complete" ? (
                <div className="stage-output">{children}</div>
            ) : (
                <div className="stage-skeleton">
                    {[0, 1, 2].map(i => (
                        <div key={i} className="skel" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                    <div className="cell-muted">{st === "running" ? `${m.agent} is working. Output will appear here.` : "Waiting for upstream agents."}</div>
                </div>
            )}
        </div>
    );
}

export function Prov({ p }: { p?: Provenance }) {
    if (!p) return null;
    return (
        <Tooltip content={`${p.detail} · ${timeAgo(p.at)}`} compact>
            <span className={`prov ${p.verified ? "prov-verified" : ""}`}>
                <Icon icon={p.verified ? "endorsed" : "comment"} size={10} />
                {p.source}
            </span>
        </Tooltip>
    );
}

// --- 1. Intake ------------------------------------------------------------------------------------

export function IntakeStage({ lead }: StageProps) {
    const src = SOURCES[lead.raw.source];
    return (
        <StageFrame lead={lead} id="intake">
            <div className="two-col">
                <Panel id="raw" title="Raw payload" icon="code" subtitle={`${src.channel} · ${lead.raw.format.toUpperCase()}`} tour="raw-payload">
                    <pre className="raw-payload">{lead.raw.payload}</pre>
                </Panel>
                <div className="col-stack">
                    {lead.profile.translation && (
                        <Callout intent="primary" icon="translate" title="Translated from Spanish">
                            {lead.profile.translation}
                        </Callout>
                    )}
                    <Panel id="entities" title="Extracted entities" icon="th-list" count={lead.extracted.length}>
                        <HTMLTable compact className="kv-table">
                            <tbody>
                                {lead.extracted.map(e => (
                                    <tr key={e.label}>
                                        <td className="cell-muted">{e.label}</td>
                                        <td className="cell-strong">{e.value}</td>
                                        <td style={{ width: 110 }}>
                                            <div className="conf">
                                                <Bar value={e.confidence * 100} intent={e.confidence >= 0.9 ? "success" : "warning"} width={56} />
                                                <span className="mono">{pct(e.confidence)}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </HTMLTable>
                    </Panel>
                </div>
            </div>
        </StageFrame>
    );
}

// --- 2. Normalize ---------------------------------------------------------------------------------

export function NormalizeStage({ lead }: StageProps) {
    const c = lead.contact;
    const d = lead.dedupe;
    return (
        <StageFrame lead={lead} id="normalize">
            <Panel id="mappings" title="Field normalization" icon="clean" subtitle="Source schema → canonical lead schema v4" count={`${lead.mappings.filter(m => m.changed).length} changed`} tour="mappings">
                <HTMLTable compact className="map-table">
                    <thead>
                        <tr>
                            <th>Field</th>
                            <th>Raw value</th>
                            <th />
                            <th>Normalized</th>
                            <th>Rule applied</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lead.mappings.map(m => (
                            <tr key={m.field}>
                                <td className="cell-strong">{m.field}</td>
                                <td className="mono map-raw">{m.raw}</td>
                                <td>
                                    <Icon icon="arrow-right" size={12} className="cell-muted" />
                                </td>
                                <td className={`map-norm ${m.normalized.includes("⚠") ? "text-danger" : ""}`}>{m.normalized}</td>
                                <td className="cell-muted">{m.rule}</td>
                            </tr>
                        ))}
                    </tbody>
                </HTMLTable>
            </Panel>
            <div className="two-col">
                {c && (
                    <Panel id="contact" title="Golden contact record" icon="id-number" padded>
                        <div className="labeled-grid">
                            <Labeled label="Name">{c.name}</Labeled>
                            <Labeled label="Phone">{c.phone}</Labeled>
                            <Labeled label="Email">{c.email}</Labeled>
                            <Labeled label="Preferred channel">{c.preferredChannel}</Labeled>
                            <Labeled label="Language">{c.language}</Labeled>
                            <Labeled label="Time zone">{c.timezone}</Labeled>
                        </div>
                    </Panel>
                )}
                <Panel id="dedupe" title="CRM de-duplication" icon="git-merge" padded>
                    {d?.matched ? (
                        <>
                            <Callout intent="warning" icon="git-merge" title={`Matched existing contact ${d.contactId} · ${pct(d.confidence ?? 0)}`}>
                                Known since {d.since}. History merged into this lead so the agent knows the relationship.
                            </Callout>
                            <ul className="history-list">
                                {d.history?.map((h, i) => (
                                    <li key={i}>{h}</li>
                                ))}
                            </ul>
                        </>
                    ) : (
                        <Callout intent="success" icon="new-person" title="New contact">
                            No match on email, phone, or fuzzy name + address across 18,240 CRM contacts (simulated).
                        </Callout>
                    )}
                </Panel>
            </div>
        </StageFrame>
    );
}

// --- 3. Enrich ------------------------------------------------------------------------------------

export function EnrichStage({ lead }: StageProps) {
    const l = listingById(lead.profile.listingId);
    const f = lead.facts;
    const b = lead.behavior;
    const p = lead.provenance;
    return (
        <StageFrame lead={lead} id="enrich">
            <div className="enrich-grid" data-tour="enrich-grid">
                {l && (
                    <div className="enrich-card enrich-listing">
                        <ListingThumb listing={l} height={92} />
                        <div className="enrich-body">
                            <div className="enrich-h">
                                <Icon icon="home" size={12} /> Property of interest
                            </div>
                            <div className="cell-strong">{l.address}</div>
                            <div className="cell-muted">
                                {l.city}, TX {l.zip} · {l.mls}
                            </div>
                            <div className="enrich-stats">
                                <span>
                                    <b>{usdShort(l.price)}</b> list
                                </span>
                                <span>
                                    <b>
                                        {l.beds}/{l.baths}
                                    </b>{" "}
                                    bd/ba
                                </span>
                                <span>
                                    <b>{l.sqft.toLocaleString()}</b> sqft
                                </span>
                                <span>
                                    <b>{l.dom}</b> DOM
                                </span>
                            </div>
                            <div className="tag-row">
                                {l.features.map(x => (
                                    <Tag key={x} minimal round>
                                        {x}
                                    </Tag>
                                ))}
                            </div>
                            <span className="prov prov-verified">
                                <Icon icon="endorsed" size={10} /> MLS feed (simulated)
                            </span>
                        </div>
                    </div>
                )}
                <div className="enrich-card">
                    <div className="enrich-body">
                        <div className="enrich-h">
                            <Icon icon="bank-account" size={12} /> Financial readiness
                        </div>
                        <div className="enrich-big">{{ verified: "Pre-approval verified", cash: "Cash buyer", stated: "Pre-approval stated", none: "Not pre-approved", unknown: "Unknown" }[f.preApproval]}</div>
                        {f.preApprovalAmount && <div>Amount: {usd(f.preApprovalAmount)}</div>}
                        {f.budgetMax && !f.preApprovalAmount && <div>Buying power: up to {usd(f.budgetMax)}</div>}
                        {f.lender && <div className="cell-muted">{f.lender}</div>}
                        <div className="prov-row">
                            <Prov p={p.preApproval} />
                            <Prov p={p.budgetMax} />
                        </div>
                    </div>
                </div>
                <div className="enrich-card">
                    <div className="enrich-body">
                        <div className="enrich-h">
                            <Icon icon="pulse" size={12} /> Behavior &amp; engagement
                        </div>
                        <div className="beh-grid">
                            <div>
                                <b>{b.sessions}</b>
                                <span>sessions</span>
                            </div>
                            <div>
                                <b>{b.listingViews}</b>
                                <span>listing views</span>
                            </div>
                            <div>
                                <b>{b.savedHomes}</b>
                                <span>saved</span>
                            </div>
                            <div>
                                <b>{b.emailOpens}</b>
                                <span>email opens</span>
                            </div>
                        </div>
                        <div className="conf">
                            <span className="cell-muted">Engagement index</span>
                            <Bar value={engagementIndex(lead)} width={90} />
                            <b>{engagementIndex(lead)}</b>
                        </div>
                        <div className="prov-row">
                            <Prov p={p.behavior} />
                        </div>
                    </div>
                </div>
                <div className="enrich-card">
                    <div className="enrich-body">
                        <div className="enrich-h">
                            <Icon icon="office" size={12} /> Household &amp; records
                        </div>
                        <div className="enrich-big">{{ renting: "Renting", owner: "Homeowner", "owner-must-sell": "Owner, must sell first", unknown: "Housing unknown" }[f.housing]}</div>
                        {f.sellerAddress && <div>Owns: {f.sellerAddress}</div>}
                        {f.householdSize && <div>Household of {f.householdSize}</div>}
                        <div>
                            Phone {f.phoneValid ? "✓ valid mobile" : "✗ invalid"} · Email {f.emailValid ? "✓ deliverable" : "✗ undeliverable"}
                        </div>
                        <div className="prov-row">
                            <Prov p={p.housing} />
                            <Prov p={p.sellerAddress} />
                        </div>
                    </div>
                </div>
                <div className="enrich-card">
                    <div className="enrich-body">
                        <div className="enrich-h">
                            <Icon icon="timeline-line-chart" size={12} /> Market context
                        </div>
                        <div className="beh-grid">
                            <div>
                                <b>31</b>
                                <span>median DOM</span>
                            </div>
                            <div>
                                <b>97.6%</b>
                                <span>list-to-sale</span>
                            </div>
                            <div>
                                <b>3.1</b>
                                <span>months inventory</span>
                            </div>
                            <div>
                                <b>{l ? `${Math.round((l.price / l.sqft) * 1) }` : "268"}</b>
                                <span>$/sqft</span>
                            </div>
                        </div>
                        <span className="prov">
                            <Icon icon="comment" size={10} /> {l?.area ?? f.areas[0] ?? "Austin metro"} market model (simulated)
                        </span>
                    </div>
                </div>
            </div>
        </StageFrame>
    );
}

// --- 4. Qualify -----------------------------------------------------------------------------------

export function QualifyStage({ lead }: StageProps) {
    const q = lead.qualification;
    return (
        <StageFrame lead={lead} id="qualify">
            {q && (
                <>
                    <div className="qual-top" data-tour="qual-top">
                        <div className="qual-score">
                            <ScoreRing score={q.score} grade={q.grade} size={124} stroke={11} />
                            <div>
                                <GradeTag grade={q.grade} large />
                                <div className="qual-sla">
                                    Response SLA: <b>{GRADE_META[q.grade].sla}</b>
                                </div>
                            </div>
                        </div>
                        <div className="qual-summary">
                            <div className="enrich-h">Why this score</div>
                            <p>{q.summary}</p>
                            <div className="enrich-h">
                                Confidence: {q.confidenceLabel} ({pct(q.confidence)}) <ConfidenceMeter value={q.confidence} label={q.confidenceLabel} compact />
                            </div>
                            <ul className="conf-notes">
                                {q.confidenceNotes.map((n, i) => (
                                    <li key={i} className={n.ok ? "ok" : "bad"}>
                                        <Icon icon={n.ok ? "tick" : "warning-sign"} size={12} /> {n.text}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="qual-history">
                            <div className="enrich-h">Score history</div>
                            {[...lead.scoreHistory].reverse().slice(0, 6).map((h, i, arr) => {
                                const prev = arr[i + 1];
                                const d = prev ? h.score - prev.score : 0;
                                return (
                                    <div key={h.t} className="hist-row">
                                        <span className="mono">{h.score}</span>
                                        {d !== 0 && <span className={d > 0 ? "delta-up" : "delta-down"}>{d > 0 ? `+${d}` : d}</span>}
                                        <span className="hist-label">{h.label}</span>
                                        <span className="cell-muted">{fmtClock(h.t)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <Panel id="factors" title="Explainable factor breakdown" icon="horizontal-bar-chart" subtitle="Each factor = weight × strength. Evidence and source shown for every line." tour="factors">
                        <div className="factor-list">
                            {q.factors.map(f => (
                                <div key={f.id} className={`factor ${f.penalty ? "factor-penalty" : ""} ${f.known ? "" : "factor-unknown"}`}>
                                    <div className="factor-label">
                                        <span className="cell-strong">{f.label}</span>
                                        <span className="cell-muted">{f.penalty ? "adjustment" : `weight ${f.weight}`}</span>
                                    </div>
                                    <div className="factor-bar">
                                        <i style={{ width: `${f.penalty ? 100 : (f.points / f.weight) * 100}%` }} />
                                    </div>
                                    <div className={`factor-pts ${f.penalty ? "text-danger" : ""}`}>
                                        {f.penalty ? "" : "+"}
                                        {f.points.toFixed(1)}
                                    </div>
                                    <div className="factor-evidence">
                                        {f.evidence}
                                        <span className={`prov ${f.verified ? "prov-verified" : ""}`}>
                                            <Icon icon={f.verified ? "endorsed" : f.known ? "comment" : "help"} size={10} />
                                            {f.known ? f.source : "No data. Ask on first call"}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            <div className="factor factor-total">
                                <div className="factor-label">
                                    <span className="cell-strong">Total</span>
                                    <span className="cell-muted">max 100</span>
                                </div>
                                <div className="factor-bar">
                                    <i style={{ width: `${q.score}%`, background: GRADE_META[q.grade].color }} />
                                </div>
                                <div className="factor-pts">{q.score}</div>
                                <div className="factor-evidence cell-muted">
                                    Hot ≥ 75 · Warm 55–74 · Nurture 35–54 · Cold &lt; 35. Model weights: {Object.entries(WEIGHTS).map(([k, v]) => `${k} ${v}`).join(", ")}.
                                </div>
                            </div>
                        </div>
                    </Panel>
                </>
            )}
        </StageFrame>
    );
}

// --- 5. Strategy ----------------------------------------------------------------------------------

export function StrategyStage({ lead }: StageProps) {
    const s = lead.strategy;
    const [tab, setTab] = useState("call");
    const a = agentById(lead.assigneeId);
    return (
        <StageFrame lead={lead} id="strategy">
            {s && (
                <>
                    <div className="reason-card" data-tour="reasoning">
                        <div className="reason-head">
                            <Icon icon="lightbulb" size={18} />
                            <div style={{ flex: 1 }}>
                                <div className="enrich-h">Agent reasoning</div>
                                <div className="reason-headline">{s.headline}</div>
                            </div>
                            {a && (
                                <div className="reason-owner">
                                    <AgentAvatar id={a.id} size={30} />
                                    <div>
                                        <div className="cell-strong">{a.name}</div>
                                        <div className="cell-muted reason-route">{lead.routingReason}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="reason-grid">
                            <div>
                                <div className="enrich-h">Evidence</div>
                                <ol className="evidence-list">
                                    {s.evidence.map((e, i) => (
                                        <li key={i} className={`ev-${e.tone}`}>
                                            <span>{e.text}</span>
                                            <span className="prov">{e.cite}</span>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                            <div>
                                <div className="enrich-h">Risks to manage</div>
                                <ul className="risk-list">
                                    {s.risks.map((r, i) => (
                                        <li key={i}>
                                            <Icon icon="warning-sign" size={11} /> {r}
                                        </li>
                                    ))}
                                    {!s.risks.length && <li className="cell-muted">None flagged</li>}
                                </ul>
                                <div className="nba">
                                    <Icon icon="flash" size={14} />
                                    <div>
                                        <div className="enrich-h">Next best action</div>
                                        <div className="cell-strong">{s.nextBestAction}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <Panel id="recs" title="Conversion recommendations" icon="clipboard" subtitle="Personalized assets, ready to use" tour="recs">
                        <div className="panel-body-padded">
                            <Tabs id="rec-tabs" selectedTabId={tab} onChange={t => setTab(String(t))} className="rec-tabs">
                                <Tab id="call" icon="phone" title="Call script" panel={<CallScriptView lead={lead} />} />
                                <Tab id="email" icon="envelope" title="Email" panel={<pre className="draft-body">{`Subject: ${s.email.subject}\n\n${s.email.body}`}</pre>} />
                                <Tab id="sms" icon="chat" title="Text" panel={<div className="sms-bubble">{s.sms}</div>} />
                                <Tab
                                    id="questions"
                                    icon="help"
                                    title={`Questions (${s.questions.length})`}
                                    panel={
                                        <ol className="q-list">
                                            {s.questions.map((q, i) => (
                                                <li key={i}>
                                                    <div className="cell-strong">{q.q}</div>
                                                    <div className="cell-muted">{q.why}</div>
                                                </li>
                                            ))}
                                        </ol>
                                    }
                                />
                                <Tab
                                    id="docs"
                                    icon="document-share"
                                    title={`Documents (${s.documents.length})`}
                                    panel={
                                        <div className="doc-list">
                                            {s.documents.map(d => (
                                                <div key={d.id} className="doc-item">
                                                    <Icon icon={d.kind === "pdf" ? "document" : d.kind === "link" ? "link" : "timeline-bar-chart"} />
                                                    <div>
                                                        <div className="cell-strong">{d.title}</div>
                                                        <div className="cell-muted">{d.why}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    }
                                />
                                <Tab id="tours" icon="key" title={`Tours (${s.tours.length})`} panel={<ToursView lead={lead} />} />
                            </Tabs>
                        </div>
                    </Panel>
                </>
            )}
        </StageFrame>
    );
}

function CallScriptView({ lead }: StageProps) {
    const c = lead.strategy!.callScript;
    return (
        <div className="script">
            <div className="script-sec">
                <div className="enrich-h">Opener</div>
                <p className="ad-opener">{c.opener}</p>
            </div>
            <div className="script-sec">
                <div className="enrich-h">Talking points</div>
                <ul>
                    {c.talkingPoints.map((t, i) => (
                        <li key={i}>{t}</li>
                    ))}
                </ul>
            </div>
            <div className="script-sec">
                <div className="enrich-h">Objection handling</div>
                {c.objections.map((o, i) => (
                    <div key={i} className="objection">
                        <div className="cell-strong">{o.q}</div>
                        <div>{o.a}</div>
                    </div>
                ))}
            </div>
            <div className="script-sec">
                <div className="enrich-h">Close</div>
                <p>{c.close}</p>
            </div>
        </div>
    );
}

function ToursView({ lead }: StageProps) {
    const tours = lead.strategy!.tours;
    if (!tours.length) return <NonIdealState icon="key" title="No strong matches yet" description="The Strategy Agent needs budget or area to match inventory." />;
    return (
        <div className="tour-grid">
            {tours.map(t => {
                const l = listingById(t.listingId)!;
                return (
                    <div key={t.listingId} className="tour-card-l">
                        <ListingThumb listing={l} height={80} />
                        <div className="enrich-body">
                            <div className="tour-card-top">
                                <span className="cell-strong">{l.address}</span>
                                <Tag minimal round intent={t.match >= 85 ? "success" : "primary"}>
                                    {t.match}%
                                </Tag>
                            </div>
                            <div className="cell-muted">
                                {usdShort(l.price)} · {l.beds}bd/{l.baths}ba · {l.city}
                            </div>
                            <ul className="tour-reasons">
                                {t.reasons.map(r => (
                                    <li key={r}>
                                        <Icon icon="tick" size={10} /> {r}
                                    </li>
                                ))}
                            </ul>
                            <div className="cell-muted">
                                <Icon icon="time" size={11} /> Suggested: {t.slot}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// --- 6. Plan --------------------------------------------------------------------------------------

export function PlanStage({ lead }: StageProps) {
    const { state, actions } = useStore();
    const mine = state.tasks.filter(t => t.leadId === lead.id);
    const open = mine.filter(t => t.status === "open").sort((a, b) => b.priority.score - a.priority.score);
    const closed = mine.filter(t => t.status !== "open").sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    const [sel, setSel] = useState<string | null>(null);
    const selected = open.find(t => t.id === sel) ?? open[0];
    return (
        <StageFrame lead={lead} id="plan">
            <div className="plan-grid">
                <Panel id="lead-tasks" title="Prioritized tasks" icon="list-detail-view" count={open.length} subtitle="Also published to the brokerage Action Center" tour="lead-tasks">
                    {open.length ? (
                        <div className="trow-list">
                            {open.map(t => (
                                <TaskRow key={t.id} task={t} showLead={false} selected={selected?.id === t.id} onSelect={() => setSel(t.id)} />
                            ))}
                        </div>
                    ) : (
                        <NonIdealState icon="endorsed" title="No open tasks" description="All caught up on this lead." />
                    )}
                    {closed.length > 0 && (
                        <div className="closed-tasks">
                            <div className="enrich-h">Completed &amp; superseded ({closed.length})</div>
                            {closed.map(t => (
                                <TaskRow key={t.id} task={t} showLead={false} />
                            ))}
                        </div>
                    )}
                </Panel>
                {selected && <PriorityExplainer taskId={selected.id} onExecute={() => actions.openAction(selected.id)} />}
            </div>
        </StageFrame>
    );
}

export function PriorityExplainer({ taskId, onExecute }: { taskId: string; onExecute: () => void }) {
    const { state } = useStore();
    const t = state.tasks.find(x => x.id === taskId);
    if (!t) return null;
    const p = t.priority;
    const meta = TASK_KIND_META[t.kind];
    const rows: [string, number, number][] = [
        ["Urgency", p.urgency, PRIORITY_WEIGHTS.urgency],
        ["Lead quality", p.quality, PRIORITY_WEIGHTS.quality],
        ["Engagement", p.engagement, PRIORITY_WEIGHTS.engagement],
        ["Opportunity", p.opportunity, PRIORITY_WEIGHTS.opportunity],
    ];
    return (
        <div className="prio-explain" data-tour="prio-explain">
            <div className="enrich-h">Why this priority</div>
            <div className="prio-explain-head">
                <span className={`prio prio-${p.band} prio-lg`}>
                    <span className="prio-band">{p.band}</span>
                    <span className="prio-score">{p.score}</span>
                </span>
                <div className="cell-strong">{t.title}</div>
            </div>
            {rows.map(([label, v, w]) => (
                <div key={label} className="pe-row">
                    <span className="pe-label">{label}</span>
                    <Bar value={v} width={120} intent={v >= 75 ? "danger" : v >= 50 ? "warning" : "primary"} />
                    <span className="mono pe-val">{v}</span>
                    <span className="cell-muted mono pe-w">× {w.toFixed(2)} = {(v * w).toFixed(1)}</span>
                </div>
            ))}
            <ul className="pe-reasons">
                {p.reasons.map(r => (
                    <li key={r}>
                        <Icon icon="dot" /> {r}
                    </li>
                ))}
            </ul>
            <p className="cell-muted pe-detail">{t.detail}</p>
            {t.status === "open" && <Button intent="primary" fill icon={meta.icon as never} text={meta.verb} onClick={onExecute} data-tour="execute-btn" />}
        </div>
    );
}
