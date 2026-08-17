const MODULE_ID = "axeom-factions-pf2e";
const FACTION_PANEL_TEMPLATE =
  "modules/axeom-factions-pf2e/templates/FactionPanel.hbs";
const FACTION_BANNER_PARTIAL =
  "modules/axeom-factions-pf2e/templates/FactionBanner.hbs";
const RECENT_ACTIVITY_LIMIT = 1;
const SORT_SETTING = "factionSortMode";
const { DialogV2 } = foundry.applications.api;

const FACTION_SORT_MODES = [
  { value: "recent", label: "Activity" },
  { value: "alphabetical", label: "Alphabetical" },
  { value: "reputation", label: "Reputation" },
];

const stripLeadingThe = (name) => name.replace(/^the\s+/i, "");

const FACTION_COMPARATORS = {
  reputation: (a, b) => b.reputation - a.reputation,
  alphabetical: (a, b) =>
    stripLeadingThe(a.name).localeCompare(stripLeadingThe(b.name)),
  recent: (a, b) => b.latestActivity - a.latestActivity,
};

const getReputationLevel = (value) => {
  if (value >= 30) return "revered";
  if (value >= 15) return "admired";
  if (value >= 5) return "liked";
  if (value >= -4) return "ignored";
  if (value >= -14) return "disliked";
  if (value >= -29) return "hated";
  return "hunted";
};

const formatLevelLabel = (level) =>
  level.charAt(0).toUpperCase() + level.slice(1);

const formatEvent = (event) => ({
  id: event.id,
  factionId: event.factionId,
  factionName: event.factionName,
  amount: event.amount,
  sign: event.amount > 0 ? "+" : "",
  positive: event.amount > 0,
  note: event.note || "—",
  date: new Date(event.timestamp).toLocaleDateString(),
  level: event.level,
});

class FactionTrackerApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  constructor(options) {
    super(options);
    this.actor = options.actor;
    this._draft = { factionId: "", amount: 0, note: "" };
  }

  static DEFAULT_OPTIONS = {
    id: "axeom-faction-tracker",
    classes: ["axeom-faction-tracker"],
    tag: "div",
    window: {
      title: "Faction Reputation",
      icon: "fa-solid fa-flag",
      resizable: true,
    },
    position: { width: 640, height: 480 },
    actions: {
      addFaction: FactionTrackerApp.#onAddFaction,
      removeFaction: FactionTrackerApp.#onRemoveFaction,
      removeEvent: FactionTrackerApp.#onRemoveEvent,
      adjustAmount: FactionTrackerApp.#onAdjustAmount,
      submitEvent: FactionTrackerApp.#onSubmitEvent,
      toggleDropdown: FactionTrackerApp.#onToggleDropdown,
      setSortMode: FactionTrackerApp.#onSetSortMode,
    },
  };

  static PARTS = {
    content: {
      template: FACTION_PANEL_TEMPLATE,
      scrollable: [".event-log"],
    },
  };

  async _prepareContext(_options) {
    const factions = this.actor.getFlag(MODULE_ID, "factions") ?? {};
    const isOwner = this.actor.isOwner;
    const sortMode = game.settings.get(MODULE_ID, SORT_SETTING);

    const factionList = Object.entries(factions)
      .map(([id, faction]) => {
        const level = getReputationLevel(faction.reputation);
        const events = [...(faction.events ?? [])].sort(
          (a, b) => b.timestamp - a.timestamp,
        );
        return {
          id,
          name: faction.name,
          reputation: faction.reputation,
          level,
          levelLabel: formatLevelLabel(level),
          recentEvents: events.slice(0, RECENT_ACTIVITY_LIMIT).map(formatEvent),
          hasEvents: events.length > 0,
          latestActivity: events[0]?.timestamp ?? -Infinity,
        };
      })
      .sort(FACTION_COMPARATORS[sortMode] ?? FACTION_COMPARATORS.reputation);

    const allEvents = Object.entries(factions)
      .flatMap(([id, faction]) => {
        const chronological = [...(faction.events ?? [])].sort(
          (a, b) => a.timestamp - b.timestamp,
        );
        let cumulative = 0;
        return chronological.map((event) => {
          cumulative += event.amount;
          return {
            ...event,
            factionId: id,
            factionName: faction.name,
            level: getReputationLevel(cumulative),
          };
        });
      })
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(formatEvent);

    return {
      isOwner,
      factions: factionList,
      hasFactions: factionList.length > 0,
      events: allEvents,
      hasEvents: allEvents.length > 0,
      draft: this._draft,
      sortOptions: FACTION_SORT_MODES.map((mode) => ({
        ...mode,
        active: mode.value === sortMode,
      })),
    };
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.actor.apps[this.id] = this;

    this.element.insertAdjacentHTML(
      "beforeend",
      `<button type="button" class="header-control ax-button-close" data-tooltip="Close Window" aria-label="Close Window" data-action="close"><div class="inner"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.72143 0L9.65178 1.93103L5.14762 5.14943L1.93036 9.65517L0 7.72414L4.50417 4.50575L7.72143 0Z" fill="url(#paint0_linear_2062_10998)"/>
      <path d="M9.65178 7.72414L7.72143 9.65517L4.50417 5.14943L0 1.93103L1.93036 0L5.14762 4.50575L9.65178 7.72414Z" fill="url(#paint1_linear_2062_10998)"/>
      <defs>
      <linearGradient id="paint0_linear_2062_10998" x1="4.82589" y1="0" x2="4.82589" y2="9.65517" gradientUnits="userSpaceOnUse">
      <stop stop-color="#D9C5A7" style="stop-color:#D9C5A7;stop-color:color(display-p3 0.8515 0.7716 0.6561);stop-opacity:1;"/>
      <stop offset="1" stop-color="#876D49" style="stop-color:#876D49;stop-color:color(display-p3 0.5302 0.4292 0.2877);stop-opacity:1;"/>
      </linearGradient>
      <linearGradient id="paint1_linear_2062_10998" x1="4.82589" y1="0" x2="4.82589" y2="9.65517" gradientUnits="userSpaceOnUse">
      <stop stop-color="#D9C5A7" style="stop-color:#D9C5A7;stop-color:color(display-p3 0.8515 0.7716 0.6561);stop-opacity:1;"/>
      <stop offset="1" stop-color="#876D49" style="stop-color:#876D49;stop-color:color(display-p3 0.5302 0.4292 0.2877);stop-opacity:1;"/>
      </linearGradient>
      </defs>
      </svg>
      </div></button>`,
    );

    this.element.addEventListener("click", (e) => {
      this.element.querySelectorAll(".ax-dropdown.is-open").forEach((menu) => {
        if (!menu.contains(e.target)) menu.classList.remove("is-open");
      });
    });
  }

  _onClose(options) {
    super._onClose(options);
    delete this.actor.apps[this.id];
    this._carouselResizeObserver?.disconnect();
    if (openTracker === this) openTracker = null;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;
    this._setupCarousel();
    root.querySelector(".event-faction")?.addEventListener("change", (e) => {
      this._draft.factionId = e.currentTarget.value;
    });
    root.querySelector(".event-amount")?.addEventListener("input", (e) => {
      this._draft.amount = parseInt(e.currentTarget.value) || 0;
    });
    root.querySelector(".event-note")?.addEventListener("input", (e) => {
      this._draft.note = e.currentTarget.value;
    });

    const eventInput = root.querySelector(".event-input");
    const note = root.querySelector(".event-note");
    eventInput?.addEventListener("mousedown", (e) => {
      if (!note || e.target === note) return;
      const control = e.target.closest("button, select, input, textarea");
      if (control) {
        if (control.tagName === "BUTTON") e.preventDefault();
        return;
      }
      e.preventDefault();
      note.focus();
    });

    root
      .querySelector("#ax-window-header")
      ?.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button")) return;
        this.window.header.dispatchEvent(new PointerEvent(e.type, e));
      });
  }

  _setupCarousel() {
    this._carouselResizeObserver?.disconnect();

    const viewport = this.element.querySelector(".faction-list");
    const track = this.element.querySelector(".faction-track");
    const prevArrow = this.element.querySelector(".carousel-arrow-left");
    const nextArrow = this.element.querySelector(".carousel-arrow-right");
    if (!track) return;

    let snapPoints = [0];
    let maxScroll = 0;

    const NEAR_END_PX = 32;
    const recompute = () => {
      const banners = Array.from(track.children).filter((el) =>
        el.classList.contains("faction-banner"),
      );
      if (!banners.length) {
        snapPoints = [0];
        maxScroll = 0;
        return;
      }
      const trackRect = track.getBoundingClientRect();
      const trackPaddingRight =
        parseFloat(getComputedStyle(track).paddingRight) || 0;
      const rawOffsets = banners.map(
        (b) => b.getBoundingClientRect().left - trackRect.left,
      );
      const firstOffset = rawOffsets[0];
      const last = banners[banners.length - 1];
      const lastRect = last.getBoundingClientRect();
      const contentWidth =
        lastRect.left - trackRect.left + lastRect.width + trackPaddingRight;
      const viewportWidth = viewport.getBoundingClientRect().width;
      maxScroll = Math.max(0, contentWidth - viewportWidth);

      const points = rawOffsets
        .map((o) => o - firstOffset)
        .filter((p) => maxScroll - p > NEAR_END_PX);
      snapPoints = [...new Set([...points, maxScroll])].sort((a, b) => a - b);
    };

    const clampOffset = (x) => Math.min(Math.max(x, 0), maxScroll);

    const nearestSnapPoint = (x) =>
      snapPoints.reduce(
        (closest, p) => (Math.abs(p - x) < Math.abs(closest - x) ? p : closest),
        snapPoints[0],
      );

    const setOffset = (x, { animate = false } = {}) => {
      this._carouselOffset = x;
      track.style.transition = animate
        ? "transform 400ms cubic-bezier(0.16, 1, 0.3, 1)"
        : "none";
      track.style.transform = `translateX(${-x}px)`;
      prevArrow?.classList.toggle("is-visible", x > 1);
      nextArrow?.classList.toggle("is-visible", x < maxScroll - 1);
    };

    recompute();
    setOffset(clampOffset(this._carouselOffset ?? 0));

    prevArrow?.addEventListener("click", (e) => {
      e.preventDefault();
      const current = this._carouselOffset ?? 0;
      const prior = snapPoints.filter((p) => p < current - 1);
      setOffset(prior.length ? Math.max(...prior) : 0, { animate: true });
    });
    nextArrow?.addEventListener("click", (e) => {
      e.preventDefault();
      const current = this._carouselOffset ?? 0;
      const upcoming = snapPoints.filter((p) => p > current + 1);
      setOffset(upcoming.length ? Math.min(...upcoming) : maxScroll, {
        animate: true,
      });
    });

    let dragging = false;
    let startClientX = 0;
    let startOffset = 0;
    let dragDistance = 0;
    let samples = [];

    track.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button, a, select, input, textarea")) return;
      dragging = true;
      dragDistance = 0;
      startClientX = e.clientX;
      startOffset = this._carouselOffset ?? 0;
      samples = [{ t: performance.now(), x: e.clientX }];
      track.setPointerCapture(e.pointerId);
      track.style.transition = "none";
    });

    track.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startClientX;
      dragDistance = Math.max(dragDistance, Math.abs(dx));
      let next = startOffset - dx;
      if (next < 0) next /= 3;
      else if (next > maxScroll) next = maxScroll + (next - maxScroll) / 3;
      this._carouselOffset = next;
      track.style.transform = `translateX(${-next}px)`;
      samples.push({ t: performance.now(), x: e.clientX });
      if (samples.length > 6) samples.shift();
    });

    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      try {
        track.releasePointerCapture(e.pointerId);
      } catch {}

      const current = this._carouselOffset ?? 0;
      if (dragDistance < 4) {
        setOffset(nearestSnapPoint(clampOffset(current)), { animate: true });
        return;
      }

      this._suppressCarouselClick = true;

      const recent = samples.slice(-5);
      const first = recent[0];
      const last = recent[recent.length - 1];
      const dt = Math.max(1, last.t - first.t);
      const velocity = (last.x - first.x) / dt;
      const projected = clampOffset(current - velocity * 180);
      setOffset(nearestSnapPoint(projected), { animate: true });
    };
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);

    track.addEventListener("click", (e) => {
      if (!this._suppressCarouselClick) return;
      this._suppressCarouselClick = false;
      e.preventDefault();
      e.stopPropagation();
    });

    this._carouselResizeObserver = new ResizeObserver(() => {
      recompute();
      setOffset(clampOffset(this._carouselOffset ?? 0));
    });
    this._carouselResizeObserver.observe(viewport);
  }

  static #onToggleDropdown(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const dropdown = target.closest(".ax-dropdown");
    if (!dropdown) return;
    const willOpen = !dropdown.classList.contains("is-open");
    this.element
      .querySelectorAll(".ax-dropdown.is-open")
      .forEach((el) => el.classList.remove("is-open"));
    dropdown.classList.toggle("is-open", willOpen);
  }

  static async #onSetSortMode(event, target) {
    event.preventDefault();
    const { sortMode } = target.dataset;
    if (!sortMode) return;
    target.closest(".ax-dropdown")?.classList.remove("is-open");
    await game.settings.set(MODULE_ID, SORT_SETTING, sortMode);
    this.render();
  }

  static async #onAddFaction(event) {
    event.preventDefault();
    if (!this.actor.isOwner) return;

    const result = await DialogV2.input({
      window: { title: "Add Faction" },
      content: `<div class="form-group"><label>Faction Name</label><input type="text" name="name" placeholder="Enter faction name..." autofocus autocomplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" /></div>`,
      ok: { label: "Add Faction" },
      rejectClose: false,
    });
    const name = result?.name?.trim();
    if (!name) return;

    const id = foundry.utils.randomID();
    await this.actor.setFlag(MODULE_ID, `factions.${id}`, {
      name,
      reputation: 0,
      events: [],
    });
  }

  static async #onRemoveFaction(event, target) {
    event.preventDefault();
    if (!this.actor.isOwner) return;
    const { factionId } = target.dataset;
    if (!factionId) return;
    target.closest(".ax-dropdown")?.classList.remove("is-open");

    const factions = this.actor.getFlag(MODULE_ID, "factions") ?? {};
    const name = Handlebars.escapeExpression(
      factions[factionId]?.name ?? "this faction",
    );
    const confirmed = await DialogV2.confirm({
      window: { title: "Remove Faction" },
      content: `<p>Remove <strong>${name}</strong> and all of its reputation history? This cannot be undone.</p>`,
      rejectClose: false,
      no: { default: true },
    });
    if (!confirmed) return;

    await this.actor.unsetFlag(MODULE_ID, `factions.${factionId}`);
    if (this._draft.factionId === factionId) this._draft.factionId = "";
  }

  static async #onRemoveEvent(event, target) {
    event.preventDefault();
    if (!this.actor.isOwner) return;
    const { factionId, eventId } = target.dataset;
    const factions = this.actor.getFlag(MODULE_ID, "factions") ?? {};
    const faction = factions[factionId];
    if (!faction) return;
    const removed = (faction.events ?? []).find((e) => e.id === eventId);
    if (!removed) return;
    await this.actor.setFlag(MODULE_ID, `factions.${factionId}`, {
      ...faction,
      reputation: faction.reputation - removed.amount,
      events: faction.events.filter((e) => e.id !== eventId),
    });
  }

  static #onAdjustAmount(event, target) {
    event.preventDefault();
    const input = this.element.querySelector(".event-amount");
    if (!input) return;
    const delta =
      (parseInt(target.dataset.amount) || 0) * (event.shiftKey ? 5 : 1);
    const next = (parseInt(input.value) || 0) + delta;
    input.value = next;
    this._draft.amount = next;
  }

  static async #onSubmitEvent(event) {
    event.preventDefault();
    if (!this.actor.isOwner) return;

    const root = this.element;
    const factionId = root.querySelector(".event-faction")?.value;
    const amountInput = root.querySelector(".event-amount");
    const noteInput = root.querySelector(".event-note");
    const amount = parseInt(amountInput?.value) || 0;
    const note = noteInput?.value ?? "";

    const factions = this.actor.getFlag(MODULE_ID, "factions") ?? {};
    const faction = factions[factionId];

    if (!factionId || !faction) {
      ui.notifications.warn("Please select a faction.");
      return;
    }
    if (amount === 0) {
      ui.notifications.warn("Please enter a non-zero amount.");
      return;
    }

    await this.actor.setFlag(MODULE_ID, `factions.${factionId}`, {
      ...faction,
      reputation: faction.reputation + amount,
      events: [
        ...(faction.events ?? []),
        { id: foundry.utils.randomID(), amount, note, timestamp: Date.now() },
      ],
    });

    this._draft = { factionId, amount: 0, note: "" };
  }
}

