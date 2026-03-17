import { Application, Controller } from "/vendor/javascript/stimulus.js";
import Fuse from "/vendor/javascript/fuse.js";

if (!window.Stimulus) {
  window.Stimulus = Application.start();
}

/**
 * Every time turbo loads a weapon we want to change the title to the weapon's
 * name, this reflects in the user browsing history.
 */
window.addEventListener("turbo:render", (event) => {
  if (event.target.querySelector("#weapon_name")) {
    document.title = `${
      event.target.querySelector("#weapon_name").innerText
    } - MHFU`;
  }
});

// TODO: Fix for properly avoiding subsequent turbo frame loads.
window.addEventListener("turbo:frame-load", (event) => {
  const components = window.location.pathname.split("/");
  const weaponId = components.pop() || components.pop();

  if (event.target.querySelector(`[id='${weaponId}']`)) {
    event.target.querySelector(`[id='${weaponId}']`).scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });
  }
});

// WIP
Stimulus.register(
  "weapon-row-toggle",
  class extends Controller {
    static targets = ["weaponChildren"];

    initialize() {
      this.hidden = false;
    }

    toggle(event) {
      event.preventDefault();
      this.hidden = !this.hidden;

      this.weaponChildrenTarget.style.visibility = this.hidden ? "hidden" : "";
      this.weaponChildrenTarget.style.height = this.hidden ? "0" : "";
      event.currentTarget.style.opacity = this.hidden ? "1" : "";
      event.currentTarget.innerText = this.hidden ? "[+]" : "[-]";
    }
  }
);

// TODO: Improve this hacky zoom.
Stimulus.register(
  "image-zoom",
  class extends Controller {
    zoom(event) {
      // Prevent the browser from scrolling if there is overflow.
      event.preventDefault();

      if (event.deltaY < 0) {
        this.element.style.width = `${Math.min(
          Math.max(this.element.offsetWidth + 35, 220),
          950
        )}px`;
      } else if (event.deltaY > 0) {
        this.element.style.width = `${Math.min(
          Math.max(this.element.offsetWidth - 35, 220),
          950
        )}px`;
      }
    }
  }
);

// TODO: Fix this hacky repositioning logic.
Stimulus.register(
  "image-position",
  class extends Controller {
    static targets = ["image"];

    initialize() {
      this.boundHandleMouseDown = this.handleMouseDown.bind(this);
      this.boundHandleMouseMove = this.handleMouseMove.bind(this);
      this.boundHandleMouseUp = this.handleMouseUp.bind(this);

      this.pos1 = 0; this.pos2 = 0; this.pos3 = 0; this.pos4 = 0;
    }

    connect() {
      this.imageTarget.addEventListener("mousedown", this.boundHandleMouseDown);
      this.imageTarget.addEventListener(
        "touchstart",
        this.boundHandleMouseDown
      );
      document.addEventListener("mouseup", this.boundHandleMouseUp);
      document.addEventListener("touchend", this.boundHandleMouseUp);
      document.addEventListener("mousemove", this.boundHandleMouseMove);
      document.addEventListener("touchmove", this.boundHandleMouseMove);
    }

    disconnect() {
      this.imageTarget.removeEventListener(
        "mousedown",
        this.boundHandleMouseDown
      );
      this.imageTarget.removeEventListener(
        "touchstart",
        this.boundHandleMouseDown
      );
      document.removeEventListener("mouseup", this.boundHandleMouseUp);
      document.removeEventListener("touchend", this.boundHandleMouseUp);
      document.removeEventListener("mousemove", this.boundHandleMouseMove);
      document.removeEventListener("touchmove", this.boundHandleMouseMove);
    }

    handleMouseDown(event) {
      this.imageTarget.classList.add("dragging");
      this.pos3 = event.clientX;
      this.pos4 = event.clientY;
    }

    handleMouseMove(event) {
      if (event.touches && event.touches.length > 0) {
        this.pos1 = this.pos3 - event.touches[0].clientX;
        this.pos2 = this.pos4 - event.touches[0].clientY;
        this.pos3 = event.touches[0].clientX;
        this.pos4 = event.touches[0].clientY;
      } else {
        this.pos1 = this.pos3 - event.clientX;
        this.pos2 = this.pos4 - event.clientY;
        this.pos3 = event.clientX;
        this.pos4 = event.clientY;
      }

      if (this.imageTarget.classList.contains("dragging")) {
        this.imageTarget.style.left = `${
          this.imageTarget.offsetLeft - 8 - this.pos1
        }px`;
        this.imageTarget.style.top = `${
          this.imageTarget.offsetTop - 8 - this.pos2
        }px`;
      }
    }

    handleMouseUp() {
      this.imageTarget.classList.remove("dragging");
    }
  }
);

Stimulus.register(
  "weapon-page",
  class extends Controller {
    static values = {
      page: Number,
    };

    initialize() {
      this.pages = [];
      this.boundHandleKeyUp = this.handleKeyUp.bind(this);
    }

    connect() {
      this.element.querySelectorAll(".page").forEach((div, index) => {
        div.id = `page-${index + 1}`;
      });
      this.pages = Array.from(this.element.querySelectorAll("[id*=page]"));

      if (this.pages.length == 1) {
        this.element.querySelector(".weapon-card__navigation").style.display =
          "none";
      } else {
        document.addEventListener("keyup", this.boundHandleKeyUp);
      }
    }

    disconnect() {
      document.removeEventListener("keyup", this.boundHandleKeyUp);
    }

    handleKeyUp(event) {
      if (event.code == "ArrowRight" || event.code == "KeyD") {
        this.next();
      }

      if (event.code == "ArrowLeft" || event.code == "KeyA") {
        this.previous();
      }
    }

    previous() {
      if (this.pageValue > 1) {
        this.pageValue = this.pageValue - 1;
      } else {
        this.pageValue = this.pages.length;
      }
    }

    next() {
      if (this.pageValue < this.pages.length) {
        this.pageValue = this.pageValue + 1;
      } else {
        this.pageValue = 1;
      }
    }
  }
);

