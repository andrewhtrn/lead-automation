import { useMemo } from "react";
import { Button, Icon, NonIdealState, Tag } from "@blueprintjs/core";
import { useStore } from "../state/store";
import { displayName, isProcessing } from "../engine/pipeline";
import { agentById, LISTINGS, listingById } from "../data/directory";
import { usd, usdShort } from "../lib/format";
import { PageHeader, Panel } from "../components/Panel";
import { TaskRow } from "../components/TaskRow";
import { AgentAvatar, ConfidenceMeter, GradeTag, ListingThumb, ScoreRing, SourceBadge } from "../components/ui";
import type { Lead, Listing, Task } from "../types";

function interest(listing: Listing, leads: Lead[]) {
    return leads
        .filter(l => l.status !== "disqualified" && (l.profile.listingId === listing.id || l.strategy?.tours.some(t => t.listingId === listing.id)))
        .map(l => ({ lead: l, direct: l.profile.listingId === listing.id, match: l.strategy?.tours.find(t => t.listingId === listing.id)?.match }))
        .sort((a, b) => (b.lead.qualification?.score ?? 0) - (a.lead.qualification?.score ?? 0));
}

function insight(listing: Listing, rows: ReturnType<typeof interest>, tasks: Task[]) {
    const q = rows.filter(r => r.lead.qualification && (r.lead.qualification.grade === "Hot" || r.lead.qualification.grade === "Warm"));
    const financed = rows.filter(r => {
        const f = r.lead.facts;
        const cap = f.preApprovalAmount ?? f.budgetMax ?? 0;
        return (f.preApproval === "verified" || f.preApproval === "cash") && (cap >= listing.price * 0.97 || f.preApproval === "cash");
    });
    const tours = rows.filter(r => r.lead.facts.tourScheduled?.includes(listing.address));
    const open = tasks.filter(t => t.status === "open");
    const lines: { icon: string; text: string; tone: "pos" | "neg" | "neu" }[] = [];
    lines.push({ icon: "people", text: `${rows.length} interested lead${rows.length === 1 ? "" : "s"} (${rows.filter(r => r.direct).length} direct inquiries, ${rows.length - rows.filter(r => r.direct).length} agent-matched)`, tone: "neu" });
    if (q.length) lines.push({ icon: "flame", text: `${q.length} qualified (hot/warm): ${q.map(r => displayName(r.lead).split(" ")[0]).join(", ")}`, tone: "pos" });
    if (financed.length) lines.push({ icon: "bank-account", text: `${financed.length} with verified financing at or above list price`, tone: "pos" });
    if (tours.length) lines.push({ icon: "calendar", text: `${tours.length} showing${tours.length > 1 ? "s" : ""} booked`, tone: "pos" });
    if (open.some(t => t.dueAt < Date.now())) lines.push({ icon: "warning-sign", text: `${open.filter(t => t.dueAt < Date.now()).length} overdue task(s) on this property`, tone: "neg" });
    let rec: string;
    if (q.length >= 2 || (q.length && financed.length)) rec = `Strong qualified demand. Schedule a showing block ${listing.status === "Coming soon" ? "for launch weekend" : "this Saturday 10–12"} and brief the seller on likely multiple offers.`;
    else if (q.length === 1) rec = `One qualified buyer. Prioritize ${displayName(q[0].lead).split(" ")[0]}'s showing and gather feedback within 24h.`;
    else if (listing.dom > 25) rec = `Low qualified demand after ${listing.dom} days. Recommend a pricing review with the seller and a targeted email to matched nurture leads.`;
    else if (rows.length) rec = "Interest is early-stage. Nurture leads with comps and an open-house invite.";
    else rec = "No demand captured yet. Promote via portal boost + open house.";
    return { lines, rec, q: q.length };
}