function getPartyActor() {
  return game.actors.find((a) => a.type === "party") ?? null;
}

let openTracker = null;

function openFactionTracker() {
  const actor = getPartyActor();
  if (!actor) {
    ui.notifications.warn("No Party actor found in this world.");
    return;
  }

  if (openTracker?.rendered) {
    openTracker.render(true);
    return;
  }

  openTracker = new FactionTrackerApp({ actor });
  openTracker.render(true, {
    position: {
      width: Math.round(window.innerWidth * 0.5),
      height: Math.round(window.innerHeight * 0.8),
    },
  });
}

Hooks.once("init", async () => {
  await foundry.applications.handlebars.loadTemplates({
    "axeom-faction-banner": FACTION_BANNER_PARTIAL,
  });

  game.settings.register(MODULE_ID, SORT_SETTING, {
    scope: "client",
    config: false,
    type: String,
    default: "reputation",
  });
});

Hooks.on("renderSidebar", (app, element) => {
  const menu = element.querySelector("nav.tabs > menu");
  if (!menu || menu.querySelector(".axeom-open-factions")) return;

  const li = document.createElement("li");
  li.innerHTML = `<button type="button" class="axeom-open-factions ui-control plain icon fa-solid fa-flag" data-tooltip aria-label="Faction Reputation"></button>`;
  li.querySelector("button").addEventListener("click", openFactionTracker);

  const collapseButton = menu.querySelector("li:last-child");
  if (collapseButton) collapseButton.before(li);
  else menu.appendChild(li);
});
