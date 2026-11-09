/**
 * The randomfu web app's page: settings (from the same `OPTIONS` the CLI
 * uses), the user's files, and runs in a worker. The finished ISO is
 * assembled as a Blob from slices of the user's own file plus the changed
 * bytes, so a whole disc image is never copied into memory.
 */
import { randomSeed } from "../src/rng.js";
import {
  OPTIONS,
  PRESETS,
  SettingsError,
  applySettings,
  decodeSettings,
  defaultSettings,
  encodeSettings,
  isActive,
  needsEboot,
  settingsFromJson,
  settingsToJson,
  type OptionDef,
  type OptionKey,
  type Settings,
} from "../src/settings.js";
import { LOGIC_VERSION } from "../src/version.js";
import type { Request, Response, Segment } from "./protocol.js";

const STORE = "randomfu.web.v1";
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let settings: Settings = defaultSettings(randomSeed());
let spoilerLines: string[] = [];
let busy = false;
const urls: string[] = [];

// ---------------------------------------------------------------- the worker

const worker = new Worker("worker.js");
let pending: ((response: Response) => void) | null = null;
let onLog: (line: string) => void = () => {};
worker.onmessage = (event: MessageEvent<Response>) => {
  if (event.data.type === "log") return onLog(event.data.line);
  const resolve = pending;
  pending = null;
  resolve?.(event.data);
};

/** One request at a time: the worker answers in order, so each answer goes to its own request. */
let queue: Promise<unknown> = Promise.resolve();
function ask(request: Request): Promise<Response> {
  const next = queue.then(
    () =>
      new Promise<Response>((resolve) => {
        pending = resolve;
        worker.postMessage(request);
      }),
  );
  queue = next.catch(() => {});
  return next;
}

// ---------------------------------------------------------------- small helpers

function say(el: HTMLElement, text: string, kind?: "ok" | "err"): void {
  el.textContent = text;
  el.title = text;
  el.classList.remove("ok", "err");
  if (kind) el.classList.add(kind);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string | null)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) if (child !== null) node.append(child);
  return node;
}

function save(): void {
  try {
    localStorage.setItem(STORE, JSON.stringify({ settings }));
  } catch {
    // Storage unavailable: settings just aren't remembered.
  }
}

function restore(): void {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE) ?? "{}") as { settings?: Settings };
    if (stored.settings)
      settings = applySettings(defaultSettings(settings.seed), { ...stored.settings });
  } catch {
    // Missing, or from an older version: keep the defaults.
  }
}

function download(name: string, blob: Blob, label: string): HTMLAnchorElement {
  const url = URL.createObjectURL(blob);
  urls.push(url);
  return el(
    "a",
    { href: url, download: name, class: "button" },
    el("button", { type: "button", class: "primary" }, label),
  );
}

// ---------------------------------------------------------------- options

function format(option: OptionDef, value: number): string {
  return option.type.kind === "number" && option.type.percent
    ? `±${Math.round(value * 100)}%`
    : String(value);
}

function update(key: OptionKey, value: boolean | number | string): void {
  settings = applySettings(settings, { [key]: value });
  render();
}

function renderOption(option: OptionDef): HTMLElement {
  const wrap = el("div", { class: "option", "data-key": option.key });
  const id = `opt-${option.key}`;
  const badge = option.eboot ? el("span", { class: "badge" }, "EBOOT") : null;
  const help = el("p", { class: "help" }, option.help);
  const type = option.type;
  if (type.kind === "boolean") {
    const input = el("input", { type: "checkbox", id });
    input.addEventListener("change", () => update(option.key, input.checked));
    wrap.append(
      el(
        "label",
        { class: "switch", for: id },
        input,
        el("div", {}, el("div", { class: "title" }, option.label, badge), help),
      ),
    );
  } else if (type.kind === "number") {
    const input = el("input", {
      type: "range",
      id,
      min: String(type.min),
      max: String(type.max),
      step: String(type.step),
    });
    const out = el("output", { for: id });
    input.addEventListener("input", () => update(option.key, Number(input.value)));
    wrap.append(
      el("label", { class: "title", for: id }, option.label, badge),
      help,
      el("div", { class: "range" }, input, out),
    );
  } else {
    const group = el("div", { class: "choices", role: "radiogroup", "aria-label": option.label });
    for (const choice of type.choices) {
      const input = el("input", { type: "radio", name: id, value: choice.value });
      input.addEventListener("change", () => update(option.key, choice.value));
      group.append(
        el(
          "label",
          { class: "choice" },
          input,
          el("span", {}, el("b", {}, choice.label), el("small", {}, choice.help)),
        ),
      );
    }
    wrap.append(el("div", { class: "title" }, option.label, badge), help, group);
  }
  return wrap;
}

