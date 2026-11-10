import { useEffect, useRef, useState } from "react";
import { Icon, type IconName, Tag, Tooltip } from "@blueprintjs/core";
import type { Grade, Lead, LeadStatus, Listing, ScorePoint, SourceId, Task } from "../types";
import { agentById, SOURCES } from "../data/directory";
import { GRADE_META } from "../engine/scoring";

/** Animates a number from its previous value to the new one. */
export function useCountUp(value: number, ms = 700) {
    const [shown, setShown] = useState(value);
    const from = useRef(value);
    useEffect(() => {
        const start = performance.now();
        const a = from.current;
        let raf = 0;
        const step = (t: number) => {
            const p = Math.min(1, (t - start) / ms);
            const e = 1 - Math.pow(1 - p, 3);
            setShown(Math.round(a + (value - a) * e));
            if (p < 1) raf = requestAnimationFrame(step);
            else from.current = value;
        };
        raf = requestAnimationFrame(step);
        return () => {
            cancelAnimationFrame(raf);
            from.current = value;
        };
    }, [value, ms]);
    return shown;
}

export function ScoreRing({ score, grade, size = 88, stroke = 8, label = true, pending }: { score?: number; grade?: Grade; size?: number; stroke?: number; label?: boolean; pending?: boolean }) {
    const v = useCountUp(score ?? 0);
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const color = grade ? GRADE_META[grade].color : "var(--muted)";
    return (
        <div className={`score-ring ${pending ? "score-ring-pending" : ""}`} style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel-3)" strokeWidth={stroke} />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={c * (1 - (score ?? 0) / 100)}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(.3,.7,.4,1), stroke 0.4s" }}
                />
            </svg>
            <div className="score-ring-text">
                <b style={{ fontSize: size * 0.3 }}>{score === undefined ? "–" : v}</b>
                {label && size >= 70 && <span>{grade ?? "scoring"}</span>}
            </div>
        </div>
    );
}

export function GradeTag({ grade, score, large }: { grade?: Grade; score?: number; large?: boolean }) {
    if (!grade) return <Tag minimal round>Scoring…</Tag>;
    const m = GRADE_META[grade];
    return (
        <Tag intent={m.intent} minimal={grade !== "Hot"} round icon={m.icon as IconName} large={large} className="grade-tag">
            {grade}
            {score !== undefined && <b className="grade-tag-score">{score}</b>}
        </Tag>
    );
}

export function ConfidenceMeter({ value, label, compact }: { value: number; label: string; compact?: boolean }) {
    const n = Math.round(value * 5);
    return (
        <Tooltip content={`Confidence ${Math.round(value * 100)}%: how much of the score is backed by verified, consistent data`} compact>
            <span className={`conf-meter conf-meter-${label.toLowerCase()}`}>
                <span className="conf-meter-bars">
                    {[0, 1, 2, 3, 4].map(i => (
                        <i key={i} className={i < n ? "on" : ""} />
                    ))}
                </span>
                {!compact && <span className="conf-meter-label">{label}</span>}
            </span>
        </Tooltip>
    );
}

export function PriorityBadge({ task, now }: { task: Task; now?: number }) {
    const p = task.priority;
    const recent = task.changedAt && task.prevPriority !== undefined && (now ?? Date.now()) - task.changedAt < 120_000;
    const d = recent ? p.score - task.prevPriority! : 0;
    return (
        <span className={`prio prio-${p.band}`}>
            <span className="prio-band">{p.band}</span>
            <span className="prio-score">{p.score}</span>
            {d !== 0 && (
                <span className={`prio-delta ${d > 0 ? "up" : "down"}`}>
                    <Icon icon={d > 0 ? "arrow-up" : "arrow-down"} size={10} />
                    {Math.abs(d)}
                </span>
            )}
        </span>
    );
}

export function SourceBadge({ source, compact }: { source: SourceId; compact?: boolean }) {
    const s = SOURCES[source];
    return (
        <span className="source-badge" title={s.channel}>
            <span className="source-icon" style={{ background: s.color }}>
                <Icon icon={s.icon} size={11} />
            </span>
            {!compact && <span>{s.short}</span>}
        </span>
    );
}