export function PropertiesView({ id }: { id?: string }) {
    const { state, actions } = useStore();
    const sel = listingById(id) ?? LISTINGS[0];
    const cards = useMemo(
        () =>
            LISTINGS.map(l => ({
                l,
                rows: interest(l, state.leads),
                tasks: state.tasks.filter(t => t.listingId === l.id && t.status === "open"),
            })),
        [state.leads, state.tasks],
    );
    const cur = cards.find(c => c.l.id === sel.id)!;
    const allTasks = state.tasks.filter(t => t.listingId === sel.id);
    const openTasks = cur.tasks.sort((a, b) => b.priority.score - a.priority.score);
    const ins = insight(sel, cur.rows, allTasks);
    const listingAgent = agentById(sel.listingAgentId);

    return (
        <div className="page">
            <PageHeader eyebrow="Listings" title="Properties" sub="A property-centric view of demand: every lead interested in a listing, ranked by qualification, with the tasks the agents generated for it." />
            <div className="prop-split">
                <div className="prop-list" data-tour="prop-list">
                    {cards.map(({ l, rows, tasks }) => (
                        <button key={l.id} className={`prop-card ${l.id === sel.id ? "active" : ""}`} onClick={() => actions.navigate({ name: "properties", id: l.id })}>
                            <ListingThumb listing={l} height={58} width={84} />
                            <div className="prop-card-text">
                                <div className="cell-strong">{l.address}</div>
                                <div className="cell-muted">
                                    {l.city} · {usdShort(l.price)} · {l.beds}bd
                                </div>
                                <div className="prop-card-stats">
                                    <span>
                                        <Icon icon="people" size={11} /> {rows.length}
                                    </span>
                                    <span className={rows.some(r => r.lead.qualification?.grade === "Hot") ? "text-danger" : ""}>
                                        <Icon icon="flame" size={11} /> {rows.filter(r => r.lead.qualification?.grade === "Hot").length}
                                    </span>
                                    <span>
                                        <Icon icon="take-action" size={11} /> {tasks.length}
                                    </span>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>

                <div className="prop-detail">
                    <div className="prop-hero">
                        <ListingThumb listing={sel} height={150} width={240} />
                        <div className="prop-hero-text">
                            <div className="page-eyebrow">
                                {sel.mls} · {sel.type}
                            </div>
                            <h2 className="prop-title">{sel.address}</h2>
                            <div className="cell-muted">
                                {sel.city}, TX {sel.zip}
                            </div>
                            <div className="enrich-stats prop-stats">
                                <span>
                                    <b>{usd(sel.price)}</b>
                                </span>
                                <span>
                                    <b>{sel.beds}</b> bd · <b>{sel.baths}</b> ba
                                </span>
                                <span>
                                    <b>{sel.sqft.toLocaleString()}</b> sqft
                                </span>
                                <span>
                                    <b>{sel.dom}</b> days on market
                                </span>
                                {sel.hoa && (
                                    <span>
                                        HOA <b>${sel.hoa}</b>/mo
                                    </span>
                                )}
                            </div>
                            <div className="tag-row">
                                {sel.features.map(f => (
                                    <Tag key={f} minimal round>
                                        {f}
                                    </Tag>
                                ))}
                            </div>
                            {listingAgent && (
                                <div className="cell-muted prop-agent">
                                    Listing agent: <AgentAvatar id={listingAgent.id} size={18} showName />
                                </div>
                            )}
                        </div>
                        <div className="prop-insight" data-tour="prop-insight">
                            <div className="enrich-h">
                                <Icon icon="predictive-analysis" size={12} /> Demand intelligence
                            </div>
                            {ins.lines.map((x, i) => (
                                <div key={i} className={`ins-line ins-${x.tone}`}>
                                    <Icon icon={x.icon as never} size={12} /> {x.text}
                                </div>
                            ))}
                            <div className="nba">
                                <Icon icon="flash" size={14} />
                                <div>
                                    <div className="enrich-h">Recommendation</div>
                                    <div>{ins.rec}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="two-col">
                        <Panel id="prop-leads" title="Interested leads" icon="people" count={cur.rows.length} subtitle="Ranked by qualification score">
                            {cur.rows.length ? (
                                <div className="lead-mini-list">
                                    {cur.rows.map(({ lead, direct, match }) => (
                                        <button key={lead.id} className="lead-mini" onClick={() => actions.navigate({ name: "lead", id: lead.id })}>
                                            <ScoreRing score={lead.qualification?.score} grade={lead.qualification?.grade} size={38} stroke={4} pending={isProcessing(lead)} />
                                            <div className="lead-mini-text">
                                                <div className="cell-strong">
                                                    {displayName(lead)} <SourceBadge source={lead.raw.source} compact />
                                                </div>
                                                <div className="cell-muted">
                                                    {direct ? "Inquired directly" : `Agent-matched · ${match}% fit`}
                                                    {lead.facts.tourScheduled?.includes(sel.address) ? " · showing booked" : ""}
                                                </div>
                                            </div>
                                            {lead.qualification && <ConfidenceMeter value={lead.qualification.confidence} label={lead.qualification.confidenceLabel} compact />}
                                            <GradeTag grade={lead.qualification?.grade} />
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <NonIdealState icon="people" title="No interested leads yet" description="Simulate a lead to see agents match it." action={<Button text="Simulate a lead" icon="new-person" onClick={() => actions.simulateLead({ open: true })} />} />
                            )}
                        </Panel>
                        <Panel id="prop-tasks" title="Property tasks" icon="take-action" count={openTasks.length} subtitle="Sorted by priority" tour="prop-tasks">
                            {openTasks.length ? (
                                <div className="trow-list">
                                    {openTasks.map(t => (
                                        <TaskRow key={t.id} task={t} onSelect={() => actions.navigate({ name: "actions", taskId: t.id })} />
                                    ))}
                                </div>
                            ) : (
                                <NonIdealState icon="endorsed" title="No open tasks for this property" />
                            )}
                        </Panel>
                    </div>
                </div>
            </div>
        </div>
    );
}
