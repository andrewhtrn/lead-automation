const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmtWith(opts: Intl.DateTimeFormatOptions) {
    const key = JSON.stringify(opts);
    let f = fmtCache.get(key);
    if (!f) {
        f = new Intl.DateTimeFormat("en-US", opts);
        fmtCache.set(key, f);
    }
    return f;
}

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const fmtTime = (t: number) => fmtWith({ hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(t));
export const fmtClock = (t: number) => fmtWith({ hour: "numeric", minute: "2-digit" }).format(new Date(t));
export const fmtDateTime = (t: number) =>
    fmtWith({ weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(t));
export const fmtDay = (t: number) => fmtWith({ weekday: "short", month: "short", day: "numeric" }).format(new Date(t));

export function timeAgo(t: number, now = Date.now()): string {
    const s = Math.round((now - t) / 1000);
    if (s < 45) return "just now";
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
}

/** "4m", "2h 10m", "3d" */
export function fmtDuration(ms: number): string {
    const m = Math.max(0, Math.round(ms / MIN));
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
    return `${Math.round(h / 24)}d`;
}

/** "due in 4m" / "overdue 12m" */
export function dueLabel(dueAt: number, now = Date.now()): { text: string; overdue: boolean; soon: boolean } {
    const d = dueAt - now;
    if (d < 0) return { text: `overdue ${fmtDuration(-d)}`, overdue: true, soon: true };
    return { text: `due in ${fmtDuration(d)}`, overdue: false, soon: d < 30 * MIN };
}

export const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
/** 689000 → "$689k", 1485000 → "$1.49M" */
export const usdShort = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M` : `$${Math.round(n / 1000)}k`;

export const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Next occurrence of a weekday (0 = Sun) at a given hour, at least `minDays` out. */
export function nextWeekday(weekday: number, hour: number, minute = 0, minDays = 1): number {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    let add = (weekday - d.getDay() + 7) % 7;
    if (add < minDays) add += 7;
    d.setDate(d.getDate() + add);
    return d.getTime();
}

export const initials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .map(s => s[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();

let seq = 0;
export const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
