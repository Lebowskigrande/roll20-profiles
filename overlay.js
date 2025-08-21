/* overlay.js — split‑friendly module
   Public API: window.Overlay.init(rootShadow, hostDiv)
   - rootShadow: ShadowRoot created by the loader (already has overlay.html + style.css injected)
   - hostDiv:    absolutely/fixed positioned container (used for dragging & persistence)
*/
(function () {
  'use strict';

  // ---------- Safe GM wrappers (so the file doesn't crash outside TM) ----------
  function GM_GetValue(k, d) {
    try { const v = GM_getValue(k, d); return v === undefined ? d : v; } catch { return d; }
  }
  function GM_SetValue(k, v) {
    try { GM_setValue(k, v); } catch {}
  }

  // ---------- Pure helpers (NO DOM access here) ----------
  const ABL_ORDER = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
  const ICON_SVGS = {
    slashing: '🗡️', piercing: '🏹', bludgeoning: '🔨', fire: '🔥', cold: '❄️',
    radiant: '✨', necrotic: '💀', force: '💥', lightning: '⚡', thunder: '🔊',
    acid: '🧪', poison: '☠️'
  };
  const fmtBonus = (n) => (n >= 0 ? `+${n}` : `${n}`);
  const fmtSign  = (n) => (n >= 0 ? `+${n}` : `${n}`);

  /** Post a message into Roll20’s chat. */
  function sendToChat(text) {
    const ta = document.querySelector('#textchat-input textarea');
    if (!ta) return false;
    ta.value = text;
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
    return true;
  }

  // ---------- Global modifiers (Spirit Shroud / conversion / Bless) ----------
  function getGlobalMods() {
    const v = GM_GetValue('r20_global_mods', null);
    if (v && typeof v === 'object') return v;
    const def = { shroud: 'off', convert: 'off', bless: false };
    GM_SetValue('r20_global_mods', def);
    return { ...def };
  }
  function setGlobalMods(next) {
    GM_SetValue('r20_global_mods', next);
    window.dispatchEvent(new CustomEvent('r20Overlay:globalMods', { detail: next }));
  }

  // ---------- Saves: compute prof flags once (call inside init) ----------
  function deriveSaveProficiencies(characterData) {
    for (const abl of Object.keys(characterData.abilities)) {
      const a = characterData.abilities[abl];
      a.saveProf = (typeof a.save === 'number') ? ((a.save - a.mod) >= characterData.profBonus) : false;
    }
  }
  const getSave = (characterData, abl) => {
    const a = characterData.abilities[abl] || {};
    return (a.mod || 0) + (a.saveProf ? characterData.profBonus : 0);
  };

  // ---------- Rolls ----------
  function buildSimpleRoll({ rname, mod, charname }) {
    const m = mod >= 0 ? `+${mod}` : `${mod}`;
    return `&{template:simple} {{rname=${rname}}} {{mod=${fmtBonus(mod)}}} {{r1=[[1d20${m}]]}} {{always=1}} {{r2=[[1d20${m}]]}} {{charname=${charname}}}`;
  }

  const iconHTML = (type) => ICON_SVGS[(type || '').toLowerCase()] || ICON_SVGS.force;

  /** Build an atkdmg template string using globals (bless, shroud, convert). */
  function buildAtkdmgTemplate(characterData, attack, { adv = 'normal' } = {}) {
    const a = attack;
    const mods = getGlobalMods();

    const ablMod = characterData.abilities[a.abl]?.mod ?? 0;
    const pbVal  = a.prof ? characterData.profBonus : 0;
    const magic  = a.magic ?? 0;
    const misc   = a.misc ?? 0;
    const atkBonusBase = ablMod + pbVal + magic + misc;
    const blessBonus   = mods.bless ? ' + 1d4' : '';
    const atkBonusText = fmtSign(atkBonusBase) + blessBonus;

    const primaryDice = a.dmg1 ?? a.dice ?? '1d8';
    const primaryType = (a.dmg1type ?? a.dmgType ?? 'bludgeoning').toLowerCase();
    const hasDmg2     = Boolean(a.dmg2 && a.dmg2type);
    const secDice     = hasDmg2 ? a.dmg2 : null;
    const secType     = hasDmg2 ? String(a.dmg2type).toLowerCase() : null;

    let shroudDice = null, shroudType = null;
    if (mods.shroud && mods.shroud !== 'off') { shroudDice = '1d8'; shroudType = String(mods.shroud).toLowerCase(); }

    const addAbl   = a.addAblToDamage !== false;
    const dmgBonus = (addAbl ? ablMod : 0) + magic + (a.damageBonus ?? 0);
    const range    = a.range ?? '5 ft';

    const toType   = (mods.convert && mods.convert !== 'off') ? String(mods.convert).toLowerCase() : null;
    const convType = (t) => toType ? toType : t;

    // group damage dice by resulting type (after conversion)
    const groups = {};
    [{ dice: primaryDice, type: convType(primaryType) }]
      .concat(hasDmg2 ? [{ dice: secDice, type: convType(secType) }] : [])
      .concat(shroudDice ? [{ dice: shroudDice, type: convType(shroudType) }] : [])
      .forEach(p => { (groups[p.type] ||= []).push(p.dice); });

    const entries        = Object.entries(groups);
    const mainTypeAfter  = convType(primaryType);
    const primaryGroup   = entries.find(([t]) => t === mainTypeAfter) || entries[0];
    const secondaryGroup = entries.filter(([t]) => t !== primaryGroup[0]);

    const rname = a.name;
    const r1    = `[[1d20${atkBonusText}]]`;
    const r2    = `[[1d20${atkBonusText}]]`;
    const mode  = adv === 'adv' ? 'advantage' : adv === 'dis' ? 'disadvantage' : adv === 'always' ? 'always' : 'normal';

    const dmg1Inline = `[[(${primaryGroup[1].join(' + ')})${fmtSign(dmgBonus)}]]`;

    let msg = `&{template:atkdmg}`
      + ` {{mod=${fmtSign(atkBonusBase)}${mods.bless ? ' + 1d4' : ''}}}`
      + ` {{rname=${rname}}} {{r1=${r1}}}`
      + ((mode === 'advantage' || mode === 'disadvantage' || mode === 'always') ? ` {{r2=${r2}}}` : '')
      + ` {{${mode}=1}} {{attack=1}} {{range=${range}}}`
      + ` {{damage=1}} {{dmg1flag=1}} {{dmg1=${dmg1Inline}}} {{dmg1type=${primaryGroup[0]}}}`;

    if (secondaryGroup.length) {
      const [t, diceList] = secondaryGroup[0];
      msg += ` {{dmg2flag=1}} {{dmg2=[[(${diceList.join(' + ')})]]}} {{dmg2type=${t}}}`;
    }

    msg += ` {{charname=${characterData.name}}}`;
    return msg;
  }

  // ---------- Slots (persisted) ----------
  const slotKey = (kind, level) => `slots_${kind}_${level}`;
  function getSlotState(characterData, kind, level) {
    const k   = slotKey(kind, level);
    const max = (kind === 'spell'
      ? (characterData.spellSlots[level]?.max || 0)
      : (characterData.pactSlots[level]?.max || 0));
    let cur = GM_GetValue(k, null);
    if (cur == null) { cur = max; GM_SetValue(k, cur); }
    return { cur, max };
  }
  function setSlotState(characterData, kind, level, cur) {
    const max = (kind === 'spell'
      ? (characterData.spellSlots[level]?.max || 0)
      : (characterData.pactSlots[level]?.max || 0));
    cur = Math.max(0, Math.min(max, cur));
    GM_SetValue(slotKey(kind, level), cur);
    window.dispatchEvent(new CustomEvent('r20Overlay:slots', { detail: { kind, level, cur, max } }));
    return { cur, max };
  }
  const consumeSlot  = (characterData, kind, lvl) => { const s = getSlotState(characterData, kind, lvl); if (s.cur <= 0) return false; setSlotState(characterData, kind, lvl, s.cur - 1); return true; };
  const rechargeSlot = (characterData, kind, lvl) => { const s = getSlotState(characterData, kind, lvl); if (s.cur >= s.max) return false; setSlotState(characterData, kind, lvl, s.cur + 1); return true; };

  // ---------- UI helpers that NEED root/host (called from init) ----------
  function makeDraggable(host, handle) {
    let ix = 0, iy = 0, ox = 0, oy = 0, down = false;
    handle.addEventListener('mousedown', (e) => {
      down = true; ix = e.clientX; iy = e.clientY; ox = host.offsetLeft; oy = host.offsetTop; e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!down) return;
      const dx = e.clientX - ix, dy = e.clientY - iy;
      host.style.left = (ox + dx) + 'px';
      host.style.top  = (oy + dy) + 'px';
      host.style.right = 'auto';
    });
    window.addEventListener('mouseup', () => {
      if (!down) return;
      down = false;
      GM_SetValue('pos', { left: host.style.left, top: host.style.top });
    });
  }

  function restorePosition(host) {
    const pos = GM_GetValue('pos', null);
    if (pos?.left && pos?.top) {
      host.style.left = pos.left;
      host.style.top  = pos.top;
      host.style.right = 'auto';
    }
  }

  function renderSlotsUI(root, characterData) {
    const spellRow = root.getElementById('spellSlotsRow');
    const pactRow  = root.getElementById('pactSlotsRow');
    if (!spellRow || !pactRow) return;

    const s = getSlotState(characterData, 'spell', '1');
    spellRow.innerHTML = Array.from({ length: s.max }, (_, i) => {
      const filled = i < s.cur;
      return `<span class="slotDot ${filled ? 'filled' : 'empty'}" data-kind="spell" data-lvl="1" data-index="${i}" title="${filled ? 'Click to consume' : 'Click to recharge'}"></span>`;
    }).join('');

    const p = getSlotState(characterData, 'pact', '3');
    pactRow.innerHTML = Array.from({ length: p.max }, (_, i) => {
      const filled = i < p.cur;
      return `<span class="slotDot ${filled ? 'filled' : 'empty'}" data-kind="pact" data-lvl="2" data-index="${i}" title="${filled ? 'Click to consume' : 'Click to recharge'}"></span>`;
    }).join('');
  }

  // ---------- Public API ----------
  window.Overlay = {
    init(root, host) {
      // 1) character data must already exist in the page
      if (!window.characterData) {
        console.error('[Overlay] characterData is missing');
        return;
      }
      const cd = window.characterData;

      // 2) prepare derived data (was top-level before)
      deriveSaveProficiencies(cd);

      // 3) set header fields that overlay.html expects
      root.getElementById('ov-name')  ?.textContent = cd.name ?? '—';
      root.getElementById('ov-ac')    ?.textContent = cd.ac ?? '—';
      root.getElementById('ov-pp')    ?.textContent = cd.passivePerception ?? '—';
      root.getElementById('ov-speed') ?.textContent = cd.speed ?? '—';
      root.getElementById('ov-hp')    ?.textContent = cd.hp?.current ?? '—';
      root.getElementById('ov-hpmax') ?.textContent = cd.hp?.max ?? '—';

      // 4) initial renders (abilities/attacks/skills/features/spells/inventory)
      // renderAbilities(root, cd, getSave);   // (hook up your real renderers as you add them)
      // renderAttacks(root, cd);
      // renderSkills(root, cd);
      // renderFeatures(root, cd);
      // renderMagic(root, cd);
      renderSlotsUI(root, cd);
      // renderSpellsTab(root, cd);

      // 5) interactions (all DOM listeners go here; they can use helpers above)
      makeDraggable(host, root.getElementById('drag'));
      restorePosition(host);

      // Collapse/expand header button
      const bodyPane   = root.getElementById('bodyPane');
      const collapseAll= root.getElementById('collapseAll');
      const allChev    = root.getElementById('allChev');

      function setBodyExpanded(on) {
        if (on) {
          bodyPane.style.maxHeight = bodyPane.scrollHeight + 'px';
          allChev?.classList.remove('rot');
        } else {
          bodyPane.style.maxHeight = bodyPane.scrollHeight + 'px';
          requestAnimationFrame(() => bodyPane.style.maxHeight = '0px');
          allChev?.classList.add('rot');
        }
        GM_SetValue('expanded', on ? 1 : 0);
      }

      const wasExpanded = GM_GetValue('expanded', 1) === 1;
      if (wasExpanded) {
        requestAnimationFrame(() => bodyPane.style.maxHeight = bodyPane.scrollHeight + 'px');
        allChev?.classList.remove('rot');
      } else {
        bodyPane.style.maxHeight = '0px';
        allChev?.classList.add('rot');
      }
      collapseAll?.addEventListener('click', () =>
        setBodyExpanded(!(parseFloat(bodyPane.style.maxHeight || '0') > 0))
      );
      new ResizeObserver(() => {
        if (GM_GetValue('expanded', 1) === 1) bodyPane.style.maxHeight = bodyPane.scrollHeight + 'px';
      }).observe(bodyPane);

      // Quickbar examples
      root.getElementById('qbInitIcon')?.addEventListener('click', () => {
        const initMod = cd.abilities.DEX?.mod ?? 0;
        sendToChat(`/roll 1d20 ${initMod >= 0 ? `+${initMod}` : initMod} &{tracker}`);
      });
      root.getElementById('qbAttack')?.addEventListener('click', (e) => {
        const a = cd.attacks?.[0]; if (!a) return;
        const adv = e.ctrlKey ? 'always' : (e.shiftKey ? 'adv' : (e.altKey ? 'dis' : 'normal'));
        sendToChat(buildAtkdmgTemplate(cd, a, { adv }));
      });

      // Global mods
      const initial   = getGlobalMods();
      const selShroud = root.getElementById('gmShroud');
      const selConvert= root.getElementById('gmConvert');
      const chkBless  = root.getElementById('gmBless');
      if (selShroud)  selShroud.value  = initial.shroud ?? 'off';
      if (selConvert) selConvert.value = initial.convert ?? 'off';
      if (chkBless)   chkBless.checked = !!initial.bless;
      selShroud ?.addEventListener('change', () => setGlobalMods({ ...getGlobalMods(), shroud: selShroud.value }));
      selConvert?.addEventListener('change', () => setGlobalMods({ ...getGlobalMods(), convert: selConvert.value }));
      chkBless  ?.addEventListener('change', () => setGlobalMods({ ...getGlobalMods(), bless: chkBless.checked }));

      // Attack list example
      root.getElementById('attackList')?.addEventListener('click', (e) => {
        const row = e.target.closest('.row[data-attack]'); if (!row) return;
        const i   = +row.dataset.attack; const a = cd.attacks?.[i]; if (!a) return;
        const advKey = (e.shiftKey ? 'adv' : (e.altKey ? 'dis' : 'normal'));
        sendToChat(buildAtkdmgTemplate(cd, a, { adv: advKey }));
      });

      // Slots rows at top of Spells tab
      root.getElementById('spellSlotsRow')?.addEventListener('click', (e) => {
        const dot = e.target.closest('.slotDot'); if (!dot) return;
        const kind = dot.dataset.kind, lvl = dot.dataset.lvl;
        if (dot.classList.contains('filled')) consumeSlot(cd, kind, lvl);
        else                                  rechargeSlot(cd, kind, lvl);
        renderSlotsUI(root, cd);
      });
      root.getElementById('pactSlotsRow')?.addEventListener('click', (e) => {
        const dot = e.target.closest('.slotDot'); if (!dot) return;
        const kind = dot.dataset.kind, lvl = dot.dataset.lvl;
        if (dot.classList.contains('filled')) consumeSlot(cd, kind, lvl);
        else                                  rechargeSlot(cd, kind, lvl);
        renderSlotsUI(root, cd);
      });

      // …add your remaining listeners (skills, spells expand/cast, features, inventory, smite dialog) here…
    }
  };
})();
