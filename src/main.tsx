import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BlueprintProvider } from "@blueprintjs/core";
import { Icons, IconNames, IconSize } from "@blueprintjs/icons";

import "@blueprintjs/core/lib/css/blueprint.css";
import "./styles/base.css";
import "./styles/app.css";

import { StoreProvider } from "./state/store";
import App from "./App";
import { TourProvider } from "./tour/Tour";

// Preload every icon path up front so icons never flash in.
Icons.setLoaderOptions({ loader: "all" });
const allIcons = Object.values(IconNames);

void Promise.all([Icons.load(allIcons, IconSize.STANDARD), Icons.load(allIcons, IconSize.LARGE)]).finally(() => {
    createRoot(document.getElementById("root")!).render(
        <StrictMode>
            <BlueprintProvider>
                <StoreProvider>
                    <TourProvider><App /></TourProvider>
                </StoreProvider>
            </BlueprintProvider>
        </StrictMode>,
    );
});
