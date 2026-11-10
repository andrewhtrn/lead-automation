import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Button, Icon, Spinner } from "@blueprintjs/core";
import { useStore } from "../state/store";
import { TOUR_STEPS, type TourCtx, type TourStep } from "./steps";

// ---------------------------------------------------------------------------
// Guided tour: a spotlight box that glides between UI targets (`data-tour="…"`),
// a callout card that points at the target, and a ghost cursor that performs
// demonstrated clicks so the tour can walk through screens on its own.
// ---------------------------------------------------------------------------

const SEEN_KEY = "lead-tour-focused-seen";
const SPOT_PAD = 6;
const CARD_W = 360;
const MARGIN = 14;
const GAP = 18;

interface Rect {
    top: number;
    left: number;
    width: number;
    height: number;
}
type Placement = "right" | "left" | "top" | "bottom" | "center" | "inside";
interface CardPos {
    top: number;
    left: number;
    placement: Placement;
    arrow: number;
}

const TourContext = createContext<{ start: () => void; isOpen: boolean }>({ start: () => {}, isOpen: false });
export const useTour = () => useContext(TourContext);

export function TourProvider({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const start = useCallback(() => setOpen(true), []);

    // First visit: open the tour's welcome card automatically.
    useEffect(() => {
        let seen = true;
        try {
            seen = localStorage.getItem(SEEN_KEY) === "1";
        } catch {
            /* storage unavailable */
        }
        if (seen) return;
        const t = setTimeout(() => setOpen(true), 700);
        return () => clearTimeout(t);
    }, []);

    const close = useCallback(() => {
        try {
            localStorage.setItem(SEEN_KEY, "1");
        } catch {
            /* storage unavailable */
        }
        setOpen(false);
    }, []);

    const value = useMemo(() => ({ start, isOpen: open }), [start, open]);
    return (
        <TourContext.Provider value={value}>
            {children}
            {open && <TourOverlay steps={TOUR_STEPS} onClose={close} />}
        </TourContext.Provider>
    );
}

const sameRect = (a: Rect | null, b: Rect | null) =>
    !!a &&
    !!b &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.max(lo, v)));

function placeCard(rect: Rect | null, ch: number, pref: TourStep["placement"]): CardPos {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = Math.min(CARD_W, vw - MARGIN * 2);
    if (!rect) return { top: (vh - ch) / 2, left: (vw - cw) / 2, placement: "center", arrow: 0 };

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const order = [...new Set([pref ?? "right", "right", "bottom", "left", "top"])] as Exclude<Placement, "center" | "inside">[];
    const crossY = (t: number) => clamp(t, MARGIN + 50, vh - ch - MARGIN);
    const crossX = (l: number) => clamp(l, MARGIN, vw - cw - MARGIN);

    for (const p of order) {
        let top = 0;
        let left = 0;
        let fits = false;
        if (p === "right") {
            left = rect.left + rect.width + GAP;
            top = crossY(cy - ch / 2);
            fits = left + cw <= vw - MARGIN;
        } else if (p === "left") {
            left = rect.left - GAP - cw;
            top = crossY(cy - ch / 2);
            fits = left >= MARGIN;
        } else if (p === "bottom") {
            top = rect.top + rect.height + GAP;
            left = crossX(cx - cw / 2);
            fits = top + ch <= vh - MARGIN;
        } else {
            top = rect.top - GAP - ch;
            left = crossX(cx - cw / 2);
            fits = top >= MARGIN + 50;
        }
        if (fits) {
            const arrow = p === "left" || p === "right" ? clamp(cy - top, 22, ch - 22) : clamp(cx - left, 22, cw - 22);
            return { top, left, placement: p, arrow };
        }
    }
    // Target fills most of the screen: sit the card inside its lower-right corner.
    return {
        top: clamp(Math.min(rect.top + rect.height, vh) - ch - 20, MARGIN + 50, vh - ch - MARGIN),
        left: clamp(Math.min(rect.left + rect.width, vw) - cw - 20, MARGIN, vw - cw - MARGIN),
        placement: "inside",
        arrow: 0,
    };
}

function ensureVisible(el: Element) {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.top >= 60 && r.bottom <= vh - 16) return;
    el.scrollIntoView({ block: r.height > vh - 120 ? "start" : "center", behavior: "smooth" });
}

