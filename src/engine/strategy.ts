// Strategy Agent: turns facts + qualification into evidence-cited reasoning and personalized
// conversion assets (call script, email, SMS, discovery questions, documents, tour suggestions).
import type { DocShare, Evidence, Lead, Listing, Strategy, TourSuggestion } from "../types";
import { agentById, BROKERAGE, LISTINGS, listingById, SOURCES } from "../data/directory";
import { fmtDateTime, nextWeekday, usdShort } from "../lib/format";
import { engagementIndex } from "./scoring";

const SLOTS = () => [nextWeekday(6, 10), nextWeekday(6, 11, 30), nextWeekday(0, 13), nextWeekday(2, 17, 30)];

/** Rank inventory against what we know about the lead. */
export function matchListings(lead: Lead): TourSuggestion[] {
    const f = lead.facts;
    const cap = f.preApprovalAmount ?? f.budgetMax;
    const asked = lead.profile.listingId;
    const slots = SLOTS();
    const scored = LISTINGS.map(l => {
        const reasons: string[] = [];
        let s = 50;
        if (l.id === asked) {
            s += 30;
            reasons.push("Property they asked about");
        }
        if (cap) {
            const r = l.price / cap;
            if (r <= 1.02 && r >= 0.7) {
                s += 18;
                reasons.push(`Within budget (${usdShort(l.price)} of ${usdShort(cap)})`);
            } else if (r > 1.1) s -= 35;
            else if (r < 0.6) s -= 15;
        } else if (f.preApproval === "cash") s += 5;
        if (f.areas.includes(l.area)) {
            s += 12;
            reasons.push(`In preferred area (${l.area})`);
        }
        if (f.beds) {
            if (l.beds >= f.beds) {
                s += 8;
                reasons.push(`${l.beds} beds meets ${f.beds}+ need`);
            } else s -= 20;
        }
        if (f.intent === "invest" && l.features.some(x => /STR|ADU|Duplex/i.test(x))) {
            s += 15;
            reasons.push("Income potential (STR/ADU)");
        }
        if (f.householdSize && f.householdSize >= 4 && l.features.some(x => /ISD/.test(x))) {
            s += 6;
            reasons.push(`Strong schools (${l.features.find(x => /ISD/.test(x))})`);
        }
        if (/no hoa/i.test(f.motivation ?? "") && !l.hoa) {
            s += 10;
            reasons.push("No HOA, matches stated preference");
        }
        if (l.status === "Price reduced") reasons.push("Recent price reduction");
        return { l, s: Math.max(5, Math.min(99, s)), reasons };
    })
        .filter(x => x.s >= 55)
        .sort((a, b) => b.s - a.s)
        .slice(0, 3);
    return scored.map((x, i) => ({ listingId: x.l.id, match: x.s, reasons: x.reasons.slice(0, 3), slot: fmtDateTime(slots[i] ?? slots[0]) }));
}

function documents(lead: Lead, l?: Listing): DocShare[] {
    const f = lead.facts;
    const out: DocShare[] = [];
    if (l) out.push({ id: "comps", title: `Comparable sales: ${l.address}`, why: "Anchors price expectations before the first showing", kind: "report" });
    if (f.preApproval === "none" || f.preApproval === "unknown")
        out.push({ id: "preapproval", title: "Pre-approval checklist + preferred lender intro", why: "Financing is the biggest gap in this lead's profile", kind: "pdf" });
    if (f.preApproval === "stated") out.push({ id: "verify-pa", title: "Secure pre-approval upload link", why: "Turn a stated pre-approval into a verified one", kind: "link" });
    if (/relocat/i.test(f.motivation ?? "")) out.push({ id: "relo", title: `Relocation guide: ${l?.city ?? "Austin metro"} schools, commutes & neighborhoods`, why: "Relocating buyers decide on area before house", kind: "pdf" });
    if (l?.hoa) out.push({ id: "hoa", title: `HOA summary & fees for ${l.address}`, why: lead.profile.message.toLowerCase().includes("hoa") ? "They asked about the HOA directly" : "Common question for this property", kind: "pdf" });
    if (f.sellerAddress) out.push({ id: "cma", title: `CMA & seller net sheet: ${f.sellerAddress}`, why: "Shows equity and makes the listing conversation concrete", kind: "report" });
    if (f.intent === "invest") out.push({ id: "proforma", title: `Investor pro-forma (STR + long-term rent)${l ? `: ${l.address}` : ""}`, why: "Investors decide on returns, not finishes", kind: "report" });
    if (f.housing === "owner-must-sell" && f.intent !== "invest") out.push({ id: "bridge", title: "Buy-before-you-sell options (bridge loan, contingency)", why: "Removes the sale-contingency blocker", kind: "pdf" });
    if (/first-time/i.test(f.motivation ?? "")) out.push({ id: "ftb", title: "First-time buyer roadmap + down-payment assistance", why: "Lead said they're still learning the process", kind: "pdf" });
    if (!out.length) out.push({ id: "market", title: `${f.areas[0] ?? "Austin"} market snapshot (30-day)`, why: "Low-commitment value touch", kind: "report" });
    return out.slice(0, 5);
}

