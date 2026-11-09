/**
 * The randomfu web app's page: a step-by-step builder over the same
 * `OPTIONS` and `PRESETS` the CLI uses. The steps are the disc, the seed and
 * a preset, one step per group of option sections, the decrypted EBOOT (only
 * when the settings need it), a review, and the run.
 *
 * Runs happen in a worker. The finished ISO is assembled as a Blob from
 * slices of the user's own file plus the changed bytes, so a whole disc
 * image is never copied into memory.
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
  formatOption,
  isActive,
  needsEboot,
  settingsFromJson,
  settingsToJson,
  type OptionDef,
  type OptionKey,
  type Preset,
  type Settings,
} from "../src/settings.js";
import { LOGIC_VERSION } from "../src/version.js";
import type { Request, Response, Segment } from "./protocol.js";

const STORE = "randomfu.web.v1";
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------------------------------------------------------------- the steps

interface Step {
  id: string;
  title: string;
  /** A game sprite from images/, and its tint (a site colour token). */
  icon: string;
  tint?: string;
  /** For option steps: the `OptionDef.section`s it shows, and a line above them. */
  sections?: string[];
  intro?: string;
  /** Left out of the steps unless this is true. */
  when?: () => boolean;
}

const OPTION_STEPS: Step[] = [
  {
    id: "logic",
    title: "Logic",
    icon: "star",
    sections: ["Logic"],
    intro:
      "How far items can move. Every shuffle follows this, so with logic on, every recipe stays craftable as early in the game as before.",
  },
  {
    id: "rewards",
    title: "Rewards",
    icon: "claw",
    tint: "var(--color-gem-red)",
    sections: ["Quest rewards", "Monster rewards"],
    intro: "What quests and monsters give you.",
  },
  {
    id: "gathering",
    title: "Gathering",
    icon: "ore",
    tint: "var(--color-gem-blue)",
    sections: ["Gathering"],
    intro: "What mining, gathering and bug catching points give you.",
  },
  {
    id: "smithy",
    title: "Smithy",
    icon: "hammer",
    sections: ["Crafting", "Costs", "Weapons", "Armor"],
    intro:
      "What the smithy makes and what it asks for. Settings marked EBOOT need a decrypted EBOOT dump, which you'll add before randomizing.",
  },
  {
    id: "shops",
    title: "Shops",
    icon: "coin",
    tint: "var(--color-gem-yellow)",
    sections: ["Shops"],
    intro: "What the village, Guild Hall and peddling granny sell, and for how much.",
  },
];

// A section no step claims still gets a step, so a new option always shows up.
const claimed = new Set(OPTION_STEPS.flatMap((s) => s.sections ?? []));
const unclaimed = [...new Set(OPTIONS.map((o) => o.section))].filter((s) => !claimed.has(s));
if (unclaimed.length > 0) {
  OPTION_STEPS.push({ id: "more", title: "More", icon: "deco", sections: unclaimed });
}

const STEPS: Step[] = [
  { id: "game", title: "Your game", icon: "binoculars" },
  { id: "start", title: "Seed", icon: "seed", tint: "var(--color-gem-green)" },
  ...OPTION_STEPS,
  {
    id: "eboot",
    title: "EBOOT",
    icon: "deco",
    tint: "var(--color-gem-cyan)",
    when: () => needsEboot(settings),
  },
  { id: "review", title: "Review", icon: "ticket", tint: "var(--color-parchment)" },
  { id: "run", title: "Randomize", icon: "max" },
];

// ---------------------------------------------------------------- state

let settings: Settings = defaultSettings(randomSeed());
let current = "game";
/** Steps the player has been to: the step bar lets them go back to any of these. */
const reached = new Set<string>(["game"]);
/** A run (or preview) has started, so the run step has something to show. */
let ranOnce = false;
let busy = false;
/** What the last run was made from, to tell when its results no longer match. */
let ranWith: { settings: string; iso: File } | null = null;

let iso: File | null = null;
let eboot: File | null = null;
/** The last check of the files: null while one is pending or before the first. */
let disc: Extract<Response, { type: "checked" }> | null = null;
let checking = false;
let checkError: string | null = null;

let spoilerLines: string[] = [];
const urls: string[] = [];

const visibleSteps = () => STEPS.filter((s) => !s.when || s.when());
const discOk = () => disc?.supported === true;
const ebootOk = () => disc?.eboot?.ok === true;

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

