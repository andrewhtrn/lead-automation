import { useEffect, useRef, useState, type ReactNode } from "react";
import { Card, Icon, type IconName, type Intent, ProgressBar, Spinner } from "@blueprintjs/core";
import type { AgentRun } from "../types";
import { fmtTime } from "../lib/format";

const LEVEL_ICON: Record<string, { icon: IconName; cls: string }> = {
    info: { icon: "dot", cls: "log-info" },
    ok: { icon: "tick", cls: "log-ok" },
    warn: { icon: "warning-sign", cls: "log-warn" },
    error: { icon: "error", cls: "log-error" },
    agent: { icon: "predictive-analysis", cls: "log-agent" },
};

export function AgentConsole({
    run,
    title,
    idleText = "Agent idle",
    maxHeight = 260,
    compact,
    defaultOpen = true,
}: {
    run?: AgentRun;
    title: string;
    idleText?: string;
    maxHeight?: number;
    compact?: boolean;
    /** The log body collapses from its header; it re-opens on its own while the agent is running. */
    defaultOpen?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const running = run?.status === "running";
    const [open, setOpen] = useState(defaultOpen);
    const shown = open || running;
    useEffect(() => {
        if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
    }, [run?.lines.length, shown]);
    return (
        <div className={`agent-console ${compact ? "agent-console-compact" : ""} ${shown ? "" : "agent-console-closed"}`}>
            <div
                className="agent-console-head"
                role="button"
                tabIndex={0}
                aria-expanded={shown}
                onClick={() => setOpen(!shown)}
                onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpen(!shown);
                    }
                }}
            >
                <Icon icon="chevron-right" size={12} className="agent-console-chevron" />
                {running ? <Spinner size={14} intent="primary" /> : <Icon icon={run ? "tick-circle" : "predictive-analysis"} size={14} className={run ? "log-ok" : ""} />}
                <span className="agent-console-title">{title}</span>
                <span style={{ flex: 1 }} />
                <span className="agent-console-meta">
                    {run ? (running ? `${Math.round(run.progress * 100)}%` : `${run.lines.length} steps · done`) : idleText}
                </span>
            </div>
            {running && <ProgressBar value={run.progress} intent="primary" className="agent-console-progress" />}
            {shown && (
            <div className="agent-console-body" ref={ref} style={{ maxHeight }}>
                {!run && <div className="log-line log-info">Waiting to start…</div>}
                {run?.lines.map((l, i) => {
                    const m = LEVEL_ICON[l.level];
                    return (
                        <div key={i} className={`log-line ${m.cls}`}>
                            {!compact && <span className="log-time">{fmtTime(l.t)}</span>}
                            <Icon icon={m.icon} size={12} />
                            <span>{l.text}</span>
                        </div>
                    );
                })}
                {running && <div className="log-line log-cursor">▍</div>}
            </div>
            )}
        </div>
    );
}

export function Kpi({
    label,
    value,
    sub,
    icon,
    intent,
    onClick,
}: {
    label: string;
    value: ReactNode;
    sub?: ReactNode;
    icon: IconName;
    intent?: Intent;
    onClick?: () => void;
}) {
    return (
        <Card className="kpi" interactive={!!onClick} onClick={onClick} compact>
            <div className={`kpi-icon kpi-icon-${intent ?? "none"}`}>
                <Icon icon={icon} size={18} />
            </div>
            <div>
                <div className="kpi-label">{label}</div>
                <div className="kpi-value">{value}</div>
                {sub && <div className="kpi-sub">{sub}</div>}
            </div>
        </Card>
    );
}

export function HitlBanner({
    title,
    children,
    actions,
    intent = "warning",
    icon = "hand",
    tour,
}: {
    title: string;
    children?: ReactNode;
    actions?: ReactNode;
    intent?: Intent;
    icon?: IconName;
    tour?: string;
}) {
    return (
        <div className={`hitl-banner hitl-${intent}`} data-tour={tour}>
            <Icon icon={icon} size={18} />
            <div className="hitl-text">
                <div className="hitl-title">{title}</div>
                {children && <div className="hitl-body">{children}</div>}
            </div>
            {actions && <div className="hitl-actions">{actions}</div>}
        </div>
    );
}

export function Labeled({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="labeled">
            <div className="labeled-label">{label}</div>
            <div className="labeled-value">{children}</div>
        </div>
    );
}
