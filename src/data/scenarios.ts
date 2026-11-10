// Lead scenarios. A profile is the hidden "ground truth" a simulated lead is rendered from:
// what the person writes (stated), what enrichment can discover (enriched) and how they behave later (story).
import type { Facts, LeadProfile, SourceId } from "../types";
import { LISTINGS, listingById } from "./directory";

const base = (p: Omit<LeadProfile, "statedNotes" | "enrichedNotes"> & Partial<Pick<LeadProfile, "statedNotes" | "enrichedNotes">>): LeadProfile => ({
    statedNotes: {},
    enrichedNotes: {},
    ...p,
});

/** Featured scenarios available from the "Simulate lead" menu. The first one drives the guided tour. */
export const FEATURED: LeadProfile[] = [
    base({
        key: "thornton",
        featured: "Relocating buyer requests a tour",
        blurb: "Zillow tour request on a $689k listing. Pre-approved, moving for a new job in 3 weeks.",
        source: "zillow",
        listingId: "L-oakmont",
        first: "Rachel",
        last: "Thornton",
        rawName: "rachel thornton",
        rawEmail: " Rachel.Thornton@Mail.example ",
        rawPhone: "206.555.0148",
        message:
            "Hi! We're relocating from Seattle for my new role at the Apple campus and start Dec 1. Is 2417 Oakmont Ridge still available? We'd love to tour this weekend. We're pre-approved around $725k. Good schools matter a lot to us (2 kids).",
        stated: { intent: "buy", timeline: "0-1", preApproval: "stated", preApprovalAmount: 725_000, budgetMax: 725_000, tourRequested: true, motivation: "Job relocation · starts Dec 1", householdSize: 4, beds: 4, areas: ["Cedar Park"] },
        statedNotes: {
            timeline: "“start Dec 1” · “tour this weekend”",
            preApproval: "“pre-approved around $725k”",
            motivation: "“relocating from Seattle for my new role”",
            tourRequested: "“We'd love to tour this weekend”",
        },
        enriched: { preApproval: "verified", lender: "Lakeline Mortgage (simulated)", housing: "renting", phoneValid: true, emailValid: true },
        enrichedNotes: {
            preApproval: "Lender network match: pre-approval letter on file, $725,000, issued 9 days ago",
            housing: "No Texas property records; Seattle address is a rental (simulated records)",
        },
        behavior: { sessions: 2, listingViews: 3, savedHomes: 1, emailOpens: 0, replies: 0 },
        story: ["sms_reply_tour", "cobuyer", "email_open"],
        preferredChannel: "text",
    }),
    base({
        key: "herrera",
        featured: "Spanish-language family inquiry",
        blurb: "Website form written in Spanish. Family of five, wants 4 beds in Leander. Lease ends soon.",
        source: "website",
        listingId: "L-willowbend",
        first: "Lucía",
        last: "Herrera",
        rawName: "LUCIA HERRERA",
        rawEmail: "lucia.herrera@inbox.example",
        rawPhone: "512 555 0131",
        message:
            "Hola, buscamos una casa de 4 recámaras en Leander para nuestra familia (somos 5). Nuestro contrato de renta termina en febrero. Ya hablamos con un banco y nos pre-aprobaron hasta $540,000. ¿Podemos ver la casa en Willow Bend?",
        stated: { intent: "buy", timeline: "1-3", preApproval: "stated", preApprovalAmount: 540_000, budgetMax: 540_000, beds: 4, householdSize: 5, motivation: "Lease ends in February", areas: ["Leander"] },
        statedNotes: {
            timeline: "“contrato de renta termina en febrero” (lease ends in February)",
            preApproval: "“nos pre-aprobaron hasta $540,000”",
            motivation: "Lease end date stated",
        },
        enriched: { housing: "renting", phoneValid: true, emailValid: true },
        enrichedNotes: { housing: "Current address is an apartment community (simulated records)" },
        behavior: { sessions: 4, listingViews: 5, savedHomes: 2, emailOpens: 0, replies: 0 },
        story: ["sms_reply_tour", "preapproval_upload", "saved_homes"],
        preferredChannel: "text",
        language: "Spanish",
        translation:
            "Hello, we are looking for a 4-bedroom house in Leander for our family (there are 5 of us). Our rental lease ends in February. We already spoke with a bank and were pre-approved up to $540,000. Can we see the house in Willow Bend?",
    }),
    base({
        key: "brooks",
        featured: "Vague Facebook ad lead",
        blurb: "Lead Ads form that says “just browsing.” No listing, thin data. Watch it warm up as new signals arrive.",
        source: "facebook",
        first: "Tyler",
        last: "Brooks",
        rawName: "tyler b",
        rawEmail: "TBROOKS88@MAIL.EXAMPLE",
        rawPhone: "5125550199",
        message: "",
        formExtras: { "When are you looking to buy?": "Just browsing", "Price range": "$300-400k", "Preferred area": "Round Rock / Pflugerville" },
        stated: { intent: "buy", timeline: "6+", budgetMin: 300_000, budgetMax: 400_000, areas: ["Round Rock"] },
        statedNotes: { timeline: "Form answer: “Just browsing”", budgetMax: "Form answer: “$300-400k”" },
        enriched: { phoneValid: true, emailValid: true, housing: "renting" },
        enrichedNotes: { housing: "Renter per simulated records" },
        behavior: { sessions: 1, listingViews: 1, savedHomes: 0, emailOpens: 0, replies: 0 },
        story: ["saved_homes", "listing_revisit", "preapproval_upload", "sms_reply_tour"],
        preferredChannel: "text",
    }),
    base({
        key: "hayes",
        featured: "Seller valuation request",
        blurb: "Downsizing couple asks what their Round Rock home is worth. A listing opportunity, plus a buy-side move.",
        source: "website",
        first: "Linda",
        last: "Hayes",
        rawName: "Linda & Carl Hayes",
        rawEmail: "lhayes@mail.example",
        rawPhone: "(512) 555-0176",
        message:
            "We're thinking about downsizing next spring now that the kids are grown. What would our home at 1418 Brushy Creek Rd, Round Rock be worth? We'd probably want something smaller nearby, maybe a townhome.",
        stated: { intent: "buy-sell", timeline: "3-6", housing: "owner", sellerAddress: "1418 Brushy Creek Rd, Round Rock", motivation: "Downsizing · empty nesters", householdSize: 2, areas: ["Round Rock"] },
        statedNotes: { timeline: "“next spring”", sellerAddress: "“our home at 1418 Brushy Creek Rd”", motivation: "“downsizing … kids are grown”" },
        enriched: { phoneValid: true, emailValid: true, sellerAddress: "1418 Brushy Creek Rd, Round Rock" },
        enrichedNotes: { sellerAddress: "County records: owned since 2003, no recorded mortgage. Est. equity $610k (simulated)" },
        behavior: { sessions: 3, listingViews: 4, savedHomes: 1, emailOpens: 0, replies: 0 },
        story: ["email_open", "listing_revisit", "sms_reply_tour"],
        preferredChannel: "call",
    }),
    base({
        key: "bell",
        featured: "Returning contact emails in",
        blurb: "Duplicate of a 2025 open-house contact. Agents merge the records and carry the history forward.",
        source: "email",
        listingId: "L-willowbend",
        first: "Marcus",
        last: "Bell",
        rawName: "Marcus Bell <marcus.bell@fastmail.example>",
        rawEmail: "marcus.bell@fastmail.example",
        rawPhone: "512-555-0164 (cell)",
        message:
            "Hey there, saw 3302 Willow Bend just listed. Our lease is up in February and we need 4 bedrooms. We're going FHA, talked to a lender last month. Is there an HOA? Thanks, Marcus",
        stated: { intent: "buy", timeline: "1-3", preApproval: "stated", beds: 4, motivation: "Lease ends in February", areas: ["Leander"] },
        statedNotes: { timeline: "“lease is up in February”", preApproval: "“going FHA, talked to a lender”" },
        enriched: { phoneValid: true, emailValid: true, housing: "renting" },
        enrichedNotes: {},
        behavior: { sessions: 5, listingViews: 6, savedHomes: 2, emailOpens: 3, replies: 1 },
        existing: { since: "Apr 2025", history: ["Signed in at 2201 Brushy Hollow open house (Apr 2025)", "Received 14 market-update emails · opened 9", "Agent: Maya Lopez · last touch 6 months ago"] },
        story: ["preapproval_upload", "sms_reply_tour"],
        preferredChannel: "email",
    }),
    base({
        key: "patel",
        featured: "Luxury lakefront buyer",
        blurb: "Realtor.com inquiry on a $1.49M Lakeway listing. Selling a Dallas home and paying cash.",
        source: "realtor",
        listingId: "L-lakeshore",
        first: "Anika",
        last: "Patel",
        rawName: "Dr. Anika Patel",
        rawEmail: "anika.patel@clinic.example",
        rawPhone: "+1 214-555-0122",
        message:
            "Interested in 118 Lakeshore Bend. We are selling our home in Dallas and will likely pay cash. Is the dock private or shared? Our timing is flexible but we'd like to be settled by summer.",
        stated: { intent: "buy", timeline: "3-6", preApproval: "cash", housing: "owner-must-sell", motivation: "Relocating from Dallas · settle by summer", areas: ["Lakeway"] },
        statedNotes: { preApproval: "“will likely pay cash”", timeline: "“settled by summer”", housing: "“selling our home in Dallas”" },
        enriched: { phoneValid: true, emailValid: true, budgetMax: 1_600_000 },
        enrichedNotes: { budgetMax: "Dallas County records: current home est. $1.72M, low mortgage balance (simulated)" },
        behavior: { sessions: 6, listingViews: 11, savedHomes: 4, emailOpens: 0, replies: 0 },
        story: ["listing_revisit", "sms_reply_tour", "email_open"],
        preferredChannel: "email",
    }),
    base({
        key: "nguyen",
        featured: "Referred investor (cash)",
        blurb: "Past client refers an investor looking for an STR-eligible townhome. Proof of funds is ready.",
        source: "referral",
        listingId: "L-eastcesar",
        first: "Kevin",
        last: "Nguyen",
        rawName: "kevin nguyen",
        rawEmail: "k.nguyen@ventures.example",
        rawPhone: "(737) 555-0109",
        message:
            "Ana Ruiz (you sold her house last year) said you're the team to talk to. I'm looking for a 2nd investment property, ideally STR-eligible or with an ADU. Saw 1710 E Cesar Chavez. Paying cash, can close in 30 days, proof of funds ready.",
        stated: { intent: "invest", timeline: "0-1", preApproval: "cash", motivation: "Expanding STR portfolio", areas: ["East Austin"] },
        statedNotes: { timeline: "“can close in 30 days”", preApproval: "“Paying cash … proof of funds ready”", motivation: "“2nd investment property”" },
        enriched: { phoneValid: true, emailValid: true, housing: "owner", budgetMax: 900_000 },
        enrichedNotes: { budgetMax: "Owns 1 rental (Travis County, simulated). Referrer Ana Ruiz: 5★ past client (2025)" },
        behavior: { sessions: 2, listingViews: 3, savedHomes: 1, emailOpens: 0, replies: 0 },
        story: ["email_open", "listing_revisit"],
        preferredChannel: "call",
    }),
    base({
        key: "ortiz",
        featured: "Open-house visitor with an agent",
        blurb: "Signed in at the Mesquite Trail open house and checked “working with an agent.” Agents flag the agency risk.",
        source: "openhouse",
        listingId: "L-mesquite",
        first: "Jasmine",
        last: "Ortiz",
        rawName: "Jasmine Ortiz",
        rawEmail: "jaz.ortiz@mail",
        rawPhone: "512-555-0187",
        message: "",
        formExtras: { "Working with an agent?": "Yes", "How did you hear about us?": "Drove by", "Timeline": "1-3 months" },
        stated: { intent: "buy", timeline: "1-3", workingWithAgent: true, areas: ["Round Rock"] },
        statedNotes: { workingWithAgent: "Sign-in sheet: “Working with an agent? Yes”", timeline: "Sign-in sheet: “1-3 months”" },
        enriched: { phoneValid: true, emailValid: false },
        enrichedNotes: { emailValid: "Email “jaz.ortiz@mail” has no valid domain" },
        behavior: { sessions: 0, listingViews: 0, savedHomes: 0, emailOpens: 0, replies: 0 },
        story: ["email_open"],
        preferredChannel: "text",
    }),
    base({
        key: "clarke",
        featured: "First-time condo buyer",
        blurb: "Zillow question on a downtown condo. No pre-approval yet, 3–6 month timeline.",
        source: "zillow",
        listingId: "L-rainey",
        first: "Ethan",
        last: "Clarke",
        rawName: "Ethan Clarke",
        rawEmail: "ethan.clarke@mail.example",
        rawPhone: "512.555.0158",
        message: "What are the HOA fees on this one and what do they cover? First time buyer, still figuring out the process. Probably buying in the spring.",
        stated: { intent: "buy", timeline: "3-6", preApproval: "none", motivation: "First-time buyer", areas: ["Downtown"] },
        statedNotes: { preApproval: "“First time buyer, still figuring out the process”", timeline: "“Probably buying in the spring”" },
        enriched: { phoneValid: true, emailValid: true, housing: "renting", budgetMax: 600_000 },
        enrichedNotes: { budgetMax: "Saved-search price cap on website: $600k" },
        behavior: { sessions: 3, listingViews: 4, savedHomes: 2, emailOpens: 0, replies: 0 },
        story: ["preapproval_upload", "sms_reply_tour", "went_cold"],
        preferredChannel: "email",
    }),
    base({
        key: "whitaker",
        featured: "Move-up buyer who must sell first",
        blurb: "Email inquiry on the Georgetown coming-soon listing. Needs to sell a Round Rock home first.",
        source: "email",
        listingId: "L-quarry",
        first: "Grant",
        last: "Whitaker",
        rawName: "Grant Whitaker",
        rawEmail: "gwhitaker@mail.example",
        rawPhone: "512 555 0193",
        message:
            "Saw the coming soon sign at 5502 Quarry Ridge. We want land and no HOA. We'd need to sell our place in Round Rock first. Can you tell us when it hits the market and what it'll list for?",
        stated: { intent: "buy-sell", timeline: "1-3", housing: "owner-must-sell", motivation: "Wants acreage · no HOA", areas: ["Georgetown"] },
        statedNotes: { housing: "“We'd need to sell our place in Round Rock first”", timeline: "Asked for launch date of a coming-soon listing" },
        enriched: { phoneValid: true, emailValid: true, sellerAddress: "880 Arbor Glen Dr, Round Rock", budgetMax: 780_000, preApproval: "stated" },
        enrichedNotes: { sellerAddress: "County records: owns 880 Arbor Glen Dr since 2017 (simulated)", budgetMax: "Est. equity $265k + income band → ~$780k buying power (model)" },
        behavior: { sessions: 4, listingViews: 5, savedHomes: 2, emailOpens: 0, replies: 0 },
        story: ["seller_intent", "preapproval_upload"],
        preferredChannel: "call",
    }),
];