function say(target: HTMLElement, text: string, kind?: "ok" | "err" | "busy"): void {
  target.textContent = text;
  target.classList.remove("ok", "err", "busy");
  if (kind) target.classList.add(kind);
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

function icon(step: Step): HTMLElement {
  const span = el("span", { class: "icon", "aria-hidden": "true" });
  span.style.setProperty("--icon", `url(images/${step.icon}.png)`);
  if (step.tint) span.style.setProperty("--tint", step.tint);
  return span;
}

function arrowButton(next: boolean, label: string): HTMLButtonElement {
  return el(
    "button",
    { type: "button", class: next ? "arrow next" : "arrow", "aria-label": label },
    el("img", { src: "images/arrow.png", alt: "" }),
  );
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
  return el("a", { href: url, download: name, class: "button primary" }, label);
}

function megabytes(file: File): string {
  const mb = file.size / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

// ---------------------------------------------------------------- options

function update(key: OptionKey, value: boolean | number | string): void {
  settings = applySettings(settings, { [key]: value });
  render();
}

function optionText(option: OptionDef, labelFor: string | null): HTMLElement {
  const badge = option.eboot ? el("span", { class: "badge" }, "EBOOT") : null;
  const title = labelFor
    ? el("label", { class: "option-title", for: labelFor }, option.label, badge)
    : el("span", { class: "option-title" }, option.label, badge);
  return el("div", { class: "option-text" }, title, el("p", { class: "note" }, option.help));
}

function renderOption(option: OptionDef): HTMLElement {
  const wrap = el("div", { class: "option", "data-key": option.key });
  const id = `opt-${option.key}`;
  const type = option.type;
  if (type.kind === "boolean") {
    const input = el("input", { type: "checkbox", class: "toggle", id });
    input.addEventListener("change", () => update(option.key, input.checked));
    wrap.append(el("div", { class: "option-row" }, optionText(option, id), input));
  } else if (type.kind === "number") {
    const input = el("input", {
      type: "range",
      id,
      min: String(type.min),
      max: String(type.max),
      step: String(type.step),
    });
    const out = el("output", { for: id });
    // While dragging, only the value and the share string follow; the rest on release.
    input.addEventListener("input", () => {
      settings = applySettings(settings, { [option.key]: Number(input.value) });
      out.textContent = formatOption(option, settings[option.key]);
      $<HTMLTextAreaElement>("share").value = encodeSettings(settings);
    });
    input.addEventListener("change", () => update(option.key, Number(input.value)));
    const nudge = (by: 1 | -1) => {
      const raw = (settings[option.key] as number) + by * type.step;
      const value = Math.min(type.max, Math.max(type.min, Number(raw.toFixed(4))));
      update(option.key, value);
    };
    const less = arrowButton(false, `Less: ${option.label}`);
    const more = arrowButton(true, `More: ${option.label}`);
    less.addEventListener("click", () => nudge(-1));
    more.addEventListener("click", () => nudge(1));
    wrap.append(
      el(
        "div",
        { class: "option-row" },
        optionText(option, id),
        el("div", { class: "amount" }, less, input, more, out),
      ),
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
          el(
            "span",
            { class: "choice-text" },
            el("span", { class: "choice-label" }, choice.label),
            el("span", { class: "note" }, choice.help),
          ),
        ),
      );
    }
    wrap.append(optionText(option, null), group);
  }
  return wrap;
}

function buildOptionPanels(): void {
  for (const step of OPTION_STEPS) {
    const panel = el("section", { class: "panel", "data-step": step.id, hidden: "" });
    if (step.intro) panel.append(el("p", { class: "intro" }, step.intro));
    for (const section of step.sections ?? []) {
      const options = OPTIONS.filter((o) => o.section === section);
      if (options.length === 0) continue;
      const block = el("div", { class: "option-section" });
      // A step of one section already has its name as the title.
      if ((step.sections?.length ?? 0) > 1)
        block.append(el("h3", { class: "subheading" }, section));
      for (const option of options) block.append(renderOption(option));
      panel.append(block);
    }
    $("option-panels").append(panel);
  }
}

// ---------------------------------------------------------------- presets

function presetSettings(preset: Preset): Settings {
  return applySettings(defaultSettings(settings.seed), preset.changes);
}

function matchesPreset(preset: Preset): boolean {
  const target = presetSettings(preset);
  return OPTIONS.every((o) => target[o.key] === settings[o.key]);
}

