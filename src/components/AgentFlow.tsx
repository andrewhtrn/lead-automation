import { Fragment, type ReactNode } from "react";
import { Icon, Spinner } from "@blueprintjs/core";
import type { AgentStageId } from "../types";
import { STAGES } from "../engine/pipeline";

export type FlowNodeState = "locked" | "running" | "complete" | "idle";

/**
 * Horizontal six-agent pipeline. Connectors carry an animated "packet" while the downstream
 * agent is working, so you can watch a lead move from agent to agent.
 */
export function AgentFlow({
    states,
    sub,
    selected,
    onSelect,
    below,
    size = "regular",
    tour,
}: {
    states: Record<AgentStageId, FlowNodeState>;
    sub?: Partial<Record<AgentStageId, ReactNode>>;
    selected?: AgentStageId;
    onSelect?: (id: AgentStageId) => void;
    below?: (id: AgentStageId) => ReactNode;
    size?: "regular" | "large";
    tour?: string;
}) {
    return (
        <div className={`agent-flow agent-flow-${size}`} data-tour={tour} role={onSelect ? "tablist" : undefined}>
            {STAGES.map((s, i) => {
                const st = states[s.id];
                const next = STAGES[i + 1];
                const nst = next ? states[next.id] : undefined;
                const link = st === "complete" && nst === "running" ? "flowing" : st === "complete" && nst === "complete" ? "done" : st === "running" || nst === "running" ? "flowing" : "idle";
                return (
                    <Fragment key={s.id}>
                        <div className="af-col">
                            <button
                                className={`af-node af-${st} ${selected === s.id ? "af-selected" : ""}`}
                                onClick={onSelect ? () => onSelect(s.id) : undefined}
                                disabled={!onSelect}
                                role={onSelect ? "tab" : undefined}
                                aria-selected={onSelect ? selected === s.id : undefined}
                                data-tour={`stage-${s.id}`}
                            >
                                <span className="af-icon">
                                    {st === "running" && <span className="af-halo" />}
                                    <Icon icon={s.icon} size={size === "large" ? 18 : 16} />
                                    {st === "complete" && (
                                        <span className="af-check">
                                            <Icon icon="tick" size={9} />
                                        </span>
                                    )}
                                </span>
                                <span className="af-text">
                                    <span className="af-label">
                                        <span className="af-num">{i + 1}</span> {s.label}
                                    </span>
                                    <span className="af-agent">{s.agent}</span>
                                    <span className="af-sub">
                                        {sub?.[s.id] ??
                                            (st === "running" ? (
                                                <>
                                                    <Spinner size={10} /> Working…
                                                </>
                                            ) : st === "complete" ? (
                                                "Complete"
                                            ) : st === "idle" ? (
                                                "Idle"
                                            ) : (
                                                "Waiting"
                                            ))}
                                    </span>
                                </span>
                            </button>
                            {below && <div className="af-below">{below(s.id)}</div>}
                        </div>
                        {next && (
                            <span className={`af-link af-link-${link}`} aria-hidden>
                                <i />
                                <i />
                            </span>
                        )}
                    </Fragment>
                );
            })}
        </div>
    );
}
