/**
 * Sends the page's events (events.ts) to the site's own Worker. Fire and
 * forget: an event that can't be sent is dropped, and nothing here ever
 * throws into the page. No cookies; the session ID lives in sessionStorage,
 * so it ends with the tab. Browsers copy sessionStorage into a duplicated
 * tab or one the page opens, so those share their opener's session; the
 * site opens no tabs itself, so only a duplicated tab does, which is rare
 * enough to leave.
 */
import { LOGIC_VERSION } from "randomfu/src/version.js";
import type { EventBody, EventName } from "./events.js";

export type Props = Omit<EventBody, "event">;

const SESSION_KEY = "randomfu.session";
let fallbackSession: string | null = null;

function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function session(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = newId();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return (fallbackSession ??= newId());
  }
}

/** about, faq or build, from the address (`/`, `/faq`, `/build.html`). */
export function pageName(pathname: string): string {
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  const name = last.replace(/\.html$/, "");
  return name === "" || name === "index" ? "about" : name;
}

const TESTING = ["debug", "poogie-test", "loader-demo"];

function common(): Props {
  const params = new URLSearchParams(location.search);
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return {
    page: pageName(location.pathname),
    session: session(),
    version: `${BUILD_ID} v${LOGIC_VERSION}`,
    testing: TESTING.filter((t) => params.has(t)).join(","),
    cores: navigator.hardwareConcurrency ?? 0,
    ...(memory ? { memoryGb: memory } : {}),
    screenWidth: screen.width,
  };
}

export function track(event: EventName, props: Props = {}): void {
  try {
    if (location.protocol === "file:") return;
    const body = JSON.stringify({ event, ...common(), ...props });
    // text/plain, so a beacon needs no preflight wherever the page is served.
    const blob = new Blob([body], { type: "text/plain" });
    if (navigator.sendBeacon?.("e", blob)) return;
    void fetch("e", { method: "POST", body: blob, keepalive: true }).catch(() => {});
  } catch {
    // Analytics never gets in the way.
  }
}

/** Where an error was thrown, without the site's address: `app.js:1:2345`. */
function where(file: string | undefined, line?: number, col?: number): string {
  const name = (file ?? "").split("/").pop() || "?";
  return line ? `${name}:${line}:${col ?? 0}` : name;
}

/** Sends the page's uncaught errors, up to a few per page load. */
export function watchErrors(): void {
  let left = 5;
  const send = (error: string, detail: string) => {
    if (left-- > 0) track("js_error", { error, detail });
  };
  addEventListener("error", (event) => {
    send(event.message || String(event.error), where(event.filename, event.lineno, event.colno));
  });
  addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as unknown;
    send(reason instanceof Error ? reason.message : String(reason), "promise");
  });
}
