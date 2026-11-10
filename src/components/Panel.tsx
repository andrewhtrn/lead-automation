import { useState, type ReactNode } from "react";
import { Collapse, Icon, type IconName, Tag } from "@blueprintjs/core";

// Open/closed state survives navigation between views (but not a page reload).
const remembered = new Map<string, boolean>();

/**
 * The app's standard content module: a titled card with an optional count badge, right-side actions
 * and a chevron that collapses the body. Every table and list in the app sits inside one of these.
 */
export function Panel({
    id,
    title,
    icon,
    subtitle,
    count,
    actions,
    children,
    collapsible = true,
    defaultOpen = true,
    padded = false,
    className = "",
    tour,
}: {
    /** Stable key used to remember the collapsed state across navigation. */
    id: string;
    title: ReactNode;
    icon?: IconName;
    subtitle?: ReactNode;
    count?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
    collapsible?: boolean;
    defaultOpen?: boolean;
    padded?: boolean;
    className?: string;
    /** Anchor for the guided tour. */
    tour?: string;
}) {
    const [open, setOpen] = useState(() => remembered.get(id) ?? defaultOpen);
    const toggle = () => {
        if (!collapsible) return;
        remembered.set(id, !open);
        setOpen(!open);
    };
    return (
        <section className={`panel ${open ? "panel-open" : "panel-closed"} ${className}`} data-tour={tour}>
            <header
                className={`panel-head ${collapsible ? "panel-head-toggle" : ""}`}
                onClick={toggle}
                role={collapsible ? "button" : undefined}
                aria-expanded={collapsible ? open : undefined}
                tabIndex={collapsible ? 0 : undefined}
                onKeyDown={e => {
                    if (collapsible && (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                        e.preventDefault();
                        toggle();
                    }
                }}
            >
                {collapsible && <Icon icon="chevron-right" size={14} className="panel-chevron" />}
                {icon && <Icon icon={icon} size={14} className="panel-icon" />}
                <div className="panel-title-wrap">
                    <span className="panel-title">{title}</span>
                    {subtitle && <span className="panel-subtitle">{subtitle}</span>}
                </div>
                {count !== undefined && (
                    <Tag minimal round className="panel-count">
                        {count}
                    </Tag>
                )}
                <span className="panel-spacer" />
                {actions && (
                    <div className="panel-actions" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                        {actions}
                    </div>
                )}
            </header>
            <Collapse isOpen={open} keepChildrenMounted transitionDuration={180}>
                <div className={`panel-body ${padded ? "panel-body-padded" : ""}`}>{children}</div>
            </Collapse>
        </section>
    );
}

/** Consistent page title block used at the top of every view. */
export function PageHeader({
    eyebrow,
    title,
    sub,
    actions,
}: {
    eyebrow?: ReactNode;
    title: ReactNode;
    sub?: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <div className="page-header">
            <div className="page-header-text">
                {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
                <h1 className="page-title">{title}</h1>
                {sub && <div className="page-sub">{sub}</div>}
            </div>
            {actions && <div className="page-actions">{actions}</div>}
        </div>
    );
}
