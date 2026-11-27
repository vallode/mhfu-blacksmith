/**
 * The Whetstone web app's builder page: a step-by-step walk over
 * `WHETSTONE_OPTIONS`. The steps are the disc, a preset, one step per group
 * of option sections (steps.ts), a review, and the run.
 *
 * Runs happen in a worker. The finished ISO is assembled as a Blob from
 * slices of the user's own file plus the changed bytes, so a whole disc
 * image is never copied into memory.
 */
import { formatOption, type OptionDef } from "whetstone/src/options.js";
import {
  WHETSTONE_OPTIONS,
  SettingsError,
  applyWhetstoneSettings,
  decodeWhetstoneSettings,
  defaultWhetstoneSettings,
  encodeWhetstoneSettings,
  isWhetstoneActive,
  whetstoneSettingsFromJson,
  whetstoneSettingsToJson,
  type WhetstoneKey,
  type WhetstoneSettings,
} from "whetstone/src/settings.js";
import { WHETSTONE_VERSION } from "whetstone/src/version.js";
import type { Request, Response, Segment } from "./protocol.js";
import {
  OPTION_STEPS,
  PRESETS,
  SECTION_ICONS,
  presetSettings,
  type Preset,
  type Sprite,
  type Step,
} from "./steps.js";

const STORE = "whetstone.web.v1";
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const STEPS: Step[] = [
  { id: "game", title: "Your game", icon: "binoculars" },
  { id: "start", title: "Preset", icon: "star", tint: "var(--color-gem-yellow)" },
  ...OPTION_STEPS,
  { id: "review", title: "Review", icon: "ticket", tint: "var(--color-parchment)" },
  { id: "run", title: "Patch", icon: "max" },
];

// ---------------------------------------------------------------- state

let settings: WhetstoneSettings = defaultWhetstoneSettings();
let current = "game";
/** Steps the player has been to: the step bar lets them go back to any of these. */
const reached = new Set<string>(["game"]);
/** A run (or preview) has started, so the run step has something to show. */
let ranOnce = false;
let busy = false;
/** What the last run was made from, to tell when its results no longer match. */
let ranWith: { settings: string; iso: File } | null = null;

let iso: File | null = null;
/** The last check of the files: null while one is pending or before the first. */
let disc: Extract<Response, { type: "checked" }> | null = null;
let checking = false;
let checkError: string | null = null;

const urls: string[] = [];

const discOk = () => disc?.supported === true;

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

function icon(sprite: Sprite): HTMLElement {
  const span = el("span", { class: "icon", "aria-hidden": "true" });
  setIcon(span, sprite);
  return span;
}