function TourOverlay({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
    const { state, actions } = useStore();
    const ctx = useRef<TourCtx>({ state, actions, mem: {} });
    ctx.current.state = state;
    ctx.current.actions = actions;

    const [index, setIndex] = useState(0);
    const [phase, setPhase] = useState<"waiting" | "shown" | "clicking">("waiting");
    const [rect, setRect] = useState<Rect | null>(null);
    const [missing, setMissing] = useState(false);
    const [waitedLong, setWaitedLong] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [cursor, setCursor] = useState({ x: window.innerWidth - 90, y: window.innerHeight - 90, visible: false, clicking: false });
    const [card, setCard] = useState<CardPos>({ top: window.innerHeight / 2 - 120, left: window.innerWidth / 2 - CARD_W / 2, placement: "center", arrow: 0 });
    const cardRef = useRef<HTMLDivElement>(null);
    const timers = useRef<number[]>([]);
    const step = steps[index];
    const last = index === steps.length - 1;

    const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const finish = useCallback(() => {
        const prev = ctx.current.mem.prevSpeed as "fast" | "realistic" | undefined;
        if (prev && prev !== ctx.current.state.settings.agentSpeed) ctx.current.actions.updateSettings({ agentSpeed: prev });
        onClose();
    }, [onClose]);

    // Enter a step: set up its screen, then wait for its target.
    useEffect(() => {
        setPhase("waiting");
        setMissing(false);
        setWaitedLong(false);
        steps[index].enter?.(ctx.current);
    }, [index, steps]);

    // Find + track the target every frame (handles scrolling, resizing and live layout changes).
    useEffect(() => {
        if (phase === "clicking") return;
        let raf = 0;
        let scrolled = false;
        const t0 = performance.now();
        let readyAt: number | null = null;
        const loop = () => {
            const now = performance.now();
            const ok = !step.ready || step.ready(ctx.current);
            if (ok && readyAt === null) readyAt = now;
            if (!ok && now - t0 > 12000) setWaitedLong(true);
            if (ok && !step.target) {
                setRect(null);
                setPhase(p => (p === "waiting" ? "shown" : p));
                return;
            }
            const el = ok && step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
            const r = el?.getBoundingClientRect();
            if (el && r && r.width > 0 && r.height > 0) {
                if (!scrolled) {
                    scrolled = true;
                    ensureVisible(el);
                }
                const next = {
                    top: r.top - SPOT_PAD,
                    left: r.left - SPOT_PAD,
                    width: r.width + SPOT_PAD * 2,
                    height: r.height + SPOT_PAD * 2,
                };
                setRect(prev => (sameRect(prev, next) ? prev : next));
                setMissing(false);
                setPhase(p => (p === "waiting" ? "shown" : p));
            } else {
                // Don't collapse the spotlight on a one-frame gap, only when the target is really absent.
                if (now - t0 > 300) setRect(null);
                if (readyAt !== null && now - readyAt > 2500) {
                    setMissing(true);
                    setPhase(p => (p === "waiting" ? "shown" : p));
                }
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [step, phase === "clicking"]); // eslint-disable-line react-hooks/exhaustive-deps

    // Ghost cursor rests beside a clickable target, hinting at the demonstrated click.
    useEffect(() => {
        if (phase === "clicking") return;
        if (phase === "shown" && step.click && rect) {
            setCursor({ x: rect.left + rect.width / 2 + 22, y: rect.top + rect.height / 2 + 18, visible: true, clicking: false });
        } else {
            setCursor(c => (c.visible ? { ...c, visible: false } : c));
        }
    }, [phase, rect, step]);

    // Position the callout card next to the spotlight.
    useLayoutEffect(() => {
        const ch = cardRef.current?.offsetHeight ?? 220;
        const pos = placeCard(rect, ch, step.placement);
        setCard(prev =>
            prev.top === pos.top && prev.left === pos.left && prev.placement === pos.placement && prev.arrow === pos.arrow ? prev : pos,
        );
    }, [rect, step, index, phase, missing, waitedLong, playing]);

    const goTo = useCallback(
        (i: number) => {
            if (i < 0) return;
            if (i >= steps.length) return finish();
            setIndex(i);
        },
        [steps.length, finish],
    );

    const next = useCallback(() => {
        if (phase !== "shown") return;
        if (step.click && phase === "shown" && rect && !missing) {
            setPhase("clicking");
            setCursor({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, visible: true, clicking: false });
            later(() => setCursor(c => ({ ...c, clicking: true })), 650);
            later(() => step.click!.run(ctx.current), 900);
            later(() => {
                setCursor(c => ({ ...c, clicking: false }));
                goTo(index + 1);
            }, 1250);
            return;
        }
        if (step.click && missing) step.click.run(ctx.current);
        goTo(index + 1);
    }, [phase, step, rect, missing, index, goTo]);

    const back = useCallback(() => {
        if (phase !== "clicking") goTo(index - 1);
    }, [phase, index, goTo]);

    const nextRef = useRef(next);
    nextRef.current = next;

    // Autoplay
    const dwell = step.click ? 2600 : step.target ? 6500 : 5000;
    useEffect(() => {
        if (!playing || phase !== "shown") return;
        if (last) {
            setPlaying(false);
            return;
        }
        const t = window.setTimeout(() => nextRef.current(), dwell);
        return () => clearTimeout(t);
    }, [playing, phase, index, dwell, last]);

    // Keyboard: ← → navigate, Esc closes.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") finish();
            else if (e.key === "ArrowRight") nextRef.current();
            else if (e.key === "ArrowLeft") back();
            else return;
            e.preventDefault();
            e.stopPropagation();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [back, finish]);

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spot = rect ?? { top: vh / 2, left: vw / 2, width: 0, height: 0 };
    const clickable = !!step.click && phase === "shown" && !!rect && !missing;
    const waiting = phase === "waiting" && !!step.ready;

    return createPortal(
        <div className="tour-root" role="dialog" aria-modal="true" aria-label="Guided tour">
            <div className="tour-blocker" />
            <div
                className={`tour-spot ${rect ? "" : "tour-spot-none"} ${clickable ? "tour-spot-click" : ""}`}
                style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
                onClick={clickable ? next : undefined}
                title={clickable ? step.click!.label : undefined}
            />

            <div
                className={`tour-cursor ${cursor.visible ? "on" : ""} ${cursor.clicking ? "clicking" : ""} ${phase === "clicking" ? "moving" : ""}`}
                style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
            >
                <span className="tour-ripple" />
                <svg width="22" height="26" viewBox="0 0 22 26" aria-hidden>
                    <path d="M2 2 L2 21 L7 16.5 L10.5 24 L14 22.5 L10.6 15.2 L17.5 15 Z" fill="#fff" stroke="#111418" strokeWidth="1.6" strokeLinejoin="round" />
                </svg>
            </div>

            <div
                ref={cardRef}
                className={`tour-card tour-card-${card.placement}`}
                style={{ top: card.top, left: card.left, width: Math.min(CARD_W, vw - MARGIN * 2), ["--arrow" as string]: `${card.arrow}px` }}
                key="card"
            >
                {card.placement !== "center" && card.placement !== "inside" && <span className="tour-arrow" />}
                <div className="tour-card-header">
                    <span className="tour-chapter">
                        <Icon icon={step.icon ?? "learning"} size={12} /> {step.chapter}
                    </span>
                    <span className="tour-count">
                        {index + 1} / {steps.length}
                    </span>
                    <Button size="small" variant="minimal" icon="cross" aria-label="Close tour" onClick={finish} />
                </div>
                <div className="tour-card-body" key={index}>
                    <h3 className="tour-title">{step.title}</h3>
                    <div className="tour-text">{step.body}</div>
                    {waiting && (
                        <div className="tour-wait">
                            <Spinner size={14} intent="primary" />
                            <span>{step.waitLabel ?? "Waiting for the agent…"}</span>
                            {waitedLong && <Button size="small" variant="minimal" text="Skip ahead" onClick={() => goTo(index + 1)} />}
                        </div>
                    )}
                    {missing && <div className="tour-wait tour-wait-missing">This element isn't on screen right now, so the tour will move on.</div>}
                    {clickable && (
                        <div className="tour-hint">
                            <Icon icon="hand-up" size={12} /> Press <b>{step.click!.label}</b> (or click the highlighted area) and the tour will
                            click it for you.
                        </div>
                    )}
                </div>
                <div className="tour-progress">
                    <div style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
                    {playing && phase === "shown" && !last && (
                        <span className="tour-autoplay" key={`${index}-${phase}`} style={{ animationDuration: `${dwell}ms` }} />
                    )}
                </div>
                <div className="tour-card-foot">
                    {index === 0 ? (
                        <Button variant="minimal" text="Skip tour" onClick={finish} />
                    ) : (
                        <Button variant="minimal" icon="arrow-left" text="Back" disabled={phase === "clicking"} onClick={back} />
                    )}
                    <span className="panel-spacer" />
                    {!last && (
                        <Button
                            variant="minimal"
                            icon={playing ? "pause" : "play"}
                            text={playing ? "Pause" : "Autoplay"}
                            onClick={() => setPlaying(p => !p)}
                        />
                    )}
                    <Button
                        intent="primary"
                        endIcon={last ? "tick" : step.click ? "hand-up" : "arrow-right"}
                        text={index === 0 ? "Start tour" : last ? "Finish" : step.click && !missing ? step.click.label : "Next"}
                        loading={phase === "clicking"}
                        disabled={waiting}
                        onClick={last ? finish : next}
                    />
                </div>
            </div>
        </div>,
        document.body,
    );
}