function buildOptions(): void {
  const col = $("options");
  const sections = new Map<string, HTMLElement>();
  for (const option of OPTIONS) {
    let card = sections.get(option.section);
    if (!card) {
      card = el("section", { class: "card" }, el("h2", {}, option.section));
      sections.set(option.section, card);
      col.append(card);
    }
    card.append(renderOption(option));
  }
}

function render(): void {
  $<HTMLInputElement>("seed").value = settings.seed;
  for (const option of OPTIONS) {
    const wrap = document.querySelector<HTMLElement>(`[data-key="${option.key}"]`)!;
    const value = settings[option.key];
    const input = document.getElementById(`opt-${option.key}`) as HTMLInputElement | null;
    if (option.type.kind === "boolean") input!.checked = value as boolean;
    else if (option.type.kind === "number") {
      input!.value = String(value);
      wrap.querySelector("output")!.textContent = format(option, value as number);
    } else {
      for (const radio of wrap.querySelectorAll<HTMLInputElement>("input[type=radio]")) {
        radio.checked = radio.value === value;
      }
    }
    const active = isActive(settings, option);
    wrap.classList.toggle("off", !active);
    for (const i of wrap.querySelectorAll("input")) i.disabled = !active;
  }
  $<HTMLTextAreaElement>("share").value = encodeSettings(settings);
  $("eboot-needed").hidden = !needsEboot(settings);
  save();
}

// ---------------------------------------------------------------- files and runs

const isoFile = () => $<HTMLInputElement>("iso").files?.[0] ?? null;
const ebootFile = () => $<HTMLInputElement>("eboot").files?.[0] ?? null;

async function checkFiles(): Promise<void> {
  const iso = isoFile();
  if (!iso || busy) return;
  say($("check-status"), "Checking…");
  const r = await ask({ type: "check", iso, eboot: ebootFile() });
  if (r.type === "error") return say($("check-status"), r.message, "err");
  if (r.type !== "checked") return;
  const disc = r.supported
    ? `${r.discId} (${r.region!.toUpperCase()}) is supported.`
    : `${r.discId ?? "This disc"}${r.region ? ` (${r.region.toUpperCase()})` : ""} isn't supported yet (the EU and JP discs are).`;
  const eboot = r.eboot ? ` EBOOT: ${r.eboot.detail}.` : "";
  say($("check-status"), disc + eboot, r.supported && (!r.eboot || r.eboot.ok) ? "ok" : "err");
  if (r.supported && !busy) say($("run-status"), "Ready: pick your settings, then randomize.");
}

function outputName(iso: File): string {
  return `${iso.name.replace(/\.iso$/i, "")} (randomfu ${settings.seed}).iso`;
}

async function run(dryRun: boolean): Promise<void> {
  const iso = isoFile();
  if (!iso) return say($("run-status"), "Pick your disc image first.", "err");
  if (needsEboot(settings) && !ebootFile()) {
    return say(
      $("run-status"),
      "These settings change the EBOOT: add your decrypted EBOOT dump.",
      "err",
    );
  }
  busy = true;
  for (const id of ["run", "dry-run"]) $<HTMLButtonElement>(id).disabled = true;
  for (const url of urls.splice(0)) URL.revokeObjectURL(url);
  $("downloads").replaceChildren();
  $("results").hidden = false;
  $("log").textContent = "";
  $("spoiler-wrap").hidden = true;
  say($("run-status"), dryRun ? "Reading the disc…" : "Randomizing…");
  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
  onLog = (line) => ($("log").textContent += `${line}\n`);
  try {
    const r = await ask({ type: "run", iso, eboot: ebootFile(), settings, dryRun });
    if (r.type === "error") throw new Error(r.message);
    if (r.type !== "done") throw new Error("The run stopped without finishing.");
    showSpoiler(r.spoiler);
    const spoilerName = `${outputName(iso).replace(/\.iso$/, "")} spoiler.txt`;
    const links: HTMLElement[] = [];
    if (r.segments) {
      const parts = r.segments.map((s: Segment) =>
        "data" in s ? s.data : iso.slice(s.start, s.end),
      );
      const blob = new Blob(parts as BlobPart[], { type: "application/octet-stream" });
      links.push(download(outputName(iso), blob, "Download randomized ISO"));
    }
    links.push(
      download(spoilerName, new Blob([r.spoiler], { type: "text/plain" }), "Download spoiler log"),
    );
    $("downloads").replaceChildren(...links);
    const warn =
      r.problems.length > 0
        ? ` ${r.problems.length} recipe warnings; see the top of the spoiler log.`
        : "";
    say(
      $("run-status"),
      (dryRun ? "Preview ready." : "Done: download your ISO above.") + warn,
      warn ? "err" : "ok",
    );
  } catch (error) {
    $("log").textContent += `\nError: ${(error as Error).message}\n`;
    say($("run-status"), (error as Error).message, "err");
  } finally {
    busy = false;
    for (const id of ["run", "dry-run"]) $<HTMLButtonElement>(id).disabled = false;
  }
}

