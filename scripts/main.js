const MODULE_ID = "axeom-factions-pf2e";
const FACTION_PANEL_TEMPLATE =
  "modules/axeom-factions-pf2e/templates/FactionPanel.hbs";
const FACTION_BANNER_PARTIAL =
  "modules/axeom-factions-pf2e/templates/FactionBanner.hbs";
const RECENT_ACTIVITY_LIMIT = 1;

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
});

// Reputation data lives as a flag on the Party actor (`factions.<id>`), so it
// persists to the world, syncs to every connected client, and survives
// reloads. All rendering is derived fresh from that flag data on every call -
// there is never a separate in-memory copy that can drift out of sync with it.
class FactionTrackerApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  constructor(options) {
    super(options);
    this.actor = options.actor;
    this._draft = { factionId: "", amount: 0, note: "" };
  }

  static DEFAULT_OPTIONS = {
    // Fixed rather than the usual "{id}"-templated id: only one instance of
    // this app is ever open at a time (see openFactionTracker), and a fixed
    // id/class gives module.css a stable hook for the window chrome
    // (.axeom-faction-tracker .window-header, .window-content, etc).
    id: "axeom-faction-tracker",
    classes: ["axeom-faction-tracker"],
    tag: "div",
    window: {
      title: "Faction Reputation",
      icon: "fa-solid fa-flag",
      resizable: true,
    },
    // ApplicationV2 positioning only accepts numeric pixel values (Foundry's
    // _updatePosition runs Number(width/height) internally), so 50dvw/80dvh
    // can't be set here directly - the launcher computes and passes the
    // equivalent pixel size from the current viewport at open time instead.
    position: { width: 720, height: 640 },
    actions: {
      addFaction: FactionTrackerApp.#onAddFaction,
      removeFaction: FactionTrackerApp.#onRemoveFaction,
      removeEvent: FactionTrackerApp.#onRemoveEvent,
      adjustAmount: FactionTrackerApp.#onAdjustAmount,
      submitEvent: FactionTrackerApp.#onSubmitEvent,
    },
  };

  static PARTS = {
    content: {
      template: FACTION_PANEL_TEMPLATE,
      scrollable: [""],
    },
  };

  async _prepareContext(_options) {
    const factions = this.actor.getFlag(MODULE_ID, "factions") ?? {};
    const isOwner = this.actor.isOwner;

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
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const allEvents = Object.entries(factions)
      .flatMap(([id, faction]) =>
        (faction.events ?? []).map((event) => ({
          ...event,
          factionId: id,
          factionName: faction.name,
        })),
      )
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(formatEvent);

    return {
      isOwner,
      factions: factionList,
      hasFactions: factionList.length > 0,
      events: allEvents,
      hasEvents: allEvents.length > 0,
      draft: this._draft,
    };
  }

  // This app isn't a registered document sheet, so it isn't part of
  // actor.apps and won't auto-rerender on its own - listen for updateActor
  // explicitly so changes from any source (this client, another player, the
  // GM) stay in sync while the window is open.
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this._onUpdateActor = (actor) => {
      if (actor.id === this.actor.id) this.render();
    };
    Hooks.on("updateActor", this._onUpdateActor);
  }

  _onClose(options) {
    super._onClose(options);
    Hooks.off("updateActor", this._onUpdateActor);
    if (openTracker === this) openTracker = null;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;
    root.querySelector(".event-faction")?.addEventListener("change", (e) => {
      this._draft.factionId = e.currentTarget.value;
    });
    root.querySelector(".event-amount")?.addEventListener("input", (e) => {
      this._draft.amount = parseInt(e.currentTarget.value) || 0;
    });
    root.querySelector(".event-note")?.addEventListener("input", (e) => {
      this._draft.note = e.currentTarget.value;
    });
  }

  static async #onAddFaction(event) {
    event.preventDefault();
    if (!this.actor.isOwner) return;

    const name = await Dialog.prompt({
      title: "Add Faction",
      content: `<form><div class="form-group"><label>Faction Name</label><input type="text" name="name" placeholder="Enter faction name..." autofocus autocomplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" /></div></form>`,
      label: "Add Faction",
      callback: (html) => html.find('input[name="name"]').val(),
      rejectClose: false,
    });
    if (!name?.trim()) return;

    const id = foundry.utils.randomID();
    await this.actor.setFlag(MODULE_ID, `factions.${id}`, {
      name: name.trim(),
      reputation: 0,
      events: [],
    });
  }

  static async #onRemoveFaction(event, target) {
    event.preventDefault();
    if (!this.actor.isOwner) return;
    const { factionId } = target.dataset;
    if (!factionId) return;
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
    const delta = parseInt(target.dataset.amount) || 0;
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

// Single shared instance: reused (and brought to front) across clicks rather
// than spawning a new window each time, and cleared by FactionTrackerApp
// #_onClose when the window closes.
let openTracker = null;

function openFactionTracker() {
  const actor = getPartyActor();
  if (!actor) {
    ui.notifications.warn("No Party actor found in this world.");
    return;
  }

  if (openTracker?.rendered) {
    // render(true) re-maximizes (if minimized) and brings the window to
    // front - see ApplicationV2#_render's handling of options.force.
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
});

// Foundry's main Sidebar is itself an ApplicationV2 (HandlebarsApplicationMixin),
// so it fires the same render<ClassName> hook convention as other apps -
// "renderSidebar" here. Its tab nav lives at <aside id="sidebar"> ->
// <nav class="tabs"> -> <menu>. Unlike the Party sheet, the sidebar rarely
// re-renders after startup, so a simple idempotent injection is safe here.
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
