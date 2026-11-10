import { useMemo, useState } from "react";
import { HTMLSelect, HTMLTable, InputGroup, NonIdealState, SegmentedControl } from "@blueprintjs/core";
import { useStore } from "../state/store";
import { displayName, isProcessing } from "../engine/pipeline";
import { listingById, SOURCE_LIST } from "../data/directory";
import { timeAgo, usdShort } from "../lib/format";
import { PageHeader, Panel } from "../components/Panel";
import { AgentAvatar, ConfidenceMeter, leadIntentLabel, ScoreRing, SourceBadge, Sparkline, STATUS_META, StatusTag } from "../components/ui";
import type { Grade, LeadStatus, SourceId } from "../types";

type Sort = "score" | "recent";

export function LeadsView() {
    const { state, actions } = useStore();
    const [q, setQ] = useState("");
    const [grade, setGrade] = useState<"all" | Grade>("all");
    const [source, setSource] = useState<"all" | SourceId>("all");
    const [status, setStatus] = useState<"all" | LeadStatus>("all");
    const [sort, setSort] = useState<Sort>("score");

    const rows = useMemo(() => {
        let r = state.leads;
        if (q) r = r.filter(l => `${displayName(l)} ${l.contact?.email ?? ""} ${listingById(l.profile.listingId)?.address ?? ""}`.toLowerCase().includes(q.toLowerCase()));
        if (grade !== "all") r = r.filter(l => l.qualification?.grade === grade);
        if (source !== "all") r = r.filter(l => l.raw.source === source);
        if (status !== "all") r = r.filter(l => l.status === status);
        return [...r].sort((a, b) =>
            sort === "recent" ? b.receivedAt - a.receivedAt : Number(isProcessing(b)) - Number(isProcessing(a)) || (b.qualification?.score ?? 0) - (a.qualification?.score ?? 0),
        );
    }, [state.leads, q, grade, source, status, sort]);

    const count = (g: Grade) => state.leads.filter(l => l.qualification?.grade === g).length;

    return (
        <div className="page">
            <PageHeader
                eyebrow="All sources"
                title="Lead inbox"
                sub="One normalized inbox for Zillow, Realtor.com, your website, email, Facebook, open houses and referrals. Every lead is scored with an explainable model and a confidence level."
            />
            <div className="toolbar">
                <InputGroup leftIcon="search" placeholder="Search name, email or property…" value={q} onChange={e => setQ(e.currentTarget.value)} className="toolbar-search" />
                <SegmentedControl
                    value={grade}
                    onValueChange={v => setGrade(v as never)}
                    options={[
                        { label: `All (${state.leads.length})`, value: "all" },
                        { label: `Hot (${count("Hot")})`, value: "Hot" },
                        { label: `Warm (${count("Warm")})`, value: "Warm" },
                        { label: `Nurture (${count("Nurture")})`, value: "Nurture" },
                        { label: `Cold (${count("Cold")})`, value: "Cold" },
                    ]}
                />
                <HTMLSelect value={source} onChange={e => setSource(e.currentTarget.value as never)} options={[{ label: "All sources", value: "all" }, ...SOURCE_LIST.map(s => ({ label: s.label, value: s.id }))]} />
                <HTMLSelect value={status} onChange={e => setStatus(e.currentTarget.value as never)} options={[{ label: "Any status", value: "all" }, ...Object.entries(STATUS_META).map(([k, v]) => ({ label: v.label, value: k }))]} />
                <span className="panel-spacer" />
                <SegmentedControl
                    size="small"
                    value={sort}
                    onValueChange={v => setSort(v as Sort)}
                    options={[
                        { label: "Best first", value: "score" },
                        { label: "Newest", value: "recent" },
                    ]}
                />
            </div>
            <Panel id="leads-table" title="Leads" icon="inbox" count={rows.length} tour="leads-table">
                {rows.length ? (
                    <HTMLTable interactive className="leads-table">
                        <thead>
                            <tr>
                                <th>Score</th>
                                <th>Lead</th>
                                <th>Source</th>
                                <th>Interest</th>
                                <th>Confidence</th>
                                <th>Trend</th>
                                <th>Status</th>
                                <th>Owner</th>
                                <th>Next best action</th>
                                <th>Received</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(l => {
                                const li = listingById(l.profile.listingId);
                                const proc = isProcessing(l);
                                const qn = l.qualification;
                                return (
                                    <tr key={l.id} onClick={() => actions.navigate({ name: "lead", id: l.id })} className={state.now - l.receivedAt < 60_000 ? "row-new" : ""}>
                                        <td>
                                            <ScoreRing score={qn?.score} grade={qn?.grade} size={40} stroke={4} pending={proc} />
                                        </td>
                                        <td>
                                            <div className="cell-strong">{displayName(l)}</div>
                                            <div className="cell-muted">
                                                {leadIntentLabel(l)} · {l.id}
                                            </div>
                                        </td>
                                        <td>
                                            <SourceBadge source={l.raw.source} />
                                        </td>
                                        <td>
                                            {li ? (
                                                <>
                                                    <div>{li.address}</div>
                                                    <div className="cell-muted">
                                                        {li.city} · {usdShort(li.price)}
                                                    </div>
                                                </>
                                            ) : (
                                                <span className="cell-muted">{l.facts.sellerAddress ? `Sell: ${l.facts.sellerAddress.split(",")[0]}` : `${l.facts.areas[0] ?? "Austin"} search`}</span>
                                            )}
                                        </td>
                                        <td>{qn ? <ConfidenceMeter value={qn.confidence} label={qn.confidenceLabel} /> : "–"}</td>
                                        <td>
                                            <Sparkline points={l.scoreHistory} width={64} height={22} />
                                        </td>
                                        <td>
                                            <StatusTag status={l.status} />
                                        </td>
                                        <td>{l.assigneeId ? <AgentAvatar id={l.assigneeId} /> : "–"}</td>
                                        <td className="cell-nba">{l.strategy?.nextBestAction ?? <span className="cell-muted">Agents working…</span>}</td>
                                        <td className="cell-muted nowrap">{timeAgo(l.receivedAt, state.now)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </HTMLTable>
                ) : (
                    <NonIdealState icon="search" title="No leads match" description="Try clearing a filter." />
                )}
            </Panel>
        </div>
    );
}