function buildPresets(): void {
  for (const preset of PRESETS) {
    const input = el("input", { type: "radio", name: "preset", value: preset.name });
    input.addEventListener("change", () => {
      settings = presetSettings(preset);
      render();
      say($("share-status"), `Loaded the ${preset.name} preset.`, "ok");
    });
    $("presets").append(
      el(
        "label",
        { class: "choice" },
        input,
        el(
          "span",
          { class: "choice-text" },
          el("span", { class: "choice-label" }, preset.name),
          el("span", { class: "note" }, preset.help),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- rendering

/** Brings the page in line with `settings`, the files and the current step. */
function render(): void {
  const seedInput = $<HTMLInputElement>("seed");
  if (document.activeElement !== seedInput) seedInput.value = settings.seed;

  for (const option of OPTIONS) {
    const wrap = document.querySelector<HTMLElement>(`[data-key="${option.key}"]`)!;
    const value = settings[option.key];
    const active = isActive(settings, option);
    if (option.type.kind === "boolean") {
      $<HTMLInputElement>(`opt-${option.key}`).checked = value as boolean;
    } else if (option.type.kind === "number") {
      $<HTMLInputElement>(`opt-${option.key}`).value = String(value);
      wrap.querySelector("output")!.textContent = formatOption(option, value);
      const [less, more] = wrap.querySelectorAll<HTMLButtonElement>(".arrow");
      less!.disabled = !active || (value as number) <= option.type.min;
      more!.disabled = !active || (value as number) >= option.type.max;
    } else {
      for (const radio of wrap.querySelectorAll<HTMLInputElement>("input[type=radio]")) {
        radio.checked = radio.value === value;
      }
    }
    wrap.classList.toggle("off", !active);
    for (const input of wrap.querySelectorAll("input")) input.disabled = !active;
  }

  const preset = PRESETS.find(matchesPreset);
  for (const radio of document.querySelectorAll<HTMLInputElement>("input[name=preset]")) {
    radio.checked = radio.value === preset?.name;
  }

  $<HTMLTextAreaElement>("share").value = encodeSettings(settings);
  $("eboot-list").replaceChildren(
    ...OPTIONS.filter((o) => o.eboot && settings[o.key] === true && isActive(settings, o)).map(
      (o) => el("li", {}, o.label),
    ),
  );
  // Settings that drop the EBOOT step while it's showing move on to the review.
  if (!visibleSteps().some((s) => s.id === current)) {
    current = "review";
    reached.add(current);
  }
  renderSteps();
  if (current === "review") renderSummary(preset);
  if (current === "run") renderStale();
  save();
}

function renderSteps(): void {
  const steps = visibleSteps();
  const at = steps.findIndex((s) => s.id === current);
  const step = steps[at]!;

  $("steps").replaceChildren(
    ...steps.map((s, i) => {
      const button = el(
        "button",
        { type: "button", class: "step", "data-goto": s.id },
        el("span", { class: "step-number" }, String(i + 1)),
        icon(s),
        el("span", { class: "step-label" }, s.title),
      );
      button.disabled = !reached.has(s.id) || (s.id === "run" && !ranOnce);
      button.classList.toggle("done", i < at && reached.has(s.id));
      if (s.id === current) button.setAttribute("aria-current", "step");
      button.addEventListener("click", () => {
        closeStepMenu();
        go(s.id);
      });
      return el("li", {}, button);
    }),
  );
  $("progress").replaceChildren(
    ...steps.map((s, i) =>
      el("span", {
        class: s.id === current ? "current" : i < at && reached.has(s.id) ? "done" : "",
      }),
    ),
  );

  $("step-count").textContent = `Step ${at + 1}/${steps.length}`;
  $("step-title").textContent = step.title;
  for (const panel of document.querySelectorAll<HTMLElement>(".panel")) {
    panel.hidden = panel.dataset.step !== current;
  }

  const back = $<HTMLButtonElement>("back");
  back.classList.toggle("invisible", at === 0);
  const next = $<HTMLButtonElement>("next");
  next.classList.toggle("invisible", current === "review" || current === "run");
  const following = steps[at + 1];
  next.querySelector("span")!.textContent = following?.id === "review" ? "Review" : "Next";
}

/** Flags the last run's results once the settings or disc differ from what made them. */
function renderStale(): void {
  $("stale").hidden =
    busy || !ranWith || (ranWith.settings === encodeSettings(settings) && ranWith.iso === iso);
}

function renderSummary(preset: Preset | undefined): void {
  const groups: HTMLElement[] = [];
  const group = (step: Step, lines: { text: string; off?: boolean }[]) => {
    const edit = el("button", { type: "button", class: "summary-edit" }, step.title);
    edit.addEventListener("click", () => go(step.id));
    groups.push(
      el(
        "div",
        { class: "summary-group" },
        el("dt", {}, icon(step), edit),
        ...lines.map((l) => el("dd", l.off ? { class: "off" } : {}, l.text)),
      ),
    );
  };
  const byId = (id: string) => STEPS.find((s) => s.id === id)!;

  group(byId("game"), [
    {
      text: iso
        ? `${iso.name}${disc?.discId ? ` · ${disc.discId} (${disc.region?.toUpperCase()})` : ""}`
        : "No disc image yet",
      off: !iso,
    },
  ]);
  group(byId("start"), [
    { text: `Seed: ${settings.seed}` },
    { text: `Preset: ${preset ? preset.name : "custom"}` },
  ]);
  for (const step of OPTION_STEPS) {
    const lines: { text: string; off?: boolean }[] = [];
    for (const option of OPTIONS.filter((o) => step.sections?.includes(o.section))) {
      if (!isActive(settings, option)) continue;
      const value = settings[option.key];
      lines.push(
        option.type.kind === "boolean"
          ? { text: `${value ? "✓" : "✗"} ${option.label}`, off: !value }
          : { text: `${option.label}: ${formatOption(option, value)}` },
      );
    }
    group(step, lines);
  }
  if (needsEboot(settings)) {
    group(byId("eboot"), [
      { text: eboot ? eboot.name : "No EBOOT yet", off: !eboot || !ebootOk() },
    ]);
  }
  $("summary").replaceChildren(...groups);
}

// ---------------------------------------------------------------- moving between steps

/** Why the player can't leave a step yet, or null if they can. */
function blocker(step: string): string | null {
  if (step === "game") {
    if (!iso) return "Pick your disc image first.";
    if (checking) return "Still checking your disc…";
    if (checkError) return checkError;
    if (!discOk()) return "That disc isn't supported: use the EU or JP disc.";
  }
  if (step === "start" && !$<HTMLInputElement>("seed").value.trim()) return "Enter a seed.";
  if (step === "eboot" && needsEboot(settings)) {
    if (!eboot) return "Add your decrypted EBOOT, or turn these settings off.";
    if (checking) return "Still checking your EBOOT…";
    if (!ebootOk()) return "That EBOOT isn't decrypted: dump it with PPSSPP.";
  }
  return null;
}

function go(id: string): void {
  current = id;
  reached.add(id);
  say($("nav-status"), "");
  render();
  $("step-menu").focus({ preventScroll: true });
  const top = document.querySelector(".frame")!.getBoundingClientRect().top;
  if (top < 0) window.scrollBy({ top: top - 8, behavior: "smooth" });
}

/** The step menu in the card's header: open, close, and close on Escape or a click elsewhere. */
function closeStepMenu(): void {
  $("steps").hidden = true;
  $("step-menu").setAttribute("aria-expanded", "false");
}

function stepMenu(): void {
  const menu = $("step-menu");
  const list = $("steps");
  menu.addEventListener("click", () => {
    const open = list.hidden;
    list.hidden = !open;
    menu.setAttribute("aria-expanded", String(open));
    if (open) list.querySelector<HTMLElement>("[aria-current]")?.focus();
  });
  document.addEventListener("click", (event) => {
    if (!list.hidden && !menu.parentElement!.parentElement!.contains(event.target as Node)) {
      closeStepMenu();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !list.hidden) {
      closeStepMenu();
      menu.focus();
    }
  });
}

function step(by: 1 | -1): void {
  const steps = visibleSteps();
  const at = steps.findIndex((s) => s.id === current);
  if (by === 1) {
    const reason = blocker(current);
    if (reason) return say($("nav-status"), reason, "err");
  }
  const target = current === "run" && by === -1 ? "review" : steps[at + by]?.id;
  if (target) go(target);
}

/** From the start step straight to the review, stopping at any step that still needs something. */
function skipToReview(): void {
  for (const s of visibleSteps()) {
    if (s.id === "review") return go("review");
    if (s.id === "run") continue;
    reached.add(s.id);
    if (blocker(s.id)) return go(s.id);
  }
}

// ---------------------------------------------------------------- files

function setFile(kind: "iso" | "eboot", file: File | null): void {
  if (kind === "iso") iso = file;
  else eboot = file;
  const drop = $(`${kind}-drop`);
  drop.classList.toggle("chosen", file !== null);
  $(`${kind}-name`).textContent = file
    ? `${file.name} (${megabytes(file)})`
    : kind === "iso"
      ? "Choose your disc image (.iso)"
      : "Choose your decrypted EBOOT";
  void checkFiles();
}

let checkToken = 0;
async function checkFiles(): Promise<void> {
  const token = ++checkToken;
  if (!iso) {
    disc = null;
    checking = false;
    checkError = null;
    say($("check-status"), "");
    return;
  }
  checking = true;
  checkError = null;
  say($("check-status"), "Checking your disc…", "busy");
  if (eboot) say($("eboot-status"), "Checking your EBOOT…", "busy");
  const r = await ask({ type: "check", iso, eboot });
  if (token !== checkToken) return;
  checking = false;
  say($("nav-status"), "");
  if (r.type === "error") {
    disc = null;
    checkError = r.message;
    say($("check-status"), r.message, "err");
    return render();
  }
  if (r.type !== "checked") return;
  disc = r;
  const region = r.region ? ` (${r.region.toUpperCase()})` : "";
  say(
    $("check-status"),
    r.supported
      ? `${r.discId}${region} is supported. Ready when you are!`
      : `${r.discId ?? "This disc"}${region} isn't supported yet (the EU and JP discs are).`,
    r.supported ? "ok" : "err",
  );
  if (r.eboot) {
    say($("eboot-status"), `The EBOOT is ${r.eboot.detail}.`, r.eboot.ok ? "ok" : "err");
  } else say($("eboot-status"), "");
  render();
}

/** Drag and drop onto a file picker, as well as clicking it. */
function droppable(kind: "iso" | "eboot"): void {
  const drop = $(`${kind}-drop`);
  const input = $<HTMLInputElement>(kind);
  input.addEventListener("change", () => setFile(kind, input.files?.[0] ?? null));
  drop.addEventListener("dragover", (event) => {
    event.preventDefault();
    drop.classList.add("dragging");
  });
  drop.addEventListener("dragleave", (event) => {
    if (!drop.contains(event.relatedTarget as Node | null)) drop.classList.remove("dragging");
  });
  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    drop.classList.remove("dragging");
    const file = event.dataTransfer?.files[0];
    if (file) setFile(kind, file);
  });
}

// ---------------------------------------------------------------- runs

function outputName(file: File, seed: string): string {
  return `${file.name.replace(/\.iso$/i, "")} (randomfu ${seed}).iso`;
}

async function run(dryRun: boolean): Promise<void> {
  if (busy) return;
  const reason = blocker("game") ?? blocker("eboot");
  if (reason || !iso) return say($("nav-status"), reason ?? "Pick your disc image first.", "err");
  const file = iso;
  const seed = settings.seed;
  ranWith = { settings: encodeSettings(settings), iso: file };
  busy = true;
  ranOnce = true;
  for (const id of ["run", "dry-run"]) $<HTMLButtonElement>(id).disabled = true;
  for (const url of urls.splice(0)) URL.revokeObjectURL(url);
  $("downloads").replaceChildren();
  $("log").textContent = "";
  $<HTMLDetailsElement>("log-wrap").open = true;
  $("spoiler-wrap").hidden = true;
  go("run");
  say($("run-status"), dryRun ? "Reading the disc…" : "Randomizing… this takes a moment.", "busy");
  onLog = (line) => {
    const log = $("log");
    log.textContent += `${line}\n`;
    log.scrollTop = log.scrollHeight;
  };
  try {
    const r = await ask({ type: "run", iso: file, eboot, settings, dryRun });
    if (r.type === "error") throw new Error(r.message);
    if (r.type !== "done") throw new Error("The run stopped without finishing.");
    showSpoiler(r.spoiler);
    const spoilerName = `${outputName(file, seed).replace(/\.iso$/, "")} spoiler.txt`;
    const links: HTMLElement[] = [];
    if (r.segments) {
      const parts = r.segments.map((s: Segment) =>
        "data" in s ? s.data : file.slice(s.start, s.end),
      );
      const blob = new Blob(parts as BlobPart[], { type: "application/octet-stream" });
      links.push(download(outputName(file, seed), blob, "Download randomized ISO"));
    } else {
      const now = el(
        "button",
        { type: "button", class: "button primary", id: "run-now" },
        "Randomize!",
      );
      now.addEventListener("click", () => void run(false));
      links.push(now);
    }
    const spoilerLink = download(
      spoilerName,
      new Blob([r.spoiler], { type: "text/plain" }),
      "Download spoiler log",
    );
    spoilerLink.className = "button";
    links.push(spoilerLink);
    $("downloads").replaceChildren(...links);
    $<HTMLDetailsElement>("log-wrap").open = false;
    const warn =
      r.problems.length > 0
        ? ` ${r.problems.length} recipe warnings; see the top of the spoiler log.`
        : "";
    say(
      $("run-status"),
      (dryRun ? "Preview ready. Happy with it?" : "Done! Download your ISO and good hunting.") +
        warn,
      warn ? "err" : "ok",
    );
  } catch (error) {
    $("log").textContent += `\nError: ${(error as Error).message}\n`;
    say($("run-status"), (error as Error).message, "err");
  } finally {
    busy = false;
    for (const id of ["run", "dry-run"]) $<HTMLButtonElement>(id).disabled = false;
    renderSteps();
    renderStale();
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

// ---------------------------------------------------------------- loading shared settings

function loaded(message: string, kind: "ok" | "err"): void {
  render();
  say($("share-status"), message, kind);
  $("skip-row").hidden = false;
}

// ---------------------------------------------------------------- start

function init(): void {
  $("version").textContent = `· logic v${LOGIC_VERSION}`;
  restore();
  buildOptionPanels();
  buildPresets();
  droppable("iso");
  droppable("eboot");
  stepMenu();
  render();

  $("back").addEventListener("click", () => step(-1));
  $("next").addEventListener("click", () => step(1));

  $<HTMLInputElement>("seed").addEventListener("input", () => {
    const seed = $<HTMLInputElement>("seed").value.trim();
    if (!seed) return;
    settings = { ...settings, seed };
    $<HTMLTextAreaElement>("share").value = encodeSettings(settings);
  });
  $<HTMLInputElement>("seed").addEventListener("change", () => render());
  $("new-seed").addEventListener("click", () => {
    settings = { ...settings, seed: randomSeed() };
    render();
  });

  $("apply-paste").addEventListener("click", () => {
    try {
      const { settings: decoded, version } = decodeSettings($<HTMLInputElement>("paste").value);
      settings = decoded;
      loaded(
        version === LOGIC_VERSION
          ? "Loaded the settings string."
          : `Made with logic v${version}; this is v${LOGIC_VERSION}, so the same seed gives a different game.`,
        version === LOGIC_VERSION ? "ok" : "err",
      );
    } catch (error) {
      say($("share-status"), (error as Error).message, "err");
    }
  });
  $("import").addEventListener("click", () => $("import-file").click());
  $<HTMLInputElement>("import-file").addEventListener("change", async () => {
    const input = $<HTMLInputElement>("import-file");
    const file = input.files?.[0];
    if (!file) return;
    try {
      settings = settingsFromJson(await file.text(), settings.seed);
      loaded(`Loaded ${file.name}.`, "ok");
    } catch (error) {
      say($("share-status"), error instanceof SettingsError ? error.message : String(error), "err");
    } finally {
      input.value = "";
    }
  });
  $("skip").addEventListener("click", skipToReview);

  $("drop-eboot").addEventListener("click", () => {
    const off = Object.fromEntries(
      OPTIONS.filter((o) => o.eboot && o.type.kind === "boolean").map((o) => [o.key, false]),
    );
    settings = applySettings(settings, off);
    go("review");
  });

  $("copy").addEventListener("click", () => {
    navigator.clipboard.writeText($<HTMLTextAreaElement>("share").value).then(
      () => say($("copy-status"), "Copied.", "ok"),
      () => {
        $<HTMLTextAreaElement>("share").select();
        say($("copy-status"), "Select and copy the string above.");
      },
    );
  });
  $("export").addEventListener("click", () => {
    download(
      `randomfu-${settings.seed}.json`,
      new Blob([settingsToJson(settings)], { type: "application/json" }),
      "",
    ).click();
  });

  $("filter").addEventListener("input", filterSpoiler);
  $("run").addEventListener("click", () => void run(false));
  $("dry-run").addEventListener("click", () => void run(true));
}

init();
