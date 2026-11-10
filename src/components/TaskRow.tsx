import { Button, Icon, Tag, Tooltip } from "@blueprintjs/core";
import type { Task } from "../types";
import { useStore } from "../state/store";
import { TASK_KIND_META } from "../engine/tasks";
import { displayName } from "../engine/pipeline";
import { listingById } from "../data/directory";
import { dueLabel, timeAgo } from "../lib/format";
import { AgentAvatar, GradeTag, PriorityBadge } from "./ui";

export function TaskRow({
    task,
    showLead = true,
    selected,
    onSelect,
    tour,
}: {
    task: Task;
    showLead?: boolean;
    selected?: boolean;
    onSelect?: () => void;
    tour?: string;
}) {
    const { state, actions } = useStore();
    const lead = state.leads.find(l => l.id === task.leadId);
    const meta = TASK_KIND_META[task.kind];
    const open = task.status === "open";
    const due = dueLabel(task.dueAt, state.now);
    const l = listingById(task.listingId);
    const flash = task.changedAt && state.now - task.changedAt < 8000;
    return (
        <div
            className={`trow ${selected ? "active" : ""} ${open ? "" : "trow-closed"} ${flash ? "trow-flash" : ""}`}
            onClick={onSelect}
            role={onSelect ? "button" : undefined}
            tabIndex={onSelect ? 0 : undefined}
            data-tour={tour}
            key={task.changedAt}
        >
            {open ? <PriorityBadge task={task} now={state.now} /> : <Icon icon={task.status === "done" ? "tick-circle" : "disable"} className={task.status === "done" ? "log-ok" : "cell-muted"} />}
            <span className={`trow-kind trow-kind-${task.kind}`}>
                <Icon icon={meta.icon as never} size={13} />
            </span>
            <div className="trow-text">
                <div className="trow-title">{task.title}</div>
                <div className="cell-muted trow-meta">
                    {showLead && lead && (
                        <>
                            <b>{displayName(lead)}</b>
                            {" · "}
                        </>
                    )}
                    {l ? `${l.address} · ` : ""}
                    {open ? (
                        <span className={due.overdue ? "text-danger" : due.soon ? "text-warning" : ""}>{due.text}</span>
                    ) : (
                        <span>
                            {task.outcome ?? task.status} · {timeAgo(task.completedAt ?? task.createdAt, state.now)}
                        </span>
                    )}
                    {open && task.priority.reasons[0] && <span className="trow-why"> · {task.priority.reasons[0]}</span>}
                </div>
            </div>
            {showLead && lead?.qualification && <GradeTag grade={lead.qualification.grade} />}
            <AgentAvatar id={task.assigneeId} size={22} />
            {open && (
                <Tooltip content={meta.verb} compact>
                    <Button
                        size="small"
                        intent={task.priority.band === "P1" ? "primary" : "none"}
                        icon={meta.icon as never}
                        text={meta.label}
                        onClick={e => {
                            e.stopPropagation();
                            actions.openAction(task.id);
                        }}
                    />
                </Tooltip>
            )}
            {!open && task.status === "superseded" && (
                <Tag minimal round>
                    Superseded
                </Tag>
            )}
        </div>
    );
}