Stimulus.register(
  "global-search",
  class extends Controller {
    static targets = ["input", "results", "modal"];

    initialize() {
      this.fuse = null;
      this.items = [];
      this.selectedIndex = -1;
      this.boundHandleGlobalKeydown = this.handleGlobalKeydown.bind(this);
      this.boundHandleTriggerClick = this.handleTriggerClick.bind(this);
    }

    connect() {
      document.addEventListener("keydown", this.boundHandleGlobalKeydown);
      document.addEventListener("click", this.boundHandleTriggerClick);
    }

    disconnect() {
      document.removeEventListener("keydown", this.boundHandleGlobalKeydown);
      document.removeEventListener("click", this.boundHandleTriggerClick);
    }

    handleTriggerClick(event) {
      if (event.target.closest(".search-trigger")) {
        this.open();
      }
    }

    async open() {
      if (!this.fuse) {
        await this.loadIndex();
      }
      this.modalTarget.removeAttribute("aria-hidden");
      this.modalTarget.classList.add("is-open");
      this.inputTarget.focus();
    }

    close() {
      this.modalTarget.setAttribute("aria-hidden", "true");
      this.modalTarget.classList.remove("is-open");
      this.inputTarget.value = "";
      this.resultsTarget.innerHTML = "";
      this.items = [];
      this.selectedIndex = -1;
    }

    async loadIndex() {
      try {
        const response = await fetch("/search-data.json");
        const data = await response.json();
        this.fuse = new Fuse(data, {
          keys: [
            { name: "name", weight: 1.0 },
            { name: "skills", weight: 0.5 },
            { name: "elements", weight: 0.3 },
            { name: "type", weight: 0.3 },
          ],
          threshold: 0.35,
          minMatchCharLength: 2,
          includeScore: true,
        });
      } catch (e) {
        console.warn("Failed to load search index", e);
      }
    }

    handleGlobalKeydown(event) {
      const isOpen = this.modalTarget.classList.contains("is-open");

      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        isOpen ? this.close() : this.open();
        return;
      }

      if (
        !isOpen &&
        event.key === "/" &&
        !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
      ) {
        event.preventDefault();
        this.open();
        return;
      }

      if (isOpen && event.key === "Escape") {
        this.close();
      }
    }

    onInputKeydown(event) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.moveSelection(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        this.moveSelection(-1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        this.navigateToSelected();
      }
    }

    search() {
      const query = this.inputTarget.value.trim();
      this.selectedIndex = -1;

      if (!this.fuse || query.length < 2) {
        this.resultsTarget.innerHTML = "";
        this.items = [];
        return;
      }

      this.items = this.fuse.search(query, { limit: 10 });
      this.renderResults();
    }

    renderResults() {
      if (this.items.length === 0) {
        this.resultsTarget.innerHTML = `<p class="search-results__empty">No results found</p>`;
        return;
      }

      this.resultsTarget.innerHTML = this.items
        .map((result, index) => {
          const item = result.item;
          const selected = index === this.selectedIndex;
          const iconClass = this.iconClassFor(item);
          const iconSrc = this.iconSrcFor(item);

          return `<a
          href="${item.url}"
          class="weapon-tree__row${selected ? " search-result--selected" : ""}"
          role="option"
          aria-selected="${selected}"
          data-action="click->global-search#close"
        >
          <div class="${iconClass}">
            <img src="${iconSrc}" alt="" onerror="this.parentElement.style.opacity='0'">
          </div>
          <div class="search-result__text">
            <p class="search-result__name">${item.name}</p>
          </div>
        </a>`;
        })
        .join("");
    }

    iconClassFor(item) {
      const rarity = item.rarity || 1;
      switch (item.category) {
        case "weapon":
          return `icon icon--mini icon--${item.type} icon--rarity-${rarity}`;
        case "armor":
          return `icon icon--${item.type} icon--rarity-${rarity}`;
        case "decoration":
          return `icon icon--decoration icon--rarity-${rarity}`;
        default:
          return `icon icon--monster icon--${item.type}`;
      }
    }

    iconSrcFor(item) {
      switch (item.category) {
        case "weapon":
          return `/images/${item.type}-mini.png`;
        case "armor":
          return `/images/${item.type}-mini.png`;
        case "decoration":
          return `/images/decoration-mini.png`;
        case "monster":
          return `/images/monsters/${item.slug}.png`;
        default:
          return "/images/unknown.png";
      }
    }

    moveSelection(delta) {
      const count = this.items.length;
      if (count === 0) return;

      this.selectedIndex =
        ((this.selectedIndex + delta) % count + count) % count;
      this.renderResults();

      const selected = this.resultsTarget.querySelector(
        ".search-result--selected"
      );
      if (selected) selected.scrollIntoView({ block: "nearest" });
    }

    navigateToSelected() {
      if (this.selectedIndex >= 0 && this.items[this.selectedIndex]) {
        const url = this.items[this.selectedIndex].item.url;
        this.close();
        Turbo.visit(url);
      }
    }
  }
);