function setIcon(span: HTMLElement, sprite: Sprite): void {
  span.style.setProperty("--icon", `url(images/${sprite.icon}.png)`);
  if (sprite.tint) span.style.setProperty("--tint", sprite.tint);
  else span.style.removeProperty("--tint");
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
    const stored = JSON.parse(localStorage.getItem(STORE) ?? "{}") as {
      settings?: Record<string, unknown>;
    };
    if (!stored.settings) return;
    // An option missing from them is newer, so it keeps its default; one no longer here is dropped.
    const known = new Set<string>(WHETSTONE_OPTIONS.map((o) => o.key));
    const kept = Object.fromEntries(Object.entries(stored.settings).filter(([k]) => known.has(k)));
    settings = applyWhetstoneSettings(defaultWhetstoneSettings(), kept);
  } catch {
    // Missing or damaged: keep the defaults.
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

function update(key: WhetstoneKey, value: boolean | number | string): void {
  settings = applyWhetstoneSettings(settings, { [key]: value });
  render();
}

function optionText(option: OptionDef, labelFor: string | null): HTMLElement {
  const title = labelFor
    ? el("label", { class: "option-title", for: labelFor }, option.label, ...badges(option))
    : el("span", { class: "option-title" }, option.label, ...badges(option));
  return el(
    "div",
    { class: "option-text" },
    title,
    el("p", { class: "note" }, option.help),
    option.points ? helpPoints(option.points) : null,
  );
}

/** Badges after an option's name: where it's switched and which discs it works on. */
function badges(option: OptionDef): HTMLElement[] {
  const list: HTMLElement[] = [];
  const badge = (kind: string, text: string, title: string) =>
    list.push(el("span", { class: `badge ${kind}`, title }, text));
  if (option.inGame)
    badge(
      "in-game",
      "In game",
      "Switch it in game from the START menu's Whetstone entry; your save keeps the choice. This picks how the disc starts.",
    );
  if (option.discs) badge("discs", `${option.discs} only`, `Works on ${option.discs} discs only.`);
  return list;
}

function helpPoints(points: readonly string[]): HTMLElement {
  return el("ul", { class: "help-points" }, ...points.map((point) => el("li", {}, point)));
}

function renderOption(option: OptionDef<WhetstoneKey>): HTMLElement {
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
      settings = applyWhetstoneSettings(settings, { [option.key]: Number(input.value) });
      out.textContent = formatOption(option, settings[option.key]);
      $<HTMLTextAreaElement>("share").value = encodeWhetstoneSettings(settings);
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
    // Choices with only a few words each sit side by side.
    const compact = type.choices.every((c) => c.help.length <= 60);
    const group = el("div", {
      class: compact ? "choices compact" : "choices",
      role: "radiogroup",
      "aria-label": option.label,
    });
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
  if (option.key === "mods.nodeMap") wrap.append(nodeMapPreview());
  return wrap;
}

/**
 * The map screen's picture as "Gathering nodes on the area map" leaves it,
 * for the Great Forest: the site's copy of its texture, at its 160x160
 * pixels, with a marker on each node as Whetstone's patch draws them.
 */
function nodeMapPreview(): HTMLElement {
  const { texture, size, marker, onArtAlpha, colors, points } = NODE_MAP_PREVIEW;
  const canvas = el("canvas", {
    class: "node-map",
    width: String(size),
    height: String(size),
    role: "img",
    "aria-label": "The Great Forest's map with its gathering nodes marked",
  });
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const picture = new Image();
  picture.src = `images/area-maps/${texture}.png`;
  picture
    .decode()
    .then(() => {
      context.drawImage(picture, 0, 0, size, size);
      // As the patch does: a node off the art (where the game draws nothing) gets no marker.
      const art = context.getImageData(0, 0, size, size).data;
      const half = (marker - 1) / 2;
      for (const [kind, x, y] of points) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        if (art[(y * size + x) * 4 + 3]! <= onArtAlpha) continue;
        context.fillStyle = `rgb(${colors[kind].join(" ")})`;
        context.fillRect(x - half, y - half, marker, marker);
      }
    })
    .catch(() => {
      // The picture didn't load: the preview stays empty.
    });
  return canvas;
}

function buildOptionPanels(): void {
  for (const step of OPTION_STEPS) {
    const panel = el("section", { class: "panel", "data-step": step.id, hidden: "" });
    if (step.intro) panel.append(el("p", { class: "intro" }, step.intro));
    for (const section of step.sections ?? []) {
      const options = WHETSTONE_OPTIONS.filter((o) => o.section === section);
      if (options.length === 0) continue;
      const block = el("div", { class: "option-section" });
      // A step of one section already has its name as the title.
      if ((step.sections?.length ?? 0) > 1) {
        const sprite = SECTION_ICONS[section];
        block.append(el("h3", { class: "subheading" }, sprite ? icon(sprite) : null, section));
      }
      for (const option of options) block.append(renderOption(option));
      panel.append(block);
    }
    $("option-panels").append(panel);
  }
}

// ---------------------------------------------------------------- presets

function matchesPreset(preset: Preset): boolean {
  const target = presetSettings(preset);
  return WHETSTONE_OPTIONS.every((o) => target[o.key] === settings[o.key]);
}

