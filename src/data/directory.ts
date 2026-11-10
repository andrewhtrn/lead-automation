// Fictional brokerage, agents and listings. Email domains use the reserved `.example` TLD.
import type { BrokerAgent, Listing, SourceId } from "../types";
import type { IconName } from "@blueprintjs/core";

export const BROKERAGE = {
    name: "Summit & Stone Realty",
    managerName: "Jordan Reyes",
    managerTitle: "Managing Broker",
    domain: "summitstone.example",
    commissionRate: 0.028,
};

export const AGENTS: BrokerAgent[] = [
    { id: "mlopez", name: "Maya Lopez", initials: "ML", title: "Senior Buyer Specialist", areas: ["Cedar Park", "Leander"], specialties: ["relocation", "first-time"], capacity: 14, color: "#2d72d2" },
    { id: "dokafor", name: "David Okafor", initials: "DO", title: "Listing Specialist", areas: ["Round Rock", "Georgetown"], specialties: ["seller", "move-up"], capacity: 12, color: "#238551" },
    { id: "pchen", name: "Priya Chen", initials: "PC", title: "Luxury & Lakefront", areas: ["Lakeway", "West Lake Hills"], specialties: ["luxury", "relocation"], capacity: 10, color: "#7961db" },
    { id: "bwalsh", name: "Ben Walsh", initials: "BW", title: "Investor Desk", areas: ["East Austin", "Round Rock"], specialties: ["investor", "multi-family"], capacity: 12, color: "#c87619" },
    { id: "skim", name: "Sofia Kim", initials: "SK", title: "Inside Sales (ISA)", areas: ["All areas"], specialties: ["nurture", "first-time"], capacity: 30, color: "#cd4246" },
];

export const agentById = (id?: string) => AGENTS.find(a => a.id === id);

export const LISTINGS: Listing[] = [
    {
        id: "L-oakmont", address: "2417 Oakmont Ridge Dr", city: "Cedar Park", zip: "78613", area: "Cedar Park",
        price: 689_000, beds: 4, baths: 3, sqft: 2840, type: "Single-family", status: "Active", dom: 6, yearBuilt: 2016, hoa: 65,
        mls: "SSR-4471102", listingAgentId: "mlopez", hue: 205,
        features: ["Leander ISD", "Home office", "3-car garage", "Greenbelt lot"],
    },
    {
        id: "L-lakeshore", address: "118 Lakeshore Bend", city: "Lakeway", zip: "78734", area: "Lakeway",
        price: 1_485_000, beds: 5, baths: 4.5, sqft: 4210, type: "Single-family", status: "Active", dom: 21, yearBuilt: 2009, hoa: 140,
        mls: "SSR-4468820", listingAgentId: "pchen", hue: 190,
        features: ["Lake Travis views", "Pool + spa", "Wine room", "Boat dock access"],
    },
    {
        id: "L-mesquite", address: "905 Mesquite Trail", city: "Round Rock", zip: "78681", area: "Round Rock",
        price: 459_000, beds: 3, baths: 2, sqft: 1760, type: "Single-family", status: "Price reduced", dom: 34, yearBuilt: 2004,
        mls: "SSR-4459317", listingAgentId: "dokafor", hue: 32,
        features: ["Price reduced $15k", "New roof 2025", "Large backyard", "Round Rock ISD"],
    },
    {
        id: "L-rainey", address: "70 Rainey St, Unit 1408", city: "Austin", zip: "78701", area: "Downtown",
        price: 615_000, beds: 2, baths: 2, sqft: 1190, type: "Condo", status: "Active", dom: 12, yearBuilt: 2018, hoa: 690,
        mls: "SSR-4470055", listingAgentId: "pchen", hue: 260,
        features: ["Skyline views", "Concierge", "Walk to Lady Bird Lake", "2 parking spaces"],
    },
    {
        id: "L-willowbend", address: "3302 Willow Bend Ct", city: "Leander", zip: "78641", area: "Leander",
        price: 525_000, beds: 4, baths: 2.5, sqft: 2310, type: "Single-family", status: "Active", dom: 9, yearBuilt: 2020, hoa: 45,
        mls: "SSR-4470911", listingAgentId: "mlopez", hue: 140,
        features: ["Community pool", "Open floor plan", "Solar panels", "Near 183A toll"],
    },
    {
        id: "L-quarry", address: "5502 Quarry Ridge Rd", city: "Georgetown", zip: "78628", area: "Georgetown",
        price: 742_000, beds: 4, baths: 3.5, sqft: 3150, type: "Single-family", status: "Coming soon", dom: 0, yearBuilt: 2012,
        mls: "SSR-4472290", listingAgentId: "dokafor", hue: 18,
        features: ["1-acre lot", "No HOA", "Workshop", "Hill Country views"],
    },
    {
        id: "L-eastcesar", address: "1710 E Cesar Chavez St", city: "Austin", zip: "78702", area: "East Austin",
        price: 829_000, beds: 4, baths: 3, sqft: 2050, type: "Townhome", status: "Active", dom: 17, yearBuilt: 2021,
        mls: "SSR-4467733", listingAgentId: "bwalsh", hue: 330,
        features: ["Duplex-ready ADU", "Rooftop deck", "STR-eligible zoning", "Walk score 92"],
    },
];

export const listingById = (id?: string) => LISTINGS.find(l => l.id === id);

export interface SourceMeta {
    id: SourceId;
    label: string;
    short: string;
    icon: IconName;
    color: string;
    channel: string;
    format: "json" | "email" | "form" | "csv";
    /** Historical lead-to-appointment rate at this (fictional) brokerage. */
    historicalRate: number;
    quality: number;
}

export const SOURCES: Record<SourceId, SourceMeta> = {
    zillow: { id: "zillow", label: "Zillow", short: "Zillow", icon: "home", color: "#2d72d2", channel: "Premier Agent webhook", format: "json", historicalRate: 0.11, quality: 0.6 },
    realtor: { id: "realtor", label: "Realtor.com", short: "Realtor", icon: "office", color: "#cd4246", channel: "Lead API (XML → JSON)", format: "json", historicalRate: 0.1, quality: 0.55 },
    website: { id: "website", label: "Website form", short: "Website", icon: "globe-network", color: "#238551", channel: "summitstone.example/contact", format: "form", historicalRate: 0.16, quality: 0.7 },
    email: { id: "email", label: "Email inbox", short: "Email", icon: "envelope", color: "#7961db", channel: "leads@summitstone.example", format: "email", historicalRate: 0.14, quality: 0.65 },
    facebook: { id: "facebook", label: "Facebook Lead Ads", short: "Facebook", icon: "social-media", color: "#4c90f0", channel: "Lead Ads form · Cedar Park campaign", format: "form", historicalRate: 0.04, quality: 0.3 },
    openhouse: { id: "openhouse", label: "Open house sign-in", short: "Open house", icon: "key", color: "#c87619", channel: "Kiosk tablet · CSV export", format: "csv", historicalRate: 0.09, quality: 0.5 },
    referral: { id: "referral", label: "Past-client referral", short: "Referral", icon: "people", color: "#0f9960", channel: "Referral email forward", format: "email", historicalRate: 0.34, quality: 0.95 },
};

export const SOURCE_LIST = Object.values(SOURCES);
