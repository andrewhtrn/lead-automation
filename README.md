# Lead Automation [Notional]

A fictional real-estate lead management demo built with React, TypeScript, Vite, and Blueprint. It runs locally without credentials, external APIs, or an AI service. Leads, agents, listings, recommendations, and interactions are simulated.

## Run locally

Use Node.js 20.19+ or 22.12+ and npm.

```bash
npm install
npm run dev
```

Open the address shown by Vite (normally http://localhost:5173). Run `npm run build` for a type-checked production build and `npm run lint` for lint checks.

## Using the demo

- **Guided tour** in the top bar walks through the workspace and simulates a lead moving through the animated six-agent workflow. It can be replayed at any time.
- **Lead inbox** ranks leads by the priority of their highest-priority open task. Search for a name, email, or property, and select a lead to see the recommended action, supporting evidence, a score breakdown with sources and confidence, contact details, and estimated revenue. Use the action button to execute a simulated call, message, showing, or other task. Add a simulated update to re-evaluate the lead.
- **Actions Center** on each lead offers editable simulated emails, calls, texts, showing invitations and document sharing. Showing invitations update the lead’s stage after re-evaluation. No message or calendar invitation is sent.
- **Properties** shows listings and their directly interested or agent-matched leads. Select a person to open their profile.
- **Funnel** groups people by their simulated status: processing, new, connected, showing booked, or nurture. Cards show the next open action. Nurture includes disqualified leads.
- **Simulate lead** adds a featured scenario or a random lead. Processing and subsequent interactions update the list and funnel. The menu in the top right resets the demo.

## Expected revenue

Expected revenue is the estimated gross commission multiplied by an illustrative conversion probability. The demo assumes 35% for Hot, 18% for Warm, 6% for Nurture, and 2% for Cold leads; disqualified leads use 0%. These figures are fictional assumptions, not calibrated predictions. A lead awaiting qualification has no estimate. Estimated commission uses a 2.8% rate and a transaction value based on the listing, financing, or budget; buy-and-sell scenarios include an estimated sale value. Values are gross before brokerage splits and costs. The inbox total sums available estimates and excludes unscored leads.

## Architecture

`src/data` contains fictional profiles and listings. `src/engine` contains the deterministic intake, scoring, strategy, task, and event simulation. `src/state/store.tsx` orchestrates the agents and in-memory state. `src/App.tsx` and `src/styles/simple.css` implement the focused workspace; `src/tour` implements the animated walkthrough; Blueprint supplies the interactive components. Changes reset on reload, except theme preference. Outbound actions never leave the demo.
# lead-automation