/** Featured scenarios not pre-seeded, so the demo can simulate them live. */
export const LIVE_KEYS = ["thornton", "herrera", "brooks"];
export const featuredByKey = (k: string) => FEATURED.find(p => p.key === k);

// --- Random generator -----------------------------------------------------------------------

const FIRSTS = ["Olivia", "Noah", "Emma", "Liam", "Ava", "Mateo", "Sophia", "Elijah", "Isabella", "James", "Mia", "Lucas", "Harper", "Aiden", "Zoe", "Caleb", "Nora", "Omar", "Grace", "Wei", "Hannah", "Diego", "Leah", "Samuel"];
const LASTS = ["Ramirez", "Johnson", "Kowalski", "Bennett", "Sato", "Fischer", "Morgan", "Delgado", "Price", "Andersen", "Holloway", "Mbeki", "Sullivan", "Park", "Castillo", "Reed", "Iyer", "Lindqvist", "Foster", "Abernathy"];
const DOMAINS = ["mail.example", "inbox.example", "fastmail.example", "post.example"];

let rngState = 20261110;
const rnd = () => {
    rngState = (rngState * 1664525 + 1013904223) % 4294967296;
    return rngState / 4294967296;
};
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];

const SOURCE_WEIGHTS: [SourceId, number][] = [
    ["zillow", 26],
    ["realtor", 16],
    ["website", 18],
    ["facebook", 16],
    ["email", 10],
    ["openhouse", 8],
    ["referral", 6],
];

