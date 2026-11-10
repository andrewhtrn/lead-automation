// Renders a profile into the raw, source-specific payload a brokerage would actually receive.
import type { LeadProfile, RawLead } from "../types";
import { listingById, SOURCES } from "./directory";

const iso = (t: number) => new Date(t).toISOString();
const hash = (s: string) => {
    let h = 0;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h;
};

export function renderRaw(p: LeadProfile, receivedAt: number): RawLead {
    const l = listingById(p.listingId);
    const meta = SOURCES[p.source];
    const id = hash(p.key + receivedAt).toString(36).slice(0, 7);
    const addr = l ? `${l.address}, ${l.city}, TX ${l.zip}` : undefined;
    let payload = "";

    switch (p.source) {
        case "zillow":
            payload = JSON.stringify(
                {
                    leadId: `zpa-${id}`,
                    leadType: p.stated.tourRequested ? "TOUR_REQUEST" : "LISTING_QUESTION",
                    contact: { name: p.rawName, email: p.rawEmail, phone: p.rawPhone },
                    listing: l ? { zpid: 29_000_000 + (hash(l.id) % 900_000), address: addr, listPrice: l.price } : null,
                    message: p.message,
                    financing: p.stated.preApproval === "stated" ? "PRE_APPROVED" : p.stated.preApproval === "none" ? "NOT_YET" : "UNKNOWN",
                    createdAt: iso(receivedAt),
                },
                null,
                2,
            );
            break;
        case "realtor":
            payload = JSON.stringify(
                {
                    lead: {
                        lead_id: `RDC${hash(id) % 9_000_000}`,
                        full_name: p.rawName,
                        email_address: p.rawEmail,
                        phone_number: p.rawPhone,
                        comments: p.message,
                        property: l ? { mls_number: l.mls, street: l.address, city: l.city, list_price: String(l.price) } : {},
                        lead_source: "Realtor.com Connections Plus",
                        submitted: new Date(receivedAt).toUTCString(),
                    },
                },
                null,
                2,
            );
            break;
        case "facebook":
            payload = JSON.stringify(
                {
                    id: `fb_${hash(id)}`,
                    ad_name: "Cedar Park · Move-up buyers · Carousel v3",
                    form_id: "1184420073",
                    created_time: iso(receivedAt),
                    field_data: [
                        { name: "full_name", values: [p.rawName] },
                        { name: "email", values: [p.rawEmail] },
                        { name: "phone_number", values: [p.rawPhone] },
                        ...Object.entries(p.formExtras ?? {}).map(([k, v]) => ({ name: k, values: [v] })),
                    ],
                },
                null,
                2,
            );
            break;
        case "website": {
            const fields: [string, string][] = [
                ["form", p.stated.sellerAddress ? "home-valuation" : "property-inquiry"],
                ["name", p.rawName],
                ["email", p.rawEmail],
                ["phone", p.rawPhone],
                ...(l ? ([["property", addr!]] as [string, string][]) : []),
                ["message", p.message],
                ["page", l ? `/listings/${l.mls.toLowerCase()}` : "/sell/home-value"],
                ["utm_source", "google"],
                ["utm_campaign", "brand-search"],
                ["submitted_at", iso(receivedAt)],
            ];
            payload = fields.map(([k, v]) => `${k.padEnd(13)}: ${v}`).join("\n");
            break;
        }
        case "openhouse": {
            const head = ["timestamp", "property", "name", "phone", "email", ...Object.keys(p.formExtras ?? {})];
            const row = [iso(receivedAt), l?.address ?? "", p.rawName, p.rawPhone, p.rawEmail, ...Object.values(p.formExtras ?? {})];
            payload = `${head.map(h => `"${h}"`).join(",")}\n${row.map(v => `"${v}"`).join(",")}`;
            break;
        }
        case "email":
        case "referral": {
            const from = p.rawName.includes("<") ? p.rawName : `${p.rawName} <${p.rawEmail.trim()}>`;
            const subject = p.source === "referral" ? `Fwd: Intro: ${p.first} ${p.last} – investor looking in Austin` : l ? `Question about ${l.address}` : "Looking for a home";
            const body =
                p.source === "referral"
                    ? `---------- Forwarded message ----------\nFrom: Ana Ruiz <ana.ruiz@mail.example>\n\nHi team, introducing my friend ${p.first}. You were amazing with our sale, figured you'd be perfect for him!\n\n---------- Original message ----------\nFrom: ${from}\n\n${p.message}\n\n${p.first}\n${p.rawPhone}`
                    : `${p.message}\n\nSent from my phone\n${p.rawPhone}`;
            payload = `From: ${p.source === "referral" ? "Ana Ruiz <ana.ruiz@mail.example>" : from}\nTo: leads@summitstone.example\nDate: ${new Date(receivedAt).toUTCString()}\nSubject: ${subject}\n\n${body}`;
            break;
        }
    }
    return { source: p.source, receivedAt, channel: meta.channel, format: meta.format, payload };
}
