import { Icon, Menu, MenuDivider, MenuItem, Switch } from "@blueprintjs/core";
import { useStore } from "../state/store";
import { FEATURED, LIVE_KEYS } from "../data/scenarios";
import { SOURCE_LIST } from "../data/directory";

/** Menu for injecting new leads: hand-written scenarios, random leads by source, or a live stream. */
export function SimulateMenu() {
    const { state, actions } = useStore();
    const live = FEATURED.filter(f => LIVE_KEYS.includes(f.key));
    return (
        <Menu className="sim-menu">
            <MenuDivider title="Featured scenarios" />
            {live.map(f => {
                const used = state.usedFeatured.includes(f.key);
                return (
                    <MenuItem
                        key={f.key}
                        icon={used ? "tick" : "star"}
                        text={
                            <div className="sim-item">
                                <div className="cell-strong">{f.featured}</div>
                                <div className="cell-muted sim-blurb">{f.blurb}</div>
                            </div>
                        }
                        disabled={used}
                        multiline
                        onClick={() => actions.simulateLead({ featured: f.key, open: true })}
                        data-tour={`sim-${f.key}`}
                    />
                );
            })}
            <MenuDivider title="Random lead from…" />
            {SOURCE_LIST.map(s => (
                <MenuItem key={s.id} icon={<Icon icon={s.icon} color={s.color} />} text={s.label} label={s.format.toUpperCase()} onClick={() => actions.simulateLead({ source: s.id, open: true })} />
            ))}
            <MenuDivider />
            <div className="sim-stream">
                <Switch
                    checked={state.settings.autoStream}
                    label="Live stream: a new random lead every ~25s"
                    onChange={e => actions.updateSettings({ autoStream: e.currentTarget.checked })}
                />
            </div>
        </Menu>
    );
}
