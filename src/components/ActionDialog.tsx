import { useEffect, useState } from "react";
import { Button, Checkbox, Classes, Dialog, Icon, InputGroup, Radio, RadioGroup, Tag, TextArea } from "@blueprintjs/core";
import { useStore } from "../state/store";
import { CALL_OUTCOMES } from "../engine/signals";
import { TASK_KIND_META } from "../engine/tasks";
import { agentById, listingById } from "../data/directory";
import { usdShort } from "../lib/format";
import { GradeTag, PriorityBadge } from "./ui";

/** Executes a task. Every outbound action is simulated: nothing is actually sent. */
export function ActionDialog({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
    const { state, actions } = useStore();
    const task = state.tasks.find(t => t.id === taskId);
    const lead = task && state.leads.find(l => l.id === task.leadId);
    const s = lead?.strategy;
    const [body, setBody] = useState("");
    const [subject, setSubject] = useState("");
    const [docs, setDocs] = useState<string[]>([]);
    const [tour, setTour] = useState("");
    const [callState, setCallState] = useState<"idle" | "dialing" | "live" | "ended">("idle");
    const [secs, setSecs] = useState(0);
    const [outcome, setOutcome] = useState("");
    const [note, setNote] = useState("");

    useEffect(() => {
        if (!task || !s) return;
        setBody(task.kind === "sms" ? (task.key === "tour-confirm" ? `Hi ${lead!.contact!.first}, confirming our showing ${lead!.facts.tourScheduled}. I'll meet you out front. Reply C to confirm!` : task.key === "reengage" ? `Hi ${lead!.contact!.first}, two new homes just hit in ${lead!.facts.areas[0] ?? "your area"} that match your search. Want me to send them over?` : s.sms) : task.key === "lender" ? `Hi ${lead!.contact!.first},\n\nAs promised, I'd like to introduce you to Jamie at Lakeline Mortgage (simulated). Jamie can get you pre-approved in about 24 hours. I've cc'd them here.\n\nBest,\n${agentById(task.assigneeId)?.name}` : s.email.body);
        setSubject(task.key === "lender" ? "Intro: Lakeline Mortgage pre-approval" : s.email.subject);
        setDocs(s.documents.map(d => d.id));
        setTour(s.tours[0] ? `${s.tours[0].listingId}|${s.tours[0].slot}` : "");
        setCallState("idle");
        setSecs(0);
        setOutcome("");
        setNote("");
    }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (callState === "dialing") {
            const t = setTimeout(() => setCallState("live"), 1600);
            return () => clearTimeout(t);
        }
        if (callState === "live") {
            const t = setInterval(() => setSecs(x => x + 1), 1000);
            return () => clearInterval(t);
        }
    }, [callState]);

    if (!task || !lead || !s) return <Dialog isOpen={false} onClose={onClose} />;
    const c = lead.contact!;
    const meta = TASK_KIND_META[task.kind];
    const done = (p: Parameters<typeof actions.executeTask>[1] = {}) => {
        actions.executeTask(task.id, p);
        onClose();
    };
    const mmss = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

    return (
        <Dialog isOpen={!!task} onClose={onClose} title={task.title} icon={meta.icon as never} className="action-dialog" style={{ width: task.kind === "call" ? 860 : 680 }}>
            <div className={Classes.DIALOG_BODY} data-tour="ad-body">
                <div className="ad-lead">
                    <span className="person-avatar" style={{ background: "var(--panel-3)", color: "var(--text)", width: 34, height: 34 }}>
                        {c.first[0]}
                        {c.last[0]}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="cell-strong">{c.name}</div>
                        <div className="cell-muted">
                            {c.phone} · {c.email} · prefers {c.preferredChannel}
                            {c.language !== "English" ? ` · ${c.language}` : ""}
                        </div>
                    </div>
                    <GradeTag grade={lead.qualification?.grade} score={lead.qualification?.score} />
                    <PriorityBadge task={task} />
                </div>

                {task.kind === "call" && (
                    <div className="ad-call">
                        <div className="ad-script">
                            <div className="ad-h">
                                <Icon icon="manually-entered-data" size={12} /> Agent-drafted call script
                            </div>
                            <p className="ad-opener">{s.callScript.opener}</p>
                            <div className="ad-sub">Talking points</div>
                            <ul>
                                {s.callScript.talkingPoints.map((t, i) => (
                                    <li key={i}>{t}</li>
                                ))}
                            </ul>
                            <div className="ad-sub">Ask</div>
                            <ul>
                                {s.questions.slice(0, 4).map((q, i) => (
                                    <li key={i}>{q.q}</li>
                                ))}
                            </ul>
                            <div className="ad-sub">Close</div>
                            <p>{s.callScript.close}</p>
                        </div>
                        <div className="ad-dialer">
                            <div className={`dialer dialer-${callState}`}>
                                <div className="dialer-ring">
                                    <Icon icon="phone" size={22} />
                                </div>
                                <div className="dialer-name">{c.name}</div>
                                <div className="dialer-num mono">{c.phone}</div>
                                <div className="dialer-state">
                                    {callState === "idle" ? "Ready (simulated dialer)" : callState === "dialing" ? "Dialing…" : callState === "live" ? `Connected · ${mmss}` : `Call ended · ${mmss}`}
                                </div>
                                {callState === "idle" && <Button intent="success" icon="phone" text="Start call" large onClick={() => setCallState("dialing")} />}
                                {(callState === "dialing" || callState === "live") && <Button intent="danger" icon="cross" text="End call" onClick={() => setCallState("ended")} />}
                            </div>
                            <div className="ad-sub">Log outcome. Agents re-qualify from it.</div>
                            <div className="outcome-grid">
                                {CALL_OUTCOMES.map(o => (
                                    <button key={o.id} className={`outcome ${outcome === o.id ? "active" : ""} outcome-${o.intent}`} onClick={() => setOutcome(o.id)}>
                                        <Icon icon={o.icon} size={14} />
                                        <span>{o.label}</span>
                                    </button>
                                ))}
                            </div>
                            <TextArea fill rows={2} placeholder="Notes (optional)" value={note} onChange={e => setNote(e.currentTarget.value)} />
                        </div>
                    </div>
                )}

                {(task.kind === "email" || task.kind === "sms") && (
                    <div className="ad-compose">
                        {task.kind === "email" && (
                            <>
                                <div className="ad-field">
                                    <span>To</span>
                                    <span className="mono">{c.email}</span>
                                </div>
                                <div className="ad-field">
                                    <span>Subject</span>
                                    <InputGroup fill value={subject} onChange={e => setSubject(e.currentTarget.value)} />
                                </div>
                            </>
                        )}
                        {task.kind === "sms" && (
                            <div className="ad-field">
                                <span>To</span>
                                <span className="mono">{c.phone}</span>
                            </div>
                        )}
                        <TextArea fill rows={task.kind === "sms" ? 4 : 14} className="mono-area" value={body} onChange={e => setBody(e.currentTarget.value)} />
                        <div className="cell-muted ad-note">
                            <Icon icon="predictive-analysis" size={12} /> Drafted by Strategy Agent from the inquiry, enrichment and matched inventory. Edit freely. {task.kind === "sms" ? `${body.length} chars` : ""}
                        </div>
                    </div>
                )}

                {task.kind === "tour" && (
                    <RadioGroup selectedValue={tour} onChange={e => setTour(e.currentTarget.value)} className="ad-tours">
                        {s.tours.map(t => {
                            const l = listingById(t.listingId)!;
                            return (
                                <Radio key={t.listingId} value={`${t.listingId}|${t.slot}`} className="ad-tour">
                                    <div className="ad-tour-body">
                                        <div className="cell-strong">
                                            {l.address} <span className="cell-muted">· {usdShort(l.price)} · {l.beds}bd/{l.baths}ba</span>
                                        </div>
                                        <div className="cell-muted">
                                            <Icon icon="time" size={11} /> {t.slot} · {t.reasons.join(" · ")}
                                        </div>
                                    </div>
                                    <Tag minimal round intent={t.match >= 85 ? "success" : "primary"}>
                                        {t.match}% match
                                    </Tag>
                                </Radio>
                            );
                        })}
                    </RadioGroup>
                )}

                {task.kind === "document" && (
                    <div className="ad-docs">
                        {s.documents.map(d => (
                            <Checkbox key={d.id} checked={docs.includes(d.id)} onChange={() => setDocs(x => (x.includes(d.id) ? x.filter(y => y !== d.id) : [...x, d.id]))}>
                                <span className="cell-strong">{d.title}</span>
                                <span className="cell-muted"> · {d.why}</span>
                            </Checkbox>
                        ))}
                    </div>
                )}

                {(task.kind === "review" || task.kind === "nurture") && (
                    <div className="ad-review">
                        <p>{task.detail}</p>
                        {task.key === "merge" && lead.dedupe?.history && (
                            <ul>
                                {lead.dedupe.history.map((h, i) => (
                                    <li key={i}>{h}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>
            <div className={Classes.DIALOG_FOOTER}>
                <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                    <span className="cell-muted ad-sim">
                        <Icon icon="lab-test" size={12} /> Simulated: nothing leaves this demo
                    </span>
                    <Button text="Cancel" onClick={onClose} />
                    {task.kind === "call" && <Button intent="primary" icon="tick" text="Log outcome" disabled={!outcome} onClick={() => done({ outcome, note })} />}
                    {task.kind === "email" && <Button intent="primary" icon="send-message" text="Send email" onClick={() => done({ body, subject })} />}
                    {task.kind === "sms" && <Button intent="primary" icon="send-message" text="Send text" onClick={() => done({ body, subject })} />}
                    {task.kind === "tour" && (
                        <Button intent="primary" icon="calendar" text="Book showing" disabled={!tour} onClick={() => done({ listingId: tour.split("|")[0], slot: tour.split("|")[1] })} />
                    )}
                    {task.kind === "document" && <Button intent="primary" icon="document-share" text={`Share ${docs.length} item${docs.length === 1 ? "" : "s"}`} disabled={!docs.length} onClick={() => done()} />}
                    {task.kind === "review" && <Button intent="primary" icon="tick" text={task.key === "merge" ? "Confirm merge" : "Mark verified"} onClick={() => done()} />}
                    {task.kind === "nurture" && <Button intent="primary" icon="automatic-updates" text="Enroll in drip" onClick={() => done()} />}
                </div>
            </div>
        </Dialog>
    );
}