export function AgentAvatar({ id, size = 24, showName }: { id?: string; size?: number; showName?: boolean }) {
    const a = agentById(id);
    if (!a) return <span className="cell-muted">Unassigned</span>;
    const av = (
        <span className="person-avatar" style={{ width: size, height: size, background: a.color, fontSize: size * 0.4 }}>
            {a.initials}
        </span>
    );
    return showName ? (
        <span className="person-chip">
            {av}
            <span>{a.name}</span>
        </span>
    ) : (
        <Tooltip content={`${a.name} · ${a.title}`} compact>
            {av}
        </Tooltip>
    );
}

export function Sparkline({ points, width = 120, height = 28 }: { points: ScorePoint[]; width?: number; height?: number }) {
    if (points.length < 2) return <span className="cell-muted">–</span>;
    const xs = points.map((_, i) => (i / (points.length - 1)) * (width - 6) + 3);
    const ys = points.map(p => height - 3 - (p.score / 100) * (height - 6));
    const d = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
    const up = points[points.length - 1].score >= points[0].score;
    return (
        <svg width={width} height={height} className="sparkline">
            <path d={d} fill="none" stroke={up ? "var(--success)" : "var(--warning)"} strokeWidth={1.8} strokeLinejoin="round" />
            <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={2.8} fill={up ? "var(--success)" : "var(--warning)"} />
        </svg>
    );
}

export const STATUS_META: Record<LeadStatus, { label: string; intent: "none" | "primary" | "success" | "warning" | "danger"; icon: IconName }> = {
    processing: { label: "Agents working", intent: "primary", icon: "predictive-analysis" },
    new: { label: "New", intent: "primary", icon: "star" },
    contacted: { label: "Contacted", intent: "success", icon: "chat" },
    appointment: { label: "Showing booked", intent: "success", icon: "calendar" },
    nurture: { label: "Nurture", intent: "none", icon: "automatic-updates" },
    disqualified: { label: "Disqualified", intent: "danger", icon: "disable" },
};

export function StatusTag({ status }: { status: LeadStatus }) {
    const m = STATUS_META[status];
    return (
        <Tag minimal round intent={m.intent} icon={m.icon} className={status === "processing" ? "pulse" : ""}>
            {m.label}
        </Tag>
    );
}

/** Stylized listing "photo": a gradient sky with a house silhouette, tinted per listing. */
export function ListingThumb({ listing, height = 64, width }: { listing: Listing; height?: number; width?: number | string }) {
    const h = listing.hue;
    const condo = listing.type === "Condo";
    return (
        <div className="listing-thumb" style={{ height, width: width ?? "100%", background: `linear-gradient(160deg, hsl(${h} 55% 62%), hsl(${(h + 40) % 360} 45% 38%))` }}>
            <svg viewBox="0 0 120 60" preserveAspectRatio="xMidYMax meet">
                {condo ? (
                    <g fill="rgba(255,255,255,0.88)">
                        <rect x="38" y="8" width="26" height="52" rx="1" />
                        <rect x="66" y="20" width="18" height="40" rx="1" />
                        {[14, 22, 30, 38, 46].map(y => [42, 50, 57].map(x => <rect key={`${x}${y}`} x={x} y={y} width="4" height="4" fill={`hsl(${h} 40% 45%)`} />))}
                    </g>
                ) : (
                    <g>
                        <path d="M30 34 L60 14 L90 34 L90 60 L30 60 Z" fill="rgba(255,255,255,0.9)" />
                        <path d="M26 36 L60 12 L94 36" fill="none" stroke={`hsl(${h} 35% 30%)`} strokeWidth="3" strokeLinejoin="round" />
                        <rect x="54" y="42" width="11" height="18" fill={`hsl(${h} 40% 40%)`} />
                        <rect x="38" y="40" width="10" height="9" fill={`hsl(${h} 50% 72%)`} />
                        <rect x="72" y="40" width="10" height="9" fill={`hsl(${h} 50% 72%)`} />
                    </g>
                )}
                <rect x="0" y="58" width="120" height="2" fill="rgba(0,0,0,0.15)" />
            </svg>
            <span className={`listing-thumb-status ${listing.status === "Price reduced" ? "reduced" : listing.status === "Coming soon" ? "soon" : ""}`}>{listing.status}</span>
        </div>
    );
}

export function leadIntentLabel(lead: Lead) {
    return { buy: "Buyer", sell: "Seller", "buy-sell": "Buy + sell", invest: "Investor" }[lead.facts.intent];
}

export function Bar({ value, intent = "primary", width = 60 }: { value: number; intent?: string; width?: number }) {
    return (
        <span className={`mini-bar mini-bar-${intent}`} style={{ width }}>
            <i style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
        </span>
    );
}
