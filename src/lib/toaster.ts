import { OverlayToaster, Position, type ToastProps, type Toaster } from "@blueprintjs/core";

let toasterPromise: Promise<Toaster> | null = null;

function getToaster() {
    toasterPromise ??= OverlayToaster.createAsync({ position: Position.BOTTOM_RIGHT, maxToasts: 4 });
    return toasterPromise;
}

export function toast(props: ToastProps) {
    void getToaster().then(t => t.show({ timeout: 4500, ...props }));
}

export function download(fileName: string, content: string, type = "text/plain") {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