function pickSource(): SourceId {
    const total = SOURCE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
    let r = rnd() * total;
    for (const [s, w] of SOURCE_WEIGHTS) {
        r -= w;
        if (r <= 0) return s;
    }
    return "zillow";
}

function messyName(first: string, last: string) {
    const r = rnd();
    if (r < 0.25) return `${first} ${last}`.toLowerCase();
    if (r < 0.4) return `${first} ${last}`.toUpperCase();
    if (r < 0.5) return `${first} ${last[0]}.`;
    return `${first} ${last}`;
}

function messyPhone() {
    const n = `${pick(["512", "737", "512", "254"])}555${String(100 + Math.floor(rnd() * 99)).padStart(4, "0")}`;
    const f = rnd();
    if (f < 0.25) return n;
    if (f < 0.5) return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
    if (f < 0.75) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6)}`;
    return `+1 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}

const TIMELINE_PHRASE: Record<Exclude<Facts["timeline"], "unknown">, string[]> = {
    "0-1": ["as soon as possible", "in the next few weeks", "before the end of the month"],
    "1-3": ["in the next couple of months", "early next year", "once our lease ends in a couple months"],
    "3-6": ["sometime in the spring", "in about 4-5 months"],
    "6+": ["probably next year", "not in a rush, just starting to look"],
};

