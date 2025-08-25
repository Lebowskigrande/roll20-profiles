// ==UserScript==
// @name         Roll20 Overlay – Modular Data Core (drop-in)
// @namespace    https://your.namespace
// @match        https://app.roll20.net/editor/*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM.xmlHttpRequest
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  // Utilities
  // ============================================================
  const GMX = (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest : null;

  const log = (...a) => console.log('%c[OverlayCore]', 'color:#0C5E61;font-weight:600', ...a);
  const warn = (...a) => console.warn('[OverlayCore]', ...a);

  const deepClone = (o) => JSON.parse(JSON.stringify(o));
  const byId = (id) => document.getElementById(id);

  const persist = {
    get(key, fallback) {
      try {
        const raw = GM_getValue(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, val) {
      try {
        GM_setValue(key, JSON.stringify(val));
      } catch {}
    }
  };

  // Small pub/sub
  const Bus = (() => {
    const targets = {};
    return {
      on(evt, fn) { (targets[evt] ??= []).push(fn); },
      emit(evt, data) { (targets[evt] || []).forEach(fn => { try { fn(data); } catch(e){console.error(e);} }); }
    };
  })();

  // ============================================================
  // Schema-ish JSDoc (for editor hints)
  // ============================================================
  /**
   * @typedef {'attack'|'damage'|'save'|'skill'} RollKind
   */

  // ============================================================
  // Default profile (used if none loaded)
  // ============================================================
  const DEFAULT_PROFILE = {
    name: "Ecthelion",
    profBonus: 4,
    abilities: {
      str: { score: 10, mod: 0 }, dex: { score: 18, mod: 4 }, con: { score: 14, mod: 2 },
      int: { score: 10, mod: 0 }, wis: { score: 12, mod: 1 }, cha: { score: 8, mod: -1 }
    },
    slotPools: [
      { label: "Wizard", level: 3, total: 3, spent: 1 },
      { label: "Pact",   level: 3, total: 2, spent: 0 },
      { label: "Cleric", level: 1, total: 4, spent: 2 }
    ],
    spells: [
      { id: "spell-bless", name: "Bless", baseLevel: 1, canUpcast: true, upcast: { type: "perSlot" }, needsConcentration: true, ritual: false, components: { V: true, S: true, M: true, Mdesc: "holy symbol" }, descriptionShort: "Targets gain +1d4 to Attacks & Saves", grantsMods: ["mod-bless-1d4"] },
      { id: "spell-guidance", name: "Guidance", baseLevel: 0, canUpcast: false, needsConcentration: true, components: { V: true, S: true }, descriptionShort: "One creature +1d4 on one ability check", grantsMods: ["mod-guidance-1d4"] },
      { id: "spell-spirit-shroud", name: "Spirit Shroud", baseLevel: 3, canUpcast: true, upcast: { type: "table", byLevel: { "4": { addFlat: 1 }, "5": { addFlat: 2 } } }, needsConcentration: true, components: { V: true, S: true }, descriptionShort: "+1d8 dmg; slow foes", grantsMods: ["mod-ss-dmg"] },
      { id: "spell-fireball", name: "Fireball", baseLevel: 3, canUpcast: true, upcast: { type: "perSlot", dicePerSlot: "1d6" }, components: { V: true, S: true, M: true, Mdesc: "bat guano" }, descriptionShort: "8d6 fire, 20-ft radius" }
    ],
    globalMods: [
      { id: "mod-bless-1d4", name: "Bless (+1d4 Attacks/Saves)", effect: { kind: "dice", dice: "1d4" }, scope: { on: ["attack","save"], when: [{ type: "concentratingOn", spellId: "spell-bless" }], stacking: "exclusive:bless" }, source: { srcType: "spell", spellId: "spell-bless" }, duration: "concentration" },
      { id: "mod-guidance-1d4", name: "Guidance (+1d4 Skill)", effect: { kind: "dice", dice: "1d4" }, scope: { on: ["skill"], when: [{ type: "concentratingOn", spellId: "spell-guidance" }], stacking: "exclusive:guidance" }, source: { srcType: "spell", spellId: "spell-guidance" }, duration: "concentration" },
      { id: "mod-built-bless", name: "Bless (Manual)", effect: { kind: "dice", dice: "1d4" }, scope: { on: ["attack","save"], when: [{ type: "flag", key: "blessManual" }], stacking: "exclusive:bless" }, source: { srcType: "builtIn", key: "bless" } },
      { id: "mod-built-guidance", name: "Guidance (Manual)", effect: { kind: "dice", dice: "1d4" }, scope: { on: ["skill"], when: [{ type: "flag", key: "guidanceManual" }], stacking: "exclusive:guidance" }, source: { srcType: "builtIn", key: "guidance" } },
      { id: "mod-ss-dmg", name: "Spirit Shroud +1d8 Damage", effect: [{ kind: "dice", dice: "1d8" }, { kind: "notes", text: "Choose necrotic/cold/radiant on cast." }], scope: { on: ["damage"], when: [{ type: "concentratingOn", spellId: "spell-spirit-shroud" }] }, source: { srcType: "spell", spellId: "spell-spirit-shroud" }, duration: "concentration" }
    ],
    flags: { blessManual: false, guidanceManual: false },
    activeMods: { attack: [], damage: [], save: [], skill: [] }
  };

  // ============================================================
  // State
  // ============================================================
  const State = {
    profile: null,
    aggregate: null, // computed slots aggregate
    concentration: { spellId: null }, // single concentration (5e)
    init(profile) {
      this.profile = deepClone(profile);
      this.recompute();
      Bus.emit('state:ready', this.snapshot());
    },
    snapshot() {
      return {
        profile: this.profile,
        aggregate: this.aggregate,
        concentration: { ...this.concentration }
      };
    },
    save() {
      persist.set('overlay.profile', this.profile);
    },
    recompute() {
      this.aggregate = computeAggregateSlots(this.profile.slotPools);
    },
    setProfile(p) { this.init(p); this.save(); },
    setFlag(key, val) {
      this.profile.flags = this.profile.flags || {};
      this.profile.flags[key] = !!val;
      this.save(); Bus.emit('flags:changed', { key, val });
    },
    setActiveMods(kind, ids) {
      this.profile.activeMods = this.profile.activeMods || { attack:[], damage:[], save:[], skill:[] };
      this.profile.activeMods[kind] = [...ids];
      this.save(); Bus.emit('mods:changed', { kind, ids: [...ids] });
    },
    toggleActiveMod(kind, modId, checked) {
      const current = new Set(this.profile.activeMods?.[kind] ?? []);
      if (checked) current.add(modId); else current.delete(modId);
      this.setActiveMods(kind, [...current]);
    },
    setConcentration(spellId) {
      // enforce one concentration at a time
      this.concentration.spellId = spellId || null;
      this.save();
      Bus.emit('concentration:changed', { spellId: this.concentration.spellId });
    },
    spendSlot(level, preferLabel = null) {
      const pools = this.profile.slotPools.filter(p => p.level === level && p.spent < p.total);
      if (pools.length === 0) return { ok:false };
      let pool = null;
      if (preferLabel) pool = pools.find(p => p.label === preferLabel) || null;
      if (!pool) {
        pools.sort((a,b) => (a.total - a.spent) - (b.total - b.spent));
        pool = pools[0];
      }
      pool.spent++;
      this.recompute(); this.save();
      Bus.emit('slots:changed', { level, poolLabel: pool.label });
      return { ok:true, poolLabel: pool.label };
    }
  };

  // ============================================================
  // Core logic: slots, spells, upcasting, mods
  // ============================================================

  function computeAggregateSlots(slotPools) {
    const agg = {};
    for (const p of (slotPools || [])) {
      if (!agg[p.level]) agg[p.level] = { total:0, left:0, byPools:[] };
      agg[p.level].total += p.total;
      agg[p.level].left  += (p.total - p.spent);
      agg[p.level].byPools.push(p);
    }
    return agg;
  }

  function getCastableLevels(stateProfile, spell) {
    const agg = computeAggregateSlots(stateProfile.slotPools);
    if (spell.baseLevel === 0) return [0];
    const levels = [];
    const availLevels = Object.keys(agg).map(Number).filter(l => agg[l].left > 0).sort((a,b)=>a-b);
    for (const L of availLevels) if (L >= spell.baseLevel) levels.push(L);
    // Optional: always show base level even if no slots (disabled in your UI)
    // if (!levels.includes(spell.baseLevel)) levels.unshift(spell.baseLevel);
    return levels;
  }

  function resolveUpcast(spell, chosenLevel) {
    const res = { addDice: [], addFlat: 0, notes: [] };
    if (!spell || !spell.canUpcast || spell.baseLevel === 0) return res;
    const extra = (chosenLevel ?? spell.baseLevel) - spell.baseLevel;
    if (extra <= 0) return res;
    const U = spell.upcast;
    if (!U) return res;
    if (U.type === 'perSlot') {
      if (U.dicePerSlot) for (let i=0;i<extra;i++) res.addDice.push(U.dicePerSlot);
      if (U.flatPerSlot) res.addFlat += (U.flatPerSlot * extra);
    } else if (U.type === 'table') {
      for (let L = spell.baseLevel+1; L <= spell.baseLevel+extra; L++) {
        const row = U.byLevel?.[String(L)];
        if (!row) continue;
        if (row.addDice) res.addDice.push(row.addDice);
        if (row.addFlat) res.addFlat += row.addFlat;
        if (row.notes) res.notes.push(row.notes);
      }
    }
    return res;
  }

  function buildSpellBuckets() {
    const prof = State.profile;
    const agg = State.aggregate || {};
    const buckets = new Map(); // level -> { level, slotsLeft, spells:[] }
    for (const s of prof.spells) {
      for (const L of getCastableLevels(prof, s)) {
        if (!buckets.has(L)) buckets.set(L, { level: L, slotsLeft: agg[L]?.left ?? (L===0?Infinity:0), spells: [] });
        buckets.get(L).spells.push(s);
      }
    }
    // Always include cantrip bucket
    if (!buckets.has(0)) buckets.set(0, { level:0, slotsLeft: Infinity, spells: prof.spells.filter(s=>s.baseLevel===0) });
    return [...buckets.values()].sort((a,b)=>a.level-b.level);
  }

  function availableMods(rollKind, context = {}) {
    const prof = State.profile;
    const out = [];
    const concSpellId = State.concentration.spellId;

    for (const mod of prof.globalMods || []) {
      if (!mod.scope?.on?.includes(rollKind)) continue;
      const when = mod.scope.when ?? [{ type:'always' }];
      let ok = true;
      for (const cond of when) {
        if (cond.type === 'always') continue;
        if (cond.type === 'concentratingOn') {
          ok = ok && (concSpellId === cond.spellId);
        } else if (cond.type === 'whileActive') {
          ok = ok && (prof.activeMods?.[rollKind]?.includes(cond.modId));
        } else if (cond.type === 'flag') {
          ok = ok && !!prof.flags?.[cond.key];
        } else if (cond.type === 'spellUpcastAtLeast') {
          ok = ok && ((context.upcastLevel ?? 0) >= cond.level);
        }
        if (!ok) break;
      }
      if (ok) out.push(mod);
    }
    return out;
  }

  function toggleMod(rollKind, modId, checked) {
    // Handle exclusivity groups
    const prof = State.profile;
    const target = prof.globalMods.find(m => m.id === modId);
    const tag = target?.scope?.stacking?.startsWith('exclusive:') ? target.scope.stacking : null;

    let current = new Set(prof.activeMods?.[rollKind] ?? []);
    if (checked) {
      if (tag) {
        for (const id of [...current]) {
          const other = prof.globalMods.find(m => m.id === id);
          if (other?.scope?.stacking === tag) current.delete(id);
        }
      }
      current.add(modId);
    } else {
      current.delete(modId);
    }
    State.setActiveMods(rollKind, [...current]);
  }

  function applyActiveMods(rollKind, baseRoll) {
    const prof = State.profile;
    const activeIds = prof.activeMods?.[rollKind] ?? [];
    const out = { ...baseRoll };
    for (const id of activeIds) {
      const mod = prof.globalMods.find(m => m.id === id);
      if (!mod) continue;
      const effects = Array.isArray(mod.effect) ? mod.effect : [mod.effect];
      for (const eff of effects) {
        switch (eff.kind) {
          case 'flat':
            if (rollKind === 'damage') out.damageFlat = (out.damageFlat ?? 0) + eff.amount;
            else out.bonus = (out.bonus ?? 0) + eff.amount;
            break;
          case 'dice':
            if (rollKind === 'damage') out.damageDice = [...(out.damageDice ?? []), eff.dice];
            else out.bonusDice = [...(out.bonusDice ?? []), eff.dice];
            break;
          case 'adv':
            out.adv = 'advantage';
            break;
          case 'reroll1s':
            out.reroll1s = true;
            break;
          case 'critRange':
            out.critFrom = Math.min(out.critFrom ?? 20, eff.from);
            break;
          case 'notes':
            out.notes = [...(out.notes ?? []), eff.text];
            break;
        }
      }
    }
    return out;
  }

  function addManualMod({ name, rollKinds = ['attack'], effect, stackingTag }) {
    const id = `mod-manual-${Date.now().toString(36)}`;
    const mod = {
      id,
      name,
      effect,
      scope: { on: rollKinds, when: [{ type:'always' }], ...(stackingTag ? { stacking: `exclusive:${stackingTag}` } : {}) },
      source: { srcType: 'manual', note: 'user-added' }
    };
    State.profile.globalMods.push(mod);
    State.save();
    Bus.emit('globalMods:added', { mod });
    return id;
  }

  // ============================================================
  // Spells facade for UI
  // ============================================================
  const SpellsFacade = {
    getBuckets: () => buildSpellBuckets(),
    getCastableLevelsFor(spellId) {
      const s = State.profile.spells.find(x=>x.id===spellId);
      return s ? getCastableLevels(State.profile, s) : [];
    },
    cast(spellId, level, opts = { setConcentration: true, preferPoolLabel: null }) {
      const s = State.profile.spells.find(x=>x.id===spellId);
      if (!s) return { ok:false, reason:'spell-not-found' };
      if (s.baseLevel !== 0) {
        const spent = State.spendSlot(level, opts.preferPoolLabel);
        if (!spent.ok) return { ok:false, reason:'no-slots' };
      }
      if (opts.setConcentration && s.needsConcentration) {
        State.setConcentration(s.id);
      }
      const upcast = resolveUpcast(s, level);
      Bus.emit('spell:cast', { spell: s, level, upcast });
      return { ok:true, spell:s, level, upcast };
    },
    endConcentration() {
      State.setConcentration(null);
    }
  };

  // ============================================================
  // Mods facade for UI
  // ============================================================
  const ModsFacade = {
    available: (kind, context) => availableMods(kind, context),
    toggle: (kind, modId, checked) => toggleMod(kind, modId, checked),
    applyActive: (kind, baseRoll) => applyActiveMods(kind, baseRoll),
    addManual: addManualMod
  };

  // ============================================================
  // Menus (optional renderer you can mount into your existing UI)
  // ============================================================
  const UIRender = (() => {
    const menuRoot = { attack:null, damage:null, save:null, skill:null };

    function cssOnce(rootEl) {
      if (!rootEl) return;
      const id = 'overlaycore-menu-style';
      if (rootEl.ownerDocument.getElementById(id)) return;
      const st = rootEl.ownerDocument.createElement('style');
      st.id = id;
      st.textContent = `
        .oc-menu { font: 13px/1.3 system-ui, sans-serif; color:#222; user-select:none; }
        .oc-menu .oc-row { display:flex; align-items:center; gap:8px; padding:6px 8px; cursor:pointer; }
        .oc-menu .oc-row:hover { background: rgba(12,94,97,0.08); }
        .oc-menu .oc-check { width:16px; text-align:center; }
        .oc-menu .oc-sep { height:1px; background:#ddd; margin:4px 0; }
        .oc-menu .oc-small { color:#666; font-size:12px; margin-left:24px; }
        .oc-menu .oc-footer { display:flex; gap:8px; padding:6px 8px; color:#0C5E61; cursor:pointer; }
      `;
      rootEl.ownerDocument.head.appendChild(st);
    }

    function renderOne(kind) {
      const el = menuRoot[kind];
      if (!el) return;
      cssOnce(el);
      el.classList.add('oc-menu');
      el.innerHTML = '';

      const mods = ModsFacade.available(kind);
      const active = new Set(State.profile.activeMods?.[kind] ?? []);

      for (const mod of mods) {
        const row = document.createElement('div');
        row.className = 'oc-row';
        const check = document.createElement('div');
        check.className = 'oc-check';
        check.textContent = active.has(mod.id) ? '✓' : ' ';
        const label = document.createElement('div');
        label.textContent = mod.name;
        row.append(check, label);
        row.addEventListener('click', () => {
          const willCheck = !active.has(mod.id);
          ModsFacade.toggle(kind, mod.id, willCheck);
          renderAll(); // refresh to reflect exclusivity
        });
        el.appendChild(row);

        // Optional source note
        if (mod.source?.srcType === 'spell' && mod.duration === 'concentration') {
          const small = document.createElement('div');
          small.className = 'oc-small';
          small.textContent = '(concentration)';
          el.appendChild(small);
        }
      }

      // Footer: quick manual add
      const sep = document.createElement('div'); sep.className = 'oc-sep';
      el.appendChild(sep);
      const footer = document.createElement('div'); footer.className = 'oc-footer';
      footer.textContent = '➕ Add modifier…';
      footer.addEventListener('click', () => {
        const name = prompt('Modifier name (e.g., “Hex +1d6 necrotic”)');
        if (!name) return;
        const dice = prompt('Bonus dice (e.g., 1d4, empty for none)');
        const flat = prompt('Flat bonus (e.g., +2, empty for none)');
        const effect = dice ? { kind:'dice', dice: dice.trim() } : { kind:'flat', amount: Number(flat||0) };
        ModsFacade.addManual({ name, rollKinds: [kind], effect });
        renderAll();
      });
      el.appendChild(footer);
    }

    function renderAll() {
      ['attack','damage','save','skill'].forEach(renderOne);
    }

    Bus.on('mods:changed', renderAll);
    Bus.on('flags:changed', renderAll);
    Bus.on('concentration:changed', renderAll);
    Bus.on('state:ready', renderAll);
    Bus.on('slots:changed', renderAll);
    Bus.on('globalMods:added', renderAll);

    return {
      mountMenus(containers) {
        Object.assign(menuRoot, containers || {});
        renderAll();
      },
      refresh: () => renderAll()
    };
  })();

  // ============================================================
  // Loader (profile from GM storage or remote URL)
  // ============================================================
  async function loadProfile() {
    // 1) local persisted profile
    const persisted = persist.get('overlay.profile', null);
    if (persisted) { log('Loaded profile from storage'); return persisted; }

    // 2) remote URL (set once via console: GM_setValue('overlay.profileUrl', 'https://raw...json'))
    const url = GM_getValue('overlay.profileUrl');
    if (url && GMX) {
      try {
        const prof = await new Promise((resolve, reject) => {
          GMX({
            method: 'GET', url,
            onload: (res) => {
              try { resolve(JSON.parse(res.responseText)); } catch (e) { reject(e); }
            },
            onerror: (e) => reject(e)
          });
        });
        log('Loaded profile from URL:', url);
        return prof;
      } catch (e) { warn('Failed remote profile:', e); }
    }

    // 3) window variable fallback
    if (window.ECTH_PROFILE) { log('Loaded profile from window.ECTH_PROFILE'); return window.ECTH_PROFILE; }

    // 4) default
    log('Using DEFAULT_PROFILE');
    return DEFAULT_PROFILE;
  }

  // ============================================================
  // Public API
  // ============================================================
  const OverlayCore = {
    get state() { return State.snapshot(); },

    // Profile & persistence
    loadProfileFromUrl(url) {
      if (!GMX) throw new Error('GM.xmlHttpRequest not available');
      GM_setValue('overlay.profileUrl', url);
      persist.set('overlay.profile', null);
      return loadProfile().then(p => { State.setProfile(p); return State.snapshot(); });
    },
    setProfile(profileObj) {
      State.setProfile(profileObj);
      return State.snapshot();
    },

    // Concentration
    setConcentration(spellIdOrNull) { State.setConcentration(spellIdOrNull || null); },

    // Spells & slots
    Spells: {
      getBuckets: SpellsFacade.getBuckets,
      getCastableLevelsFor: SpellsFacade.getCastableLevelsFor,
      cast: SpellsFacade.cast,
      endConcentration: SpellsFacade.endConcentration
    },

    // Mods
    Mods: {
      available: ModsFacade.available,
      toggle: ModsFacade.toggle,
      applyActive: ModsFacade.applyActive,
      addManual: ModsFacade.addManual
    },

    // UI helpers (optional)
    UI: {
      mountMenus: UIRender.mountMenus,
      refreshMenus: UIRender.refresh
    },

    // Events
    on: Bus.on
  };

  // Expose globally
  window.OverlayCore = OverlayCore;

  // ============================================================
  // Boot
  // ============================================================
  (async function boot() {
    // Wait for Roll20 if you need DOM; core doesn’t depend on VTT.
    const profile = await loadProfile();
    State.init(profile);

    // Dev helper: toggle manual Bless/Guidance flags with keyboard for testing
    window.addEventListener('keydown', (e) => {
      if (e.altKey && e.key.toLowerCase() === 'b') {
        State.setFlag('blessManual', !State.profile.flags?.blessManual);
      } else if (e.altKey && e.key.toLowerCase() === 'g') {
        State.setFlag('guidanceManual', !State.profile.flags?.guidanceManual);
      }
    });

    log('Ready. API at window.OverlayCore.');
    log('Examples:',
      'OverlayCore.Spells.getBuckets()',
      'OverlayCore.UI.mountMenus({ attack:#attack-mod-menu, ... })',
      'OverlayCore.Mods.applyActive("attack", { bonus: 7 })'
    );
  })();

})();