function buildPresets(): void {
  for (const preset of PRESETS) {
    const input = el("input", { type: "radio", name: "preset", value: preset.name });
    input.addEventListener("change", () => {
      settings = presetSettings(preset);
      render();
      say($("share-status"), "");
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
          el(
            "ul",
            { class: "preset-points" },
            ...preset.points.map((point) => el("li", {}, point)),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- rendering

/** Brings the page in line with `settings`, the files and the current step. */
function render(): void {
  for (const option of WHETSTONE_OPTIONS) {
    const wrap = document.querySelector<HTMLElement>(`[data-key="${option.key}"]`)!;
    const value = settings[option.key];
    const active = isWhetstoneActive(settings, option);
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
  $("preset-note").textContent = preset
    ? "A preset replaces every option. You can change anything in the next steps."
    : "Your settings don't match a preset. Picking one replaces every option.";

  $<HTMLTextAreaElement>("share").value = encodeWhetstoneSettings(settings);
  renderSteps();
  if (current === "review") renderSummary(preset);
  if (current === "run") renderStale();
  save();
}

function renderSteps(): void {
  const at = STEPS.findIndex((s) => s.id === current);
  const step = STEPS[at]!;

  // The menu's buttons are made once: new ones would load their sprites afresh,
  // and some browsers paint those blank for a frame.
  const list = $("steps");
  if (list.childElementCount === 0) {
    list.replaceChildren(
      ...STEPS.map((s, i) => {
        const button = el(
          "button",
          { type: "button", class: "step", "data-goto": s.id },
          el("span", { class: "step-number" }, String(i + 1)),
          icon(s),
          el("span", { class: "step-label" }, s.title),
        );
        button.addEventListener("click", () => {
          closeStepMenu();
          go(s.id);
        });
        return el("li", {}, button);
      }),
    );
  }
  STEPS.forEach((s, i) => {
    const button = list.querySelector<HTMLButtonElement>(`[data-goto="${s.id}"]`)!;
    button.disabled = !reached.has(s.id) || (s.id === "run" && !ranOnce);
    button.classList.toggle("done", i < at && reached.has(s.id));
    if (s.id === current) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
  $("progress").replaceChildren(
    ...STEPS.map((s, i) =>
      el("span", {
        class: s.id === current ? "current" : i < at && reached.has(s.id) ? "done" : "",
      }),
    ),
  );

  $("step-count").textContent = `Step ${at + 1}/${STEPS.length}`;
  $("step-title").textContent = step.title;
  setIcon($("step-icon"), step);
  for (const panel of document.querySelectorAll<HTMLElement>(".panel")) {
    panel.hidden = panel.dataset.step !== current;
  }

  const back = $<HTMLButtonElement>("back");
  back.classList.toggle("invisible", at === 0);
  const next = $<HTMLButtonElement>("next");
  next.classList.toggle("invisible", current === "review" || current === "run");
  const following = STEPS[at + 1];
  next.querySelector("span")!.textContent = following?.id === "review" ? "Review" : "Next";
}

/** Flags the last run's results once the settings or disc differ from what made them. */
function renderStale(): void {
  $("stale").hidden =
    busy ||
    !ranWith ||
    (ranWith.settings === encodeWhetstoneSettings(settings) && ranWith.iso === iso);
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
  group(byId("start"), [{ text: `Preset: ${preset ? preset.name : "none (custom settings)"}` }]);
  for (const step of OPTION_STEPS) {
    const lines: { text: string; off?: boolean }[] = [];
    for (const option of WHETSTONE_OPTIONS.filter((o) => step.sections?.includes(o.section))) {
      if (!isWhetstoneActive(settings, option)) continue;
      const value = settings[option.key];
      lines.push(
        option.type.kind === "boolean"
          ? { text: `${value ? "✓" : "✗"} ${option.label}`, off: !value }
          : { text: `${option.label}: ${formatOption(option, value)}` },
      );
    }
    group(step, lines);
  }
  $("summary").replaceChildren(...groups);
}

// ---------------------------------------------------------------- moving between steps

/** Why the player can't leave a step yet, or null if they can. */
function blocker(step: string): string | null {
  if (step === "game") {
    if (!iso) return "Choose your disc image first.";
    if (checking) return "Still checking your disc…";
    if (checkError) return checkError;
    if (!discOk()) return "That disc isn't supported: use the EU, JP or FUC disc.";
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
  const at = STEPS.findIndex((s) => s.id === current);
  if (by === 1) {
    const reason = blocker(current);
    if (reason) return say($("nav-status"), reason, "err");
  }
  const target = current === "run" && by === -1 ? "review" : STEPS[at + by]?.id;
  if (target) go(target);
}

/** From the preset step straight to the run, stopping at any step that still needs something. */
function downloadNow(): void {
  for (const s of STEPS) {
    if (s.id === "review" || s.id === "run") break;
    reached.add(s.id);
    if (blocker(s.id)) return go(s.id);
  }
  reached.add("review");
  void run(false);
}

// ---------------------------------------------------------------- files

function setFile(file: File | null): void {
  iso = file;
  $("iso-drop").classList.toggle("chosen", file !== null);
  $("iso-name").textContent = file
    ? `${file.name} (${megabytes(file)})`
    : "Choose your disc image (.iso)";
  void checkFiles();
}

/**
 * Shows how the disc's check went on its picker: a spinner while it runs, a
 * green tick once it passes, a red cross if it fails. A failure's reason is
 * spelled out under the picker; a pass's sentence is only read out to screen
 * readers, as the tick says it all.
 */
function checked(text: string, state?: "ok" | "err" | "busy"): void {
  const mark = $("iso-mark");
  mark.className = `drop-mark${state ? ` ${state}` : ""}`;
  mark.textContent = state === "ok" ? "✓" : state === "err" ? "✗" : "";
  mark.title = state === "busy" ? "" : text;
  const status = $("check-status");
  say(status, text, state === "busy" ? undefined : state);
  status.classList.toggle("visually-hidden", state === "ok" || state === "busy");
}

let checkToken = 0;
async function checkFiles(): Promise<void> {
  const token = ++checkToken;
  if (!iso) {
    disc = null;
    checking = false;
    checkError = null;
    checked("");
    return;
  }
  checking = true;
  checkError = null;
  checked("Checking your disc…", "busy");
  const r = await ask({ type: "check", iso });
  if (token !== checkToken) return;
  checking = false;
  say($("nav-status"), "");
  if (r.type === "error") {
    disc = null;
    checkError = r.message;
    checked(r.message, "err");
    return render();
  }
  if (r.type !== "checked") return;
  disc = r;
  const region = r.region ? ` (${r.region.toUpperCase()})` : "";
  checked(
    r.supported
      ? `${r.discId}${region} is supported. Ready when you are!`
      : `${r.discId ?? "This disc"}${region} isn't supported (the EU, JP and FUC discs are).`,
    r.supported ? "ok" : "err",
  );
  render();
}

/** Drag and drop onto the disc picker, as well as clicking it. */
function droppable(): void {
  const drop = $("iso-drop");
  const input = $<HTMLInputElement>("iso");
  input.addEventListener("change", () => setFile(input.files?.[0] ?? null));
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
    if (file) setFile(file);
  });
}

// ---------------------------------------------------------------- runs

/**
 * For testing in game, from the address: `?poogie-test` makes a happy Poogie
 * always give the rarest reward and `?loader-demo` adds the code loader's
 * demo. Neither is for play.
 */
const params = new URLSearchParams(location.search);
const testing = {
  poogieTest: params.has("poogie-test"),
  loaderDemo: params.has("loader-demo"),
};

function outputName(file: File): string {
  return `${file.name.replace(/\.iso$/i, "")} (Whetstone).iso`;
}

async function run(dryRun: boolean): Promise<void> {
  if (busy) return;
  const reason = blocker("game");
  if (reason || !iso) return say($("nav-status"), reason ?? "Choose your disc image first.", "err");
  const file = iso;
  ranWith = { settings: encodeWhetstoneSettings(settings), iso: file };
  busy = true;
  ranOnce = true;
  for (const id of ["run", "dry-run"]) $<HTMLButtonElement>(id).disabled = true;
  for (const url of urls.splice(0)) URL.revokeObjectURL(url);
  $("downloads").replaceChildren();
  $("log").textContent = "";
  $<HTMLDetailsElement>("log-wrap").open = true;
  $("report-wrap").hidden = true;
  go("run");
  say($("run-status"), dryRun ? "Reading the disc…" : "Patching… this takes a moment.", "busy");
  onLog = (line) => {
    const log = $("log");
    log.textContent += `${line}\n`;
    log.scrollTop = log.scrollHeight;
  };
  try {
    const r = await ask({ type: "run", iso: file, settings, options: { ...testing, dryRun } });
    if (r.type === "error") throw new Error(r.message);
    if (r.type !== "done") throw new Error("The run stopped without finishing.");
    $("report").textContent = r.report;
    $("report-wrap").hidden = false;
    const links: HTMLElement[] = [];
    if (r.segments) {
      const parts = r.segments.map((s: Segment) =>
        "data" in s ? s.data : file.slice(s.start, s.end),
      );
      const blob = new Blob(parts as BlobPart[], { type: "application/octet-stream" });
      const link = download(outputName(file), blob, "Download patched ISO");
      link.prepend(icon({ icon: "max" }));
      links.push(link);
    } else {
      const now = el(
        "button",
        { type: "button", class: "button primary", id: "run-now" },
        icon({ icon: "max" }),
        "Patch my disc",
      );
      now.addEventListener("click", () => void run(false));
      links.push(now);
    }
    const logLink = download(
      `${outputName(file).replace(/\.iso$/, "")} log.txt`,
      new Blob([r.report], { type: "text/plain" }),
      "Download log",
    );
    logLink.className = "button";
    logLink.prepend(icon({ icon: "scroll" }));
    links.push(logLink);
    $("downloads").replaceChildren(...links);
    $<HTMLDetailsElement>("log-wrap").open = false;
    say(
      $("run-status"),
      dryRun ? "Preview ready. Happy with it?" : "Done! Download your ISO and good hunting.",
      "ok",
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

// ---------------------------------------------------------------- start

function init(): void {
  restore();
  buildOptionPanels();
  buildPresets();
  droppable();
  stepMenu();
  render();

  $("back").addEventListener("click", () => step(-1));
  $("next").addEventListener("click", () => step(1));

  $("apply-paste").addEventListener("click", () => {
    try {
      const { settings: decoded, version } = decodeWhetstoneSettings(
        $<HTMLInputElement>("paste").value,
      );
      settings = decoded;
      render();
      say(
        $("share-status"),
        version === WHETSTONE_VERSION
          ? "Loaded the settings string."
          : `Loaded. It was made with Whetstone v${version} and this is v${WHETSTONE_VERSION}: the options are the same, the patches may differ.`,
        "ok",
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
      settings = whetstoneSettingsFromJson(await file.text());
      render();
      say($("share-status"), `Loaded ${file.name}.`, "ok");
    } catch (error) {
      say($("share-status"), error instanceof SettingsError ? error.message : String(error), "err");
    } finally {
      input.value = "";
    }
  });
  $("download").addEventListener("click", downloadNow);
  $("customize").addEventListener("click", () => step(1));

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
      "whetstone-settings.json",
      new Blob([whetstoneSettingsToJson(settings)], { type: "application/json" }),
      "",
    ).click();
  });

  $("run").addEventListener("click", () => void run(false));
  $("dry-run").addEventListener("click", () => void run(true));
}

init();