/** Builds a plausible random lead. When `source` is given the lead comes from that channel. */
export function randomProfile(source?: SourceId): LeadProfile {
    const src = source ?? pickSource();
    const first = pick(FIRSTS);
    const last = pick(LASTS);
    const listing = src === "facebook" && rnd() < 0.6 ? undefined : pick(LISTINGS);
    const timeline = pick(["0-1", "1-3", "1-3", "3-6", "6+"] as const);
    const preApproval = pick(["stated", "stated", "none", "unknown", "verified"] as const);
    const tour = rnd() < (timeline === "0-1" ? 0.7 : 0.3);
    const price = listing?.price ?? 300_000 + Math.round(rnd() * 8) * 50_000;
    const budgetMax = Math.round((price * (0.85 + rnd() * 0.3)) / 5000) * 5000;
    const statedTimeline = rnd() < 0.75 ? timeline : "unknown";
    const phrase = statedTimeline !== "unknown" ? pick(TIMELINE_PHRASE[statedTimeline]) : "";
    const l = listing ? listingById(listing.id)! : undefined;

    const bits: string[] = [];
    if (l) bits.push(pick([`Is ${l.address} still available?`, `Interested in ${l.address}.`, `Can you send more info on ${l.address}?`]));
    else bits.push(`Looking for a ${pick([3, 3, 4])} bedroom home around ${price >= 1e6 ? "$1M" : `$${Math.round(price / 1000)}k`}.`);
    if (tour) bits.push(pick(["Could we see it this week?", "We'd like to schedule a showing.", "Is a tour this weekend possible?"]));
    if (phrase) bits.push(`We're hoping to buy ${phrase}.`);
    if (preApproval === "stated" || preApproval === "verified") bits.push(`Pre-approved up to $${Math.round(budgetMax / 1000)}k.`);
    if (preApproval === "none") bits.push("Haven't talked to a lender yet.");

    const facebookForm = src === "facebook" || src === "openhouse";
    const formExtras: Record<string, string> | undefined = facebookForm
        ? {
              [src === "facebook" ? "When are you looking to buy?" : "Timeline"]:
                  statedTimeline === "unknown" ? "Not sure" : statedTimeline === "6+" ? "Just browsing" : `${statedTimeline} months`,
              ...(src === "openhouse" ? { "Working with an agent?": rnd() < 0.2 ? "Yes" : "No" } : { "Price range": `$${Math.round((budgetMax * 0.8) / 1000)}-${Math.round(budgetMax / 1000)}k` }),
          }
        : undefined;
    const withAgent = formExtras?.["Working with an agent?"] === "Yes";

    const signals = ["email_open", "listing_revisit", "saved_homes", "sms_reply_tour", "preapproval_upload", "cobuyer", "went_cold", "other_agent"];
    const story = [...signals].sort(() => rnd() - 0.5).slice(0, 3);
    return base({
        key: `rnd-${Math.floor(rnd() * 1e9).toString(36)}`,
        source: src,
        listingId: listing?.id,
        first,
        last,
        rawName: messyName(first, last),
        rawEmail: `${rnd() < 0.3 ? first.toUpperCase() : first.toLowerCase()}.${last.toLowerCase()}@${pick(DOMAINS)}`,
        rawPhone: messyPhone(),
        message: facebookForm ? "" : bits.join(" "),
        formExtras,
        stated: {
            intent: "buy",
            timeline: statedTimeline,
            ...(preApproval === "stated" || preApproval === "verified" ? { preApproval: "stated" as const, preApprovalAmount: budgetMax, budgetMax } : {}),
            ...(preApproval === "none" ? { preApproval: "none" as const } : {}),
            ...(facebookForm && src === "facebook" ? { budgetMax, budgetMin: Math.round(budgetMax * 0.8) } : {}),
            ...(tour && !facebookForm ? { tourRequested: true } : {}),
            ...(withAgent ? { workingWithAgent: true } : {}),
            areas: [l?.area ?? pick(["Round Rock", "Cedar Park", "Leander", "Georgetown"])],
        },
        statedNotes: {
            timeline: phrase ? `“${phrase}”` : formExtras ? "Form answer" : undefined,
            preApproval: preApproval === "none" ? "“Haven't talked to a lender yet”" : preApproval === "unknown" ? undefined : `“Pre-approved up to $${Math.round(budgetMax / 1000)}k”`,
        },
        enriched: {
            phoneValid: rnd() > 0.08,
            emailValid: rnd() > 0.06,
            housing: pick(["renting", "renting", "owner", "owner-must-sell"] as const),
            ...(preApproval === "verified" ? { preApproval: "verified" as const, lender: "Hill Country Home Loans (simulated)" } : {}),
        },
        enrichedNotes: preApproval === "verified" ? { preApproval: "Lender network match: pre-approval on file (simulated)" } : {},
        behavior: {
            sessions: Math.floor(rnd() * 6),
            listingViews: Math.floor(rnd() * 8),
            savedHomes: Math.floor(rnd() * 3),
            emailOpens: 0,
            replies: 0,
        },
        story,
        preferredChannel: pick(["call", "text", "email"] as const),
    });
}