export function buildStrategy(lead: Lead): Strategy {
    const f = lead.facts;
    const q = lead.qualification!;
    const c = lead.contact!;
    const l = listingById(lead.profile.listingId);
    const src = SOURCES[lead.raw.source];
    const agent = agentById(lead.assigneeId) ?? agentById("skim")!;
    const first = c.first;
    const p = lead.provenance;
    const eng = engagementIndex(lead);

    // --- Evidence --------------------------------------------------------------------
    const ev: Evidence[] = [];
    const cite = (k: keyof typeof p) => p[k]?.source ?? src.label;
    if (f.tourRequested) ev.push({ text: `Requested a tour${p.tourRequested ? `: ${p.tourRequested.detail}` : ""}`, cite: cite("tourRequested"), tone: "positive" });
    if (f.timeline !== "unknown") ev.push({ text: `Timeline ${f.timeline === "6+" ? "6+ months" : `${f.timeline} months`}${p.timeline ? `: ${p.timeline.detail}` : ""}`, cite: cite("timeline"), tone: f.timeline === "0-1" || f.timeline === "1-3" ? "positive" : "neutral" });
    if (f.preApproval === "verified") ev.push({ text: `Pre-approval verified${f.preApprovalAmount ? ` at ${usdShort(f.preApprovalAmount)}` : ""}${l && f.preApprovalAmount ? `, ${f.preApprovalAmount >= l.price ? "covers" : "below"} the ${usdShort(l.price)} list price` : ""}`, cite: cite("preApproval"), tone: "positive" });
    else if (f.preApproval === "cash") ev.push({ text: p.preApproval?.detail ?? "Cash purchase", cite: cite("preApproval"), tone: "positive" });
    else if (f.preApproval === "stated") ev.push({ text: `Says they're pre-approved but it's unverified${p.preApproval ? `: ${p.preApproval.detail}` : ""}`, cite: cite("preApproval"), tone: "neutral" });
    else if (f.preApproval === "none") ev.push({ text: "No lender conversation yet", cite: cite("preApproval"), tone: "negative" });
    if (f.motivation) ev.push({ text: `Motivation: ${f.motivation}`, cite: cite("motivation"), tone: "positive" });
    if (eng > 0) ev.push({ text: `Engagement index ${eng}/100: ${lead.behavior.listingViews} listing views, ${lead.behavior.savedHomes} saved homes over ${lead.behavior.sessions} sessions`, cite: p.behavior?.source ?? "Website analytics (simulated)", tone: eng >= 50 ? "positive" : "neutral" });
    if (lead.dedupe?.matched) ev.push({ text: `Known contact since ${lead.dedupe.since}; history merged`, cite: "CRM dedupe", tone: "neutral" });
    if (f.sellerAddress) ev.push({ text: `Owns ${f.sellerAddress}, a potential listing`, cite: cite("sellerAddress"), tone: "positive" });
    if (f.workingWithAgent) ev.push({ text: "Reported working with another agent", cite: cite("workingWithAgent"), tone: "negative" });
    if (!f.emailValid) ev.push({ text: "Email address undeliverable", cite: "Normalization Agent", tone: "negative" });
    if (f.unresponsive) ev.push({ text: `No response to ${f.contactAttempts} touches`, cite: "Engagement tracking", tone: "negative" });

    // --- Risks -----------------------------------------------------------------------
    const risks: string[] = [];
    if (f.preApproval === "stated") risks.push("Pre-approval is self-reported. Verify before writing offers.");
    if (f.preApproval === "none" || f.preApproval === "unknown") risks.push("No financing in place. Tours before pre-approval often stall.");
    if (f.housing === "owner-must-sell") risks.push("Purchase depends on selling their current home. Plan for a contingency or bridge loan.");
    if (f.workingWithAgent) risks.push("Possible existing buyer-broker agreement. Confirm before soliciting (NAR Article 16).");
    if (src.id === "zillow" || src.id === "realtor") risks.push(`${src.label} leads often inquire with several agents. Speed to lead decides who wins.`);
    if (f.householdSize && f.householdSize > 1 && !lead.signals.some(s => s.signalId === "cobuyer")) risks.push("Only one decision maker engaged so far.");
    if (f.timeline === "6+") risks.push("Long horizon. Over-contacting may cause an unsubscribe.");
    if (!f.emailValid) risks.push("Email bounced. Rely on phone/text.");

    // --- Headline + next best action -------------------------------------------------
    const speed = q.grade === "Hot" ? "within 5 minutes" : q.grade === "Warm" ? "within the hour" : "today";
    const headline =
        q.grade === "Hot"
            ? `High-intent ${f.intent === "invest" ? "investor" : f.intent === "buy-sell" ? "move-up client" : "buyer"} with ${f.preApproval === "verified" || f.preApproval === "cash" ? "financing in place" : "a clear timeline"}. Call ${speed}.`
            : q.grade === "Warm"
              ? `Qualified ${f.intent === "buy-sell" ? "buy + sell opportunity" : "prospect"} with real intent and gaps to close: ${[f.preApproval !== "verified" && f.preApproval !== "cash" && "financing", f.timeline === "unknown" && "timeline", !f.tourRequested && "a showing"].filter(Boolean).join(", ") || "next step"}.`
              : q.grade === "Nurture"
                ? "Early-stage lead. Build trust with value-first touches and qualify gently."
                : f.workingWithAgent
                  ? "Likely represented. Verify agency before investing time."
                  : "Low signal so far. Automate nurture and watch for new engagement.";
    const nextBestAction =
        f.workingWithAgent
            ? "Send a courteous note confirming whether they have representation. No hard sell."
            : f.tourScheduled
              ? `Confirm the ${f.tourScheduled} showing and send a pre-tour packet.`
              : q.grade === "Hot"
                ? `${c.preferredChannel === "text" ? "Text, then call" : "Call"} ${first} ${speed}${f.tourRequested && l ? ` and lock a showing of ${l.address}` : ""}.`
                : q.grade === "Warm"
                  ? `Call ${first} ${speed}; confirm ${f.preApproval === "stated" ? "pre-approval details" : f.preApproval === "none" || f.preApproval === "unknown" ? "financing" : "timeline"} and offer ${l ? "a showing" : "a curated search"}.`
                  : `Enroll in a ${f.areas[0] ?? "local"} market-update drip and send one helpful resource.`;

    // --- Call script -----------------------------------------------------------------
    const opener =
        c.language === "Spanish"
            ? `"¡Hola ${first}! Soy ${agent.name.split(" ")[0]} con ${BROKERAGE.name}. Recibí su mensaje sobre ${l?.address ?? "su búsqueda"}. ¿Tiene un par de minutos?" (Switch to English if they prefer.)`
            : lead.dedupe?.matched
              ? `"Hi ${first}, it's ${agent.name.split(" ")[0]} from ${BROKERAGE.name}. We met back in ${lead.dedupe.since}. Great to hear from you again! I saw your note about ${l?.address ?? "your search"}."`
              : lead.raw.source === "referral"
                ? `"Hi ${first}, ${agent.name.split(" ")[0]} with ${BROKERAGE.name}. Ana Ruiz passed along your info. She's one of our favorite clients. Do you have a few minutes to talk about ${l ? l.address : "what you're looking for"}?"`
                : f.sellerAddress && f.intent !== "buy"
                  ? `"Hi ${first}, this is ${agent.name.split(" ")[0]} with ${BROKERAGE.name}. Thanks for asking about the value of ${f.sellerAddress}. I'm pulling recent sales on your street now."`
                  : `"Hi ${first}, this is ${agent.name.split(" ")[0]} with ${BROKERAGE.name}. You just reached out about ${l?.address ?? "homes in the area"}. Is now a good time?"`;
    const points: string[] = [];
    if (l) points.push(`${l.address}: ${l.beds} bd / ${l.baths} ba · ${l.sqft.toLocaleString()} sqft · ${usdShort(l.price)} · ${l.dom === 0 ? "coming soon" : `${l.dom} days on market`}`);
    if (l) points.push(`Highlight: ${l.features.slice(0, 3).join(", ")}`);
    if (/relocat/i.test(f.motivation ?? "")) points.push("Offer virtual tour + relocation package; ask about the employer's relocation benefit");
    if (f.householdSize && f.householdSize >= 4) points.push("Lead with schools and commute. Family of " + f.householdSize);
    if (f.preApproval === "stated") points.push("Ask them to upload the pre-approval letter so you can write a strong offer");
    if (f.preApproval === "none" || f.preApproval === "unknown") points.push("Offer an intro to a preferred lender. Same-week pre-approval is typical");
    if (f.housing === "owner-must-sell") points.push("Position the brokerage's buy-before-you-sell program");
    if (f.intent === "invest") points.push("Talk returns: STR permits in the 78702 zip, ADU rent comps, cash-close timeline");
    if (f.sellerAddress) points.push(`Book a listing appointment for ${f.sellerAddress}; bring CMA + net sheet`);
    const objections = [
        { q: "“I'm just looking right now.”", a: "Totally fine. Most of my clients start that way. Want me to set up a search so you see new listings before they hit Zillow?" },
        ...(src.id === "zillow" || src.id === "realtor" ? [{ q: "“I already talked to another agent about this home.”", a: "No problem. Have you signed anything with them? If not, I'm happy to show it today. I'm local and know the listing well." }] : []),
        ...(f.preApproval !== "verified" && f.preApproval !== "cash" ? [{ q: "“We'll figure out financing later.”", a: "Sellers here are seeing multiple offers. A pre-approval puts you first in line. I can introduce a lender who turns them around in 24 hours." }] : []),
        ...(f.housing === "owner-must-sell" ? [{ q: "“We can't buy until we sell.”", a: "That's common. We can list yours and line up the next home in parallel, or look at a bridge loan so you only move once." }] : []),
    ];
    const close = f.tourRequested && l ? `"I have ${matchListings(lead)[0]?.slot ?? "Saturday 10 AM"} open for ${l.address}. Shall I lock that in?"` : f.sellerAddress ? `"Can I stop by Tuesday or Wednesday evening to walk through the house and give you a precise number?"` : `"Let me send three homes that fit what you described. If one stands out, we'll go see it this week."`;

    // --- Email + SMS -----------------------------------------------------------------
    const tours = matchListings(lead);
    const subject = l ? (f.tourRequested ? `Your tour of ${l.address}` : `${l.address}: your questions + a few similar homes`) : f.sellerAddress ? `What ${f.sellerAddress.split(",")[0]} could sell for` : `Homes in ${f.areas[0] ?? "Austin"} that match what you're looking for`;
    const emailLines = [
        `Hi ${first},`,
        "",
        lead.raw.source === "referral"
            ? "Thanks so much for reaching out, and please thank Ana for the introduction!"
            : `Thanks for reaching out${l ? ` about ${l.address}` : ""}. I'm ${agent.name.split(" ")[0]}, ${agent.title.toLowerCase()} at ${BROKERAGE.name}.`,
        "",
        ...(l && lead.profile.message.toLowerCase().includes("hoa") && l.hoa ? [`To answer your question: the HOA is $${l.hoa}/month${l.type === "Condo" ? " and covers building insurance, concierge, water and amenities" : " and covers the community pool and common areas"}.`, ""] : []),
        ...(l && lead.profile.message.toLowerCase().includes("dock") ? ["Great question on the dock. It's a deeded slip in a 6-slip community dock, so it's shared but assigned to the home.", ""] : []),
        ...(f.tourRequested && tours[0] ? [`I'd love to show you the home. I have ${tours[0].slot} available, or let me know what works better.`, ""] : []),
        ...(tours.length > 1 ? ["Based on what you've shared, these are worth a look too:", ...tours.filter(t => t.listingId !== l?.id).slice(0, 2).map(t => `  • ${listingById(t.listingId)!.address}, ${usdShort(listingById(t.listingId)!.price)}: ${t.reasons.find(r => !/asked about/i.test(r))?.replace(/^./, c => c.toLowerCase()) ?? "a strong fit"}`), ""] : []),
        ...(f.preApproval === "none" || f.preApproval === "unknown" ? ["If it helps, I can introduce you to a lender we trust. Getting pre-approved takes about a day and makes your offer much stronger.", ""] : []),
        ...(f.sellerAddress ? [`I'm putting together a market analysis for ${f.sellerAddress} with recent sales nearby. I can walk you through it in person or over the phone.`, ""] : []),
        "What's the best time to connect this week?",
        "",
        "Best,",
        agent.name,
        `${BROKERAGE.name} · (512) 555-0100`,
    ];
    const sms =
        c.language === "Spanish"
            ? `Hola ${first}, soy ${agent.name.split(" ")[0]} de ${BROKERAGE.name}. ¡Gracias por su mensaje sobre ${l?.address ?? "su búsqueda"}! ¿Le gustaría verla ${tours[0]?.slot.split(",")[0] ?? "este fin de semana"}?`
            : f.tourRequested && l
              ? `Hi ${first}, ${agent.name.split(" ")[0]} with ${BROKERAGE.name}. Got your request for ${l.address}! I can show it ${tours[0]?.slot ?? "this weekend"}. Does that work?`
              : `Hi ${first}, ${agent.name.split(" ")[0]} with ${BROKERAGE.name}. Thanks for reaching out${l ? ` about ${l.address}` : ""}! Quick question: are you hoping to move in the next few months, or still early in the search?`;

    // --- Discovery questions (target unknown / unverified factors) ---------------------
    const questions: { q: string; why: string }[] = [];
    if (f.timeline === "unknown" || f.timeline === "6+") questions.push({ q: "What's prompting the move, and when would you ideally like to be in your new home?", why: "Timeline is unknown or soft (20 pts at stake)" });
    if (f.preApproval === "unknown" || f.preApproval === "none") questions.push({ q: "Have you had a chance to talk with a lender yet?", why: "Financing is unconfirmed (20 pts at stake)" });
    if (f.preApproval === "stated") questions.push({ q: "Who's your lender, and could you send over the pre-approval letter?", why: "Converts stated → verified, raising confidence" });
    if (!f.budgetMax && !f.preApprovalAmount) questions.push({ q: "What monthly payment feels comfortable for you?", why: "Budget fit can't be scored yet" });
    if (f.housing === "unknown") questions.push({ q: "Are you renting now, or do you have a home you'd need to sell?", why: "Determines contingency risk and a possible listing" });
    if (f.householdSize && f.householdSize > 1) questions.push({ q: "Who else will be part of the decision? Should we include them on the tour?", why: "Engage all decision makers early" });
    if (!f.beds) questions.push({ q: "How many bedrooms do you need, and what are your must-haves?", why: "Improves tour matching" });
    if (src.id === "zillow" || src.id === "realtor" || src.id === "openhouse") questions.push({ q: "Are you working with an agent already?", why: "Required agency check before representation" });
    questions.push({ q: `What would make ${l ? "this home" : "the right home"} a definite yes for you?`, why: "Surfaces motivation and must-haves" });

    return {
        headline,
        evidence: ev,
        risks: risks.slice(0, 4),
        nextBestAction,
        callScript: { opener, talkingPoints: points, objections: objections.slice(0, 3), close },
        email: { subject, body: emailLines.join("\n") },
        sms,
        questions: questions.slice(0, 5),
        documents: documents(lead, l),
        tours,
    };
}
