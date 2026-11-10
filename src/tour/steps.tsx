import type { ReactNode } from "react";
import type { IconName } from "@blueprintjs/core";
import type { AppState, StoreActions } from "../state/store";

export interface TourCtx { state: AppState; actions: StoreActions; mem: Record<string, unknown> }
export interface TourStep {
    id: string; chapter: string; icon?: IconName; title: string; body: ReactNode;
    target?: string; placement?: "right" | "left" | "top" | "bottom";
    enter?: (ctx: TourCtx) => void; ready?: (ctx: TourCtx) => boolean; waitLabel?: string;
    click?: { label: string; run: (ctx: TourCtx) => void };
}
const lead = (c: TourCtx) => c.state.leads.find(l => l.id === c.mem.leadId);
const openLead = (c: TourCtx) => { const l = lead(c); if (l) c.actions.navigate({ name: "lead", id: l.id }); };

export const TOUR_STEPS: TourStep[] = [
    { id: "welcome", chapter: "Welcome", icon: "hand", title: "A clearer way to work your leads", body: <>Follow a fictional inquiry from intake to recommended action. The agents, people and activity are simulated and run entirely on your computer.</>, enter: c => c.actions.navigate({ name: "leads" }) },
    { id: "navigation", chapter: "Your workspace", icon: "menu", target: "nav", placement: "bottom", title: "Three focused views", body: "Work the priority-ranked inbox, explore property interest, or see every person's progress in the funnel." },
    { id: "summary", chapter: "Lead inbox", icon: "dashboard", target: "inbox-summary", placement: "bottom", title: "A quick pulse on your pipeline", body: "See your lead count, urgent actions, and illustrative expected revenue. The revenue estimate is explained on each lead." },
    { id: "inbox", chapter: "Lead inbox", icon: "inbox", target: "inbox-list", placement: "top", title: "The most important work first", body: "Leads are ordered by their highest-priority open task. Each row shows the funnel status, next action and estimated revenue; select anyone to see the details." },
    { id: "simulate", chapter: "Live lead", icon: "new-person", target: "simulate", placement: "bottom", title: "Let's bring in a lead", body: "We'll simulate a Zillow inquiry from Rachel, a buyer interested in a Cedar Park home. The agents will work through her inquiry in real time.", click: { label: "Simulate lead", run: c => { c.mem.leadId = c.actions.simulateLead({ featured: "thornton", open: true }); } } },
    { id: "agents", chapter: "Live lead", icon: "predictive-analysis", target: "lead-flow", placement: "bottom", title: "Watch the agents work", body: "Six simulated agents receive, normalize, enrich, qualify and plan the next steps. The glowing node, moving connectors and activity log show their progress.", enter: openLead },
    { id: "qualify", chapter: "Qualification", icon: "horizontal-bar-chart", target: "qualification", placement: "top", title: "A score you can explain", body: "The score combines weighted factors such as timeline, financing and engagement. Confidence is separate. Expand the factors to see evidence and its source.", enter: openLead, ready: c => !!lead(c)?.qualification, waitLabel: "Waiting for qualification…" },
    { id: "recommend", chapter: "Next action", icon: "lightbulb", target: "recommendation", placement: "bottom", title: "A recommendation with reasons", body: "The highest-priority open action appears here with the evidence and urgency behind it. The button opens a simulated action, with a script or draft when relevant.", enter: openLead, ready: c => !!lead(c) && c.state.tasks.some(t => t.leadId === lead(c)?.id && t.status === "open"), waitLabel: "Planning the next action…" },
    { id: "actions", chapter: "Actions Center", icon: "take-action", target: "action-email", placement: "left", title: "Choose an action", body: "Write an email, call, send a text, prepare a calendar invite, or share documents. Let's open an email draft.", enter: openLead, ready: c => !!lead(c) && lead(c)?.stages.plan === "complete", click: { label: "Write email", run: c => { const l = lead(c); if (l) c.actions.openLeadAction(l.id, "email"); } } },
    { id: "draft", chapter: "Actions Center", icon: "edit", target: "ad-body", placement: "left", title: "Review and edit the draft", body: "Edit the subject and message before recording the simulated action. Calendar invitations also let you choose a recipient, property, and time. Nothing is actually sent.", ready: c => !!c.state.actionTaskId },
    { id: "revenue", chapter: "Opportunity", icon: "dollar", target: "revenue", placement: "left", title: "Expected revenue, explained", body: "This is estimated gross commission multiplied by an illustrative conversion probability. It is a demo assumption, not a prediction or a guaranteed fee.", enter: c => { c.actions.openAction(null); openLead(c); } },
    { id: "properties", chapter: "Properties", icon: "home", target: "properties", placement: "bottom", title: "Explore interest by listing", body: "See direct inquiries and suggested matches for each property, then open a lead to take the next step.", enter: c => c.actions.navigate({ name: "properties" }) },
    { id: "funnel", chapter: "Funnel", icon: "flow-linear", target: "funnel", placement: "top", title: "Follow every relationship", body: "See each person's simulated stage and next action in one place. As calls and showings are logged, the lead's stage updates.", enter: c => c.actions.navigate({ name: "funnel" }) },
    { id: "done", chapter: "Your turn", icon: "endorsed", title: "Ready to explore", body: <>Try another lead, log a simulated action, or add new information on a lead profile. You can restart this walkthrough from the top bar.</>, enter: c => c.actions.navigate({ name: "leads" }) },
];