function showSpoiler(text: string): void {
  spoilerLines = text.split("\n");
  $("spoiler-wrap").hidden = false;
  filterSpoiler();
}

function filterSpoiler(): void {
  const q = $<HTMLInputElement>("filter").value.trim().toLowerCase();
  if (!q) {
    $("spoiler").textContent = spoilerLines.join("\n");
    return;
  }
  // Blocks are a heading and its indented lines. A matching heading keeps
  // its whole block; otherwise only matching lines, under their heading.
  const out: string[] = [];
  let heading: string | null = null;
  let block: string[] = [];
  const flush = () => {
    if (heading === null) return;
    const all = heading.toLowerCase().includes(q);
    const kept = all ? block : block.filter((l) => l.toLowerCase().includes(q));
    if (kept.length > 0 || all) out.push(heading, ...kept);
  };
  for (const line of spoilerLines) {
    if (line.startsWith(" ")) block.push(line);
    else if (line) {
      flush();
      heading = line;
      block = [];
    }
  }
  flush();
  $("spoiler").textContent = out.length > 0 ? out.join("\n") : "No lines match.";
}

// ---------------------------------------------------------------- start

function init(): void {
  $("version").textContent = `· logic v${LOGIC_VERSION}`;
  restore();
  buildOptions();
  for (const preset of PRESETS) {
    const button = el(
      "button",
      { type: "button" },
      el("b", {}, preset.name),
      el("small", {}, preset.help),
    );
    button.addEventListener("click", () => {
      settings = applySettings(defaultSettings(settings.seed), preset.changes);
      render();
      say($("share-status"), `Loaded the ${preset.name} preset.`, "ok");
    });
    $("presets").append(button);
  }
  render();

  $<HTMLInputElement>("seed").addEventListener("input", () => {
    const seed = $<HTMLInputElement>("seed").value.trim();
    if (!seed) return;
    settings = { ...settings, seed };
    $<HTMLTextAreaElement>("share").value = encodeSettings(settings);
    save();
  });
  $("new-seed").addEventListener("click", () => {
    settings = { ...settings, seed: randomSeed() };
    render();
  });
  $("iso").addEventListener("change", () => void checkFiles());
  $("eboot").addEventListener("change", () => void checkFiles());
  $("copy").addEventListener("click", () => {
    navigator.clipboard.writeText($<HTMLTextAreaElement>("share").value).then(
      () => say($("share-status"), "Copied.", "ok"),
      () => {
        $<HTMLTextAreaElement>("share").select();
        say($("share-status"), "Select and copy the string above.");
      },
    );
  });
  $("apply-paste").addEventListener("click", () => {
    try {
      const { settings: decoded, version } = decodeSettings($<HTMLInputElement>("paste").value);
      settings = decoded;
      render();
      say(
        $("share-status"),
        version === LOGIC_VERSION
          ? "Loaded the settings string."
          : `Made with logic v${version}; this is v${LOGIC_VERSION}, so the same seed gives a different game.`,
        version === LOGIC_VERSION ? "ok" : "err",
      );
    } catch (error) {
      say($("share-status"), (error as Error).message, "err");
    }
  });
  $("export").addEventListener("click", () => {
    const link = download(
      `randomfu-${settings.seed}.json`,
      new Blob([settingsToJson(settings)], { type: "application/json" }),
      "",
    );
    link.click();
  });
  $("import").addEventListener("click", () => $("import-file").click());
  $<HTMLInputElement>("import-file").addEventListener("change", async () => {
    const input = $<HTMLInputElement>("import-file");
    const file = input.files?.[0];
    if (!file) return;
    try {
      settings = settingsFromJson(await file.text(), settings.seed);
      render();
      say($("share-status"), `Loaded ${file.name}.`, "ok");
    } catch (error) {
      say($("share-status"), error instanceof SettingsError ? error.message : String(error), "err");
    } finally {
      input.value = "";
    }
  });
  $("filter").addEventListener("input", filterSpoiler);
  $("run").addEventListener("click", () => void run(false));
  $("dry-run").addEventListener("click", () => void run(true));
}

init();
