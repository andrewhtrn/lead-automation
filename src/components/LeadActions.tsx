import { useState } from "react";
import { Button, Callout, FormGroup, HTMLSelect, InputGroup, TextArea } from "@blueprintjs/core";
import { agentById, LISTINGS, listingById } from "../data/directory";
import { displayName, isProcessing } from "../engine/pipeline";
import { useStore } from "../state/store";
import type { Lead } from "../types";
import { Panel } from "./Panel";

export function LeadActions({ lead }: { lead: Lead }) {
    const { actions } = useStore();
    const [showInvite, setShowInvite] = useState(false);
    const [recipient, setRecipient] = useState(lead.contact?.email ?? "");
    const [subject, setSubject] = useState(`Showing${listingById(lead.profile.listingId) ? `: ${listingById(lead.profile.listingId)!.address}` : ""}`);
    const [body, setBody] = useState(`Hi ${lead.contact?.first ?? displayName(lead).split(" ")[0]},\n\nI'd love to show you the property. Please let me know if this time works for you.\n\n${agentById(lead.assigneeId)?.name ?? "Your agent"}`);
    const [listingId, setListingId] = useState(lead.profile.listingId ?? "");
    const [startsAt, setStartsAt] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const busy = isProcessing(lead) || !!lead.pendingSignal || !lead.strategy || !lead.contact;
    const recent = (lead.actionHistory ?? []).slice(0, 3);
    const submit = () => {
        if (!recipient.trim() || !subject.trim() || !body.trim() || !listingId || !startsAt) { setError("Complete all fields to record a showing invite."); return; }
        if (actions.recordShowingInvite(lead.id, { kind: "invite", recipient, subject, body, listingId, startsAt })) { setShowInvite(false); setError(""); setMessage("Showing invite recorded in the demo. No invitation was sent."); }
        else setError("Wait for processing to finish and check the date and time.");
    };
    return <Panel id={`lead-actions-${lead.id}`} title="Actions Center" icon="take-action" subtitle="Simulated actions" collapsible={false} padded tour="lead-actions">
        <p className="cell-muted action-center-intro">Choose an action to review and edit before recording it.</p>
        <div className="lead-action-grid">
            <Button icon="envelope" text="Write email" alignText="left" onClick={() => actions.openLeadAction(lead.id, "email")} disabled={busy} data-tour="action-email" />
            <Button icon="phone" text="Call lead" alignText="left" onClick={() => actions.openLeadAction(lead.id, "call")} disabled={busy} />
            <Button icon="chat" text="Send text" alignText="left" onClick={() => actions.openLeadAction(lead.id, "sms")} disabled={busy} />
            <Button icon="calendar" text="Calendar invite" alignText="left" onClick={() => { if (!recipient) setRecipient(lead.contact?.email ?? ""); setShowInvite(v => !v); setError(""); setMessage(""); }} disabled={busy} />
            <Button icon="document-share" text="Share documents" alignText="left" onClick={() => actions.openLeadAction(lead.id, "document")} disabled={busy || !lead.strategy?.documents.length} />
        </div>
        {busy && <p className="cell-muted">Available when the agents finish processing.</p>}
        {message && <Callout compact intent="success" className="action-feedback">{message}</Callout>}
        {showInvite && <div className="invite-form"><div className="cell-strong invite-title">Showing invitation</div><FormGroup label="Invitee" labelFor="invite-recipient"><InputGroup id="invite-recipient" value={recipient} placeholder="Name or email" onChange={e => setRecipient(e.currentTarget.value)} /></FormGroup><FormGroup label="Subject" labelFor="invite-subject"><InputGroup id="invite-subject" value={subject} onChange={e => setSubject(e.currentTarget.value)} /></FormGroup><FormGroup label="Property" labelFor="invite-property"><HTMLSelect fill id="invite-property" value={listingId} onChange={e => setListingId(e.currentTarget.value)} options={[{ label: "Select a property", value: "" }, ...LISTINGS.map(l => ({ label: l.address, value: l.id }))]} /></FormGroup><FormGroup label="Date and time" labelFor="invite-time"><InputGroup id="invite-time" type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.currentTarget.value)} /></FormGroup><FormGroup label="Message" labelFor="invite-body"><TextArea id="invite-body" fill rows={5} value={body} onChange={e => setBody(e.currentTarget.value)} /></FormGroup>{error && <Callout compact intent="warning">{error}</Callout>}<div className="invite-buttons"><Button small text="Cancel" onClick={() => setShowInvite(false)} /><Button small intent="primary" icon="calendar" text="Record invite" disabled={busy} onClick={submit} /></div><p className="cell-muted">Simulated: no calendar invitation is sent.</p></div>}
        {recent.length > 0 && <div className="action-history"><div className="cell-strong">Recent simulated actions</div>{recent.map(a => <details key={a.id}><summary>{a.kind === "invite" ? "Showing invite" : a.kind === "sms" ? "Text" : "Email"} · {a.subject}</summary><div className="cell-muted">To: {a.recipient}{a.kind === "invite" && <> · {listingById(a.listingId)?.address} · {a.startsAt && new Date(a.startsAt).toLocaleString()}</>}</div><p>{a.body}</p></details>)}</div>}
    </Panel>;
}
