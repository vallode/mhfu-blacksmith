import { Application, Controller } from "/vendor/javascript/stimulus.js";

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

      this.pos1, this.pos2, this.pos3, (this.pos4 = 0);
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
      if (event.touches) {
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
        document.addEventListener("keyup", (event) => {
          if (event.code == "ArrowRight" || event.code == "KeyD") {
            this.next();
          }

          if (event.code == "ArrowLeft" || event.code == "KeyA") {
            this.previous()
          }
        });
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
