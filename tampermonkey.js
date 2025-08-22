// ==UserScript==
// @name         Roll20 Overlay – Works with JSON
// @match        https://app.roll20.net/editor/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @grant        GM.xmlHttpRequest
// @connect      raw.githubusercontent.com

// @resource     https://raw.githubusercontent.com/Lebowskigrande/roll20-profiles/main/ecthelion_profile.json
// ==/UserScript==

// needs: // @grant GM.xmlHttpRequest
//        // @connect raw.githubusercontent.com

function loadCharacterData(url) {
  return new Promise((resolve, reject) => {
    GM.xmlHttpRequest({
      method: "GET",
      url,
      onload: (res) => {
        try {
          resolve(JSON.parse(res.responseText));
        } catch (e) {
          reject(new Error("Failed to parse character JSON: " + e.message));
        }
      },
      onerror: (err) => reject(new Error("Request failed: " + err?.error || err))
    });
  });
}

(async function(){
  let characterData;
  try {
    characterData = await loadCharacterData(
      "https://raw.githubusercontent.com/Lebowskigrande/roll20-profiles/main/ecthelion_profile.json"
    );
  } catch (e) {
    console.error("[Overlay Loader] Could not load character JSON:", e);
    return; // bail – nothing useful to render
  }

  // 2) make it globally visible for overlay.js if it expects window.characterData
  window.characterData = characterData;

  // ---------- Persistent global damage modifiers ----------
  function getGlobalMods(){
    const v = GM_getValue('r20_global_mods', null);
    if (v && typeof v==='object') return v;
    const def = { shroud:'off', convert:'off', bless:false };
    GM_setValue('r20_global_mods', def);
    return {...def};
  }
  function setGlobalMods(next){
    GM_setValue('r20_global_mods', next);
    window.dispatchEvent(new CustomEvent('r20Overlay:globalMods', { detail: next }));
  }

  // ---------- Helpers ----------
  const ABL_ORDER = ["STR","DEX","CON","INT","WIS","CHA"];
  const fmtBonus = n => (n>=0?`+${n}`:`${n}`);
  const fmtSign  = n => (n>=0?`+${n}`:`${n}`);
  const getSave  = abl => (characterData.abilities[abl].mod||0) + (characterData.abilities[abl].prof ? characterData.profBonus : 0);
function buildSimpleRoll({ rname, mod, charname }){
  const m = mod >= 0 ? `+${mod}` : `${mod}`;
  return `&{template:simple} {{rname=${rname}}} {{mod=${fmtBonus(mod)}}} {{r1=[[1d20${m}]]}} {{always=1}} {{r2=[[1d20${m}]]}} {{charname=${charname}}}`;
}


  // Monochrome inline SVG icons
  const ICON_SVGS = {
    piercing:   `<svg xmlns="http://www.w3.org/2000/svg" class="ico" viewBox="0 0 24 24"><path fill="#0c5e61" d="M16 9h.41l-13 13L2 20.59l13-13V9h1m0-5v4h4l2-6l-6 2Z"/></svg>`,
    slashing:   `<svg xmlns="http://www.w3.org/2000/svg" class="ico" viewBox="0 0 1024 1024"><path fill="#0c5e61" d="m1013.998 963l-51 51q-10 10-24.5 10t-25.5-10l-179-180l-117 117q-9 10-23 10t-24-10l-48-48q-10-10-10-24t10-23l85-85l-591-591q-4-5-7.5-10.5t-5-9.5t-2.5-9.5t-1-8.5V32q0-13 9.5-22.5t22.5-9.5h110.5l8 1l9.5 2.5l9.5 5l10.5 7.5l591 591l85-85q9-10 23-10t24 10l48 48q10 10 10 24t-10 24l-117 116l180 179q10 11 10 25.5t-10 24.5z"/></svg>`,
    bludgeoning:`<svg xmlns="http://www.w3.org/2000/svg" class="ico" viewBox="0 0 16 16"><path fill="#0c5e61" d="m6 2l7 7l3-3l-4.48-4.48S8.55 2.55 7 1zm2.8 3.79L.27 14.31a.998.998 0 0 0 0 1.361a.998.998 0 0 0 1.371.049l8.569-8.519z"/></svg>`,
    cold:       `<svg xmlns="http://www.w3.org/2000/svg" class="ico" viewBox="0 0 512 512"><path fill="#0c5e61" d="m461 349l-34-19.64a89.5 89.5 0 0 1 20.94-16a22 22 0 0 0-21.28-38.51a133.6 133.6 0 0 0-38.55 32.1L300 256l88.09-50.86a133.5 133.5 0 0 0 38.55 32.1a22 22 0 1 0 21.28-38.51a89.7 89.7 0 0 1-20.94-16l34-19.64A22 22 0 1 0 439 125l-34 19.63a89.7 89.7 0 0 1-3.42-26.15A22 22 0 0 0 380 96h-.41a22 22 0 0 0-22 21.59a133.6 133.6 0 0 0 8.5 49.41L278 217.89V116.18a133.5 133.5 0 0 0 47.07-17.33a22 22 0 0 0-22.71-37.69A89.6 89.6 0 0 1 278 71.27V38a22 22 0 0 0-44 0v33.27a89.6 89.6 0 0 1-24.36-10.11a22 22 0 1 0-22.71 37.69A133.5 133.5 0 0 0 234 116.18v101.71L145.91 167a133.6 133.6 0 0 0 8.52-49.43a22 22 0 0 0-22-21.59H132a22 22 0 0 0-21.59 22.41a89.7 89.7 0 0 1-3.41 26.19L73 125a22 22 0 1 0-22 38.1l34 19.64a89.7 89.7 0 0 1-20.94 16a22 22 0 1 0 21.28 38.51a133.6 133.6 0 0 0 38.55-32.1L212 256l-88.09 50.86a133.6 133.6 0 0 0-38.55-32.1a22 22 0 1 0-21.28 38.51a89.7 89.7 0 0 1 20.94 16L51 349a22 22 0 1 0 22 38.1l34-19.63a89.7 89.7 0 0 1 3.42 26.15A22 22 0 0 0 132 416h.41a22 22 0 0 0 22-21.59a133.6 133.6 0 0 0-8.5-49.41L234 294.11v101.71a133.5 133.5 0 0 0-47.07 17.33a22 22 0 1 0 22.71 37.69A89.6 89.6 0 0 1 234 440.73V474a22 22 0 0 0 44 0v-33.27a89.6 89.6 0 0 1 24.36 10.11a22 22 0 0 0 22.71-37.69A133.5 133.5 0 0 0 278 395.82V294.11L366.09 345a133.6 133.6 0 0 0-8.52 49.43a22 22 0 0 0 22 21.59h.43a22 22 0 0 0 21.59-22.41a89.7 89.7 0 0 1 3.41-26.19l34 19.63A22 22 0 1 0 461 349"/></svg>`,
    fire:       `<svg xmlns="http://www.w3.org/2000/svg" class="ico" viewBox="0 0 17 16"><path fill="#0c5e61" fill-rule="evenodd" d="M14.849 9.245c-.417-.518-2.513-2.1-1.658-4.219c0 0-1.908.725-1.149 2.953c-.35-.496-3.318-1.616-3.04-7.85c0 0-4.912 2.954-4.912 7.059c0 0 0 3.256 1.974 4.799c0 0-2.616-.43-3.317-4.557c-.176.494-4.756 5.288 1.74 8.446l3.489.083h3.351s7.372-2.493 3.522-6.714z"/></svg>`,
    lightning:  `<svg xmlns="http://www.w3.org/2000/svg" class="ico" viewBox="0 0 1024 1024"><path fill="#0c5e61" d="m576 576l448 448l-832-384l256-192L0 0l832 384z"/></svg>`,
    thunder:    `<svg xmlns="http://www.w3.org/2000/svg" class="ico" viewBox="0 0 24 24"><path fill="#0c5e61" d="m11.55 24l2.35-2.675l-2-1L14.8 17h2.65l-2.35 2.675l2 1L14.2 24h-2.65Zm-6 0l2.35-2.675l-2-1L8.8 17h2.65L9.1 19.675l2 1L8.2 24H5.55Zm1.95-8q-2.275 0-3.887-1.613T2 10.5q0-2.075 1.375-3.625t3.4-1.825q.8-1.425 2.188-2.238T12 2q2.25 0 3.913 1.438t2.012 3.587q1.725.15 2.9 1.425T22 11.5q0 1.875-1.312 3.188T17.5 16h-10Z"/></svg>`,
    acid:       `<svg xmlns="http://www.w3.org/2000/svg" class="ico" viewBox="0 0 512 512"><path fill="#0c5e61" d="M256.875 16A30 30 0 0 0 226 46a30 30 0 0 0 60 0a30 30 0 0 0-29.125-30zm-45 75A30 30 0 0 0 181 121a30 30 0 0 0 60 0a30 30 0 0 0-29.125-30zm74.563 30A15 15 0 0 0 271 136a15 15 0 0 0 30 0a15 15 0 0 0-14.563-15zm-30 45A15 15 0 0 0 241 181a15 15 0 0 0 30 0a15 15 0 0 0-14.563-15zM196 196c-45 0-15 30 0 45c0 150-120 225-120 255h360c0-30-120-105-120-255c15-15 45-45 0-45c-15 0-30 15-60 15s-45-15-60-15z"/></svg>`,
    poison:     `<svg xmlns="http://www.w3.org/2000/svg" class="ico" viewBox="0 0 48 48"><path fill="#0c5e61" fill-rule="evenodd" d="M18 4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2v4a7 7 0 0 0-7 7v20a3 3 0 0 0 3 3h16a3 3 0 0 0 3-3V21a7 7 0 0 0-7-7v-4h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H18Zm4 11v-5h4v5a1 1 0 0 0 1 1h1a5.002 5.002 0 0 1 4.9 4H15.1a5.002 5.002 0 0 1 4.9-4h1a1 1 0 0 0 1-1Zm6.243 15.536l-.707-.707l-2.122 2.122l2.122 2.121l.707-.707l1.414 1.414l-2.829 2.829l-1.414-1.415l.707-.707l-1.414-1.414l.708-.707l1.414 1.414l-.707.707L24 33.365l-2.12 2.12l.706.708l-1.414 1.414l-.707-.707l-1.415-1.414l-.707-.707l1.414-1.415l.708.708l2.12-2.121l-2.12-2.122l-.708.707l-1.414-1.414l.707-.707l1.414-1.414l.708-.707l1.414 1.414l-.707.707L24 30.537l2.122-2.122l-.708-.708l1.414-1.414l2.829 2.828l-1.414 1.415Z" clip-rule="evenodd"/></svg>`,
    psychic:    `<svg xmlns="http://www.w3.org/2000/svg" class="ico" viewBox="0 0 14 14"><path fill="#0c5e61" fill-rule="evenodd" d="M6.883.002A6 6 0 0 1 13 6v4a1.5 1.5 0 0 1-1.5 1.5H10v2a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5v-2.303A6 6 0 0 1 6.883.002M3.56 7.21a3.768 3.768 0 0 1 6.373-3.757c.294.334.225.832-.105 1.13C8.582 5.71 6.53 7.154 4.515 7.688c-.398.106-.817-.09-.955-.477Z" clip-rule="evenodd"/></svg>`,
    radiant:    `<svg xmlns="http://www.w3.org/2000/svg" class="ico" viewBox="0 0 32 32"><path fill="#0c5e61" d="M15 2h2v5h-2zm6.688 6.9l3.506-3.506l1.414 1.414l-3.506 3.506zM25 15h5v2h-5zm-3.312 8.1l1.414-1.413l3.506 3.506l-1.414 1.414zM15 25h2v5h-2zm-9.606.192L8.9 21.686l1.414 1.414l-3.505 3.506zM2 15h5v2H2zm3.395-8.192l1.414-1.414L10.315 8.9L8.9 10.314zM16 12a4 4 0 1 1-4 4a4.005 4.005 0 0 1 4-4m0-2a6 6 0 1 0 6 6a6 6 0 0 0-6-6Z"/></svg>`,
    necrotic:   `<svg xmlns="http://www.w3.org/2000/svg" class="ico" viewBox="0 0 32 32"><path fill="#0c5e61" d="M25.947 11.14c0-5.174-3.98-9.406-10.613-9.406c-6.633 0-10.282 4.232-10.282 9.406s1.46 4.51 1.46 7.43c0 1.095-1.062.564-1.062 2.92c0 2.586 3.615 2.222 4.677 3.282c1.06 1.062.96 3.02.96 3.02s.2.795.565.562c0 0 .232.564.498.232c0 0 .265.563.53.1c0 0 .266.63.697.166c0 0 .43.63.93.133c0 0 .563.53 1.193.133c.63.397 1.194-.133 1.194-.133c.497.497.93-.133.93-.133c.43.465.694-.166.694-.166c.268.464.53-.1.53-.1c.267.332.5-.232.5-.232c.364 .232.563-.563.563-.563s-.1-1.956.962-3.018c1.062-1.06 4.676-.696 4.676-3.283c0-2.355-1.06-1.825-1.06-2.92c0-2.92 1.46-2.256 1.46-7.43zm-15.614 9.852c-1.783.285-2.59-.215-2.785-1.492c-.508-3.328 2.555-3.866 4.08-3.683c.73.088 1.99.862 1.99 1.825c0 2.587-1.626 3.085-3.285 3.35zm6.128 4.31c-.33 0-.86-.43-.894-1.226c-.033.796-.63 1.227-.96 1.227c-.333 0-.83-.33-.864-1.127c-.033-.796 1.028-4.013 1.792-4.013c.762 0 1.824 3.217 1.79 4.013s-.53 1.127-.863 1.127zm6.9-5.802c-.194 1.277-1.003 1.777-2.786 1.492c-1.658-.266-3.283-.763-3.283-3.35c0-.963 1.26-1.737 1.99-1.825c1.525-.183 4.59.355 4.08 3.683z"/></svg>`,
    force:      `<svg xmlns="http://www.w3.org/2000/svg" class="ico" viewBox="0 0 32 32"><g fill="#0c5e61"><path d="M11.018 26.023a5 5 0 1 0 0-10a5 5 0 0 0 0 10Zm11-15.5a.5.5 0 1 1-1 0a.5.5 0 0 1 1 0Zm-6.5 2.5a.5.5 0 1 0 0-1a.5.5 0 0 0 0 1Zm2.5 6.5a.5.5 0 1 1-1 0a.5.5 0 0 1 1 0Zm-5.5-4.5a.5.5 0 1 0 0-1a.5.5 0 0 0 0 1Zm4.49 1a.99.99 0 1 1-1.98 0a.99.99 0 0 1 1.98 0Zm2.01-3.25a.75.75 0 1 0 0-1.5a.75.75 0 0 0 0 1.5Zm.75 2.25a.75.75 0 1 1-1.5 0a.75.75 0 0 1 1.5 0Z"/><path d="M28.693 7.451c.634.968.623 2.342-.321 3.286l-1.747 1.747c.58.962.544 2.285-.373 3.203l-2.457 2.457c.58.962.544 2.285-.373 3.203l-6.06 6.06c-3.511 3.511-9.218 3.511-12.729 0c-3.51-3.51-3.51-9.217 0-12.728l6.05-6.05c.94-.94 2.252-.96 3.205-.375L16.343 5.8c.94-.94 2.252-.96 3.205-.375l1.755-1.755c.967-.967 2.328-.96 3.286-.323l2.33-1.802c2.469-1.926 5.345 1.312 3.567 3.587l-1.793 2.32Zm.214-3.548c.41-.52-.25-1.18-.76-.78l-4.41 3.41v-1.03c0-.53-.64-.8-1.02-.42l-3.94 3.94v-1.39a.596.596 0 0 0-1.02-.42l-4.64 4.64v-1.39a.596.596 0 0 0-1.02-.42l-6.05 6.05a7.007 7.007 0 0 0 0 9.9a7.007 7.007 0 0 0 9.9 0l6.06-6.06l.014-.014l.012-.013c.332-.374.072-.993-.446-.993h-1.39l4.64-4.64a.725.725 0 0 0 .026-.027c.332-.374.072-.993-.445-.993h-1.39l3.93-3.93c.37-.37.11-1.02-.42-1.02h-1.03l3.4-4.4Z"/></g></svg>`,
  };
  function iconHTML(type){
    return ICON_SVGS[(type||'').toLowerCase()] || ICON_SVGS.force;
  }

  function sendToChat(text){
    const ta = document.querySelector('#textchat-input textarea');
    if(!ta) return false;
    ta.value = text;
    const ev = new KeyboardEvent('keydown', {key:'Enter', code:'Enter', which:13, keyCode:13, bubbles:true});
    ta.dispatchEvent(ev);
    return true;
  }
  function waitFor(sel, cb){
    const el = document.querySelector(sel);
    if (el) return cb(el);
    const obs = new MutationObserver(()=>{
      const el2 = document.querySelector(sel);
      if (el2){ obs.disconnect(); cb(el2); }
    });
    obs.observe(document.documentElement, {subtree:true, childList:true});
  }

  // ---- Slot persistence & helpers ----
  function getSlotState(kind, level){
    const key = `slots_${kind}_${level}`;
    const max = (kind==='spell'
                 ? (characterData.spellSlots[level]?.max||0)
                 : (characterData.pactSlots[level]?.max||0));
    let cur = GM_getValue(key, null);
    if (cur == null){ cur = max; GM_SetValue_silent(key, cur); }
    return { cur, max };
  }
  function setSlotState(kind, level, cur){
    const key = `slots_${kind}_${level}`;
    const max = (kind==='spell'
                 ? (characterData.spellSlots[level]?.max||0)
                 : (characterData.pactSlots[level]?.max||0));
    cur = Math.max(0, Math.min(max, cur));
    GM_SetValue_silent(key, cur);
    window.dispatchEvent(new CustomEvent('r20Overlay:slots', { detail:{ kind, level, cur, max }}));
    return { cur, max };
  }
  function consumeSlot(kind, level){
    const st = getSlotState(kind, level);
    if (st.cur <= 0) return false;
    setSlotState(kind, level, st.cur - 1);
    return true;
  }
  function rechargeSlot(kind, level){
    const st = getSlotState(kind, level);
    if (st.cur >= st.max) return false;
    setSlotState(kind, level, st.cur + 1);
    return true;
  }

  // Build the pills (now glowing dots) for both groups
  function renderSlotsUI(root){
    const spellRow = root.getElementById('spellSlotsRow');
    const pactRow  = root.getElementById('pactSlotsRow');
    if (!spellRow || !pactRow) return;

    const s = getSlotState('spell','1');
    spellRow.innerHTML = Array.from({length: s.max}, (_,i)=>{
      const filled = i < s.cur;
      return `<span class="slotDot ${filled?'filled':'empty'}" data-kind="spell" data-lvl="1" data-index="${i}" title="${filled?'Click to consume':'Click to recharge'}"></span>`;
    }).join('');

    const p = getSlotState('pact','3');
    pactRow.innerHTML = Array.from({length: p.max}, (_,i)=>{
      const filled = i < p.cur;
      return `<span class="slotDot ${filled?'filled':'empty'}" data-kind="pact" data-lvl="3" data-index="${i}" title="${filled?'Click to consume':'Click to recharge'}"></span>`;
    }).join('');
  }

  // ---------- Attack builder with global modifiers ----------
  function buildAtkdmgTemplate(attack, { adv = 'normal' } = {}) {
    const a = attack;
    const mods = getGlobalMods();

    const ablMod = characterData.abilities[a.abl]?.mod ?? 0;
    const pbVal  = a.prof ? characterData.profBonus : 0;
    const magic  = a.magic ?? 0;
    const misc   = a.misc  ?? 0;

    const atkBonusBase = ablMod + pbVal + magic + misc;
    const blessBonus   = mods.bless ? ' + 1d4' : '';
    const atkBonusText = fmtSign(atkBonusBase) + blessBonus;

    const primaryDice = a.dmg1 ?? a.dice ?? '1d8';
    const primaryType = (a.dmg1type ?? a.dmgType ?? 'bludgeoning').toLowerCase();
    const hasDmg2 = Boolean(a.dmg2 && a.dmg2type);
    const secDice = hasDmg2 ? a.dmg2 : null;
    const secType = hasDmg2 ? String(a.dmg2type).toLowerCase() : null;

    // Spirit Shroud (+1d8)
    let shroudDice = null, shroudType = null;
    if (mods.shroud && mods.shroud !== 'off'){
      shroudDice = '1d8';
      shroudType = String(mods.shroud).toLowerCase();
    }

    const addAbl   = a.addAblToDamage !== false;
    const dmgBonus = (addAbl ? ablMod : 0) + magic + (a.damageBonus ?? 0);
    const range    = a.range ?? '5 ft';

    // Global conversion
    const toType = (mods.convert && mods.convert !== 'off') ? String(mods.convert).toLowerCase() : null;
    const convType = (t)=> toType ? toType : t;

    // group parts by final type
    const parts = [];
    parts.push({ dice: primaryDice, type: convType(primaryType) });
    if (hasDmg2) parts.push({ dice: secDice, type: convType(secType) });
    if (shroudDice) parts.push({ dice: shroudDice, type: convType(shroudType) });

    const groups = {};
    for (const p of parts){
      if (!groups[p.type]) groups[p.type] = [];
      groups[p.type].push(p.dice);
    }
    const entries = Object.entries(groups);

    const mainTypeAfter = convType(primaryType);
    const primaryGroup = entries.find(([t])=>t===mainTypeAfter) || entries[0];
    const secondaryGroup = entries.filter(([t])=>t!==primaryGroup[0]);

    const rname = a.name;
    const r1  = `[[1d20${atkBonusText}]]`;
    const r2  = `[[1d20${atkBonusText}]]`;
    const mode = adv==='adv' ? 'advantage' : adv==='dis' ? 'disadvantage' : adv==='always' ? 'always' : 'normal';
      
    const dmg1Inline = `[[(${primaryGroup[1].join(' + ')})${fmtSign(dmgBonus)}]]`;

    let msg = `&{template:atkdmg}`
      + ` {{mod=${fmtSign(atkBonusBase)}${mods.bless?' + 1d4':''}}}`
      + ` {{rname=${rname}}} {{r1=${r1}}}`
      + ((mode==='advantage'||mode==='disadvantage'||mode==='always')?` {{r2=${r2}}}`:'')
      + ` {{${mode}=1}} {{attack=1}} {{range=${range}}}`
      + ` {{damage=1}} {{dmg1flag=1}} {{dmg1=${dmg1Inline}}} {{dmg1type=${primaryGroup[0]}}} {{crit=1}} {{crit1=[[${primaryDice}]]}}`;

    if (secondaryGroup.length){
      const [t, diceList] = secondaryGroup[0];
      msg += ` {{dmg2flag=1}} {{dmg2=[[(${diceList.join(' + ')})]]}} {{dmg2type=${t}}} {{crit2=[[${secDice}]]}}`;
    }

    msg += ` {{charname=${characterData.name}}}`;
    return msg;
  }

  // ---------- UI (overlay) ----------
  waitFor('#playerzone', () => {
    const {host, root} = createOverlay();
    wireInteractions(root, host);
    restorePosition(host);
  });

  function createOverlay(){
    const host = document.createElement('div');
    host.id = 'r20-overlay-host';
    host.style.position = 'fixed';
    host.style.top = '96px';
    host.style.right = '24px';
    host.style.zIndex = '999999';
    document.body.appendChild(host);

    const root = host.attachShadow({mode:'open'});
    root.innerHTML = `
      <style>
        :host { all: initial; font-family: Inter, system-ui, Segoe UI, Roboto, Arial, sans-serif; color:#0f172a; }
        .semibold { font-weight:600; }
        @keyframes overlayIn { from{opacity:0; transform: translateY(8px) scale(.98);} to{opacity:1; transform:none;} }


        .card{
          width:420px; border-radius:10px; background:#fff; border:1px solid #eee;
          box-shadow:0 6px 18px rgba(0,0,0,.15), 0 2px 6px rgba(0,0,0,.08);
          overflow:hidden; animation: overlayIn 180ms cubic-bezier(.2,.8,.2,1);
          opacity: 0.1;                /* faded default */
          transition: opacity 250ms ease-in-out;
        }
        .card:hover { opacity:1; }
        .header{
          display:grid; grid-template-columns:1fr auto; align-items:center; gap:8px;
          padding:10px 12px; background: linear-gradient(90deg,#0c5e61,#18b3b8);
          border-bottom:1px solid #eee; color:#fff; cursor:move;
        }
        .title{ font-weight:600; letter-spacing:.2px; }
        .sub{ font-size:12px; color:#cfeff1; font-weight:400; }
        .pillBadge{ font-size:12px; padding:3px 8px; border-radius:999px; background:#f3f4f6; color:#111; border:1px solid #e5e7eb; font-weight:600; }
        .toggle{ border:0; background:transparent; cursor:pointer; padding:6px; border-radius:8px; }
        .toggle:hover{ background:#ffffff22; }
        .chev{ width:16px; height:16px; transition: transform 220ms cubic-bezier(.2,.8,.2,1); }
        .chev.rot{ transform: rotate(-90deg); }

        .quickbar{
          display:flex; gap:6px; align-items:center; padding:4px 6px;
          background:#f9fafb; border-bottom:1px solid #eee;
        }
        .qbIcon{
          height:17px; width:17px; display:block; cursor:pointer;
          -webkit-mask-image: url("https://i.imgur.com/pb0i97K.png");
          -webkit-mask-repeat: no-repeat; -webkit-mask-position: center; -webkit-mask-size: contain;
                  mask-image: url("https://i.imgur.com/pb0i97K.png");
                  mask-repeat: no-repeat; mask-position: center; mask-size: contain;
          background-color: #0c5e61;
        }
        .qbIcon:hover { background-color: #18b3b8; }
        .qbtn{
          font-size:12px; font-weight:600; padding:3px 9px; border-radius:8px; border:1px solid #e5e7eb;
          background:#fff; cursor:pointer;
        }
        .qbtn:hover { border-color:#0c5e61; }

        .tabsWrap{ border:1px solid #e5e7eb; border-radius:12px; background:#f9fafb; }
        .tabBar{ display:flex; gap:6px; padding:6px; background:#fff; border-bottom:1px solid #e5e7eb; border-top-left-radius:12px; border-top-right-radius:12px; justify-content:space-between; }
        .tab{ appearance:none; background:#fff; border:1px solid #e5e7eb; color:#0f172a; padding:4px 8px; border-radius:999px; font-size:11px; font-weight:600; cursor:pointer; }
        .tab.active{ background:#0c5e61; border-color:#0c5e61; color:#fff; }
        .tab:hover{ border-color:#0c5e61; }
        .tabBar .tab {
  flex:1;                 /* every tab takes equal width */
  text-align:center;      /* center the label/icon inside */
  justify-content:center; /* if you use flex inside the tab */
}

        .tabPanels{ position:relative; height:310px; background:#f9fafb; border-bottom-left-radius:12px; border-bottom-right-radius:12px; overflow:hidden; }
.tabPanel{
  position:absolute;
  inset:0;
  padding:8px;
  overflow:auto;
  transform: translateX(100%);  /* off-screen to the right by default */
  opacity:0;
  transition:
    transform 260ms cubic-bezier(.2,.8,.2,1),
    opacity   260ms linear;
  will-change: transform, opacity;
}
.tabPanel.active{
  transform: translateX(0);
  opacity:1;
  z-index: 2;
}
/* Outgoing states (set by JS for direction) */
.tabPanel.exit-left{  transform: translateX(-100%); opacity:0; z-index:1; }
.tabPanel.exit-right{ transform: translateX(100%);  opacity:0; z-index:1; }

        #bodyPane.collapsed { display:none; }
        /* Collapse container animates height smoothly */
#bodyPane{
  overflow:hidden;                       /* clip while animating */
  transition: max-height 280ms cubic-bezier(.2,.8,.2,1);
}
        .bodyInner{ padding:12px; display:grid; gap:12px; }

        /* Ability blocks */
        .stats{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .block{ background:#fff; border:1px solid #e5e7eb; border-radius:10px; overflow:hidden; }

        .blockHead{
          display:grid; grid-template-columns:1fr auto auto; gap:6px;
          padding:6px 8px; font-size:11px; color:#3b5560; font-weight:600;
          background: #edf7f7;
          border-bottom:1px solid #dfecec;
        }

        .ablRow{
          display:grid; grid-template-columns:auto 1fr auto auto; align-items:center; gap:6px;
          padding:5px 8px; font-size:12px; border-bottom:1px solid #f3f6f6; font-weight:400;
        }
        .ablRow:nth-child(even){ background:#f7fbfb; }
        .ablRow:last-child{ border-bottom:none; }
        .abl{ font-weight:600; width:36px; }
        .score{ font-size:11px; color:#6b7280; font-weight:400; }
        .pillBtn{ font-size:11px; padding:2px 6px; border-radius:6px; border:1px solid #e5e7eb; background:#fff; cursor:pointer; font-weight:600; }
        .pillBtn:hover{ border-color:#0c5e61; }

        .list{ border:1px solid #e5e7eb; border-radius:10px; background:#fff; overflow:hidden; }
        .list header{
          display:grid; grid-template-columns: 1fr minmax(56px,auto) minmax(64px,auto) 1fr; gap:6px; align-items:center;
          padding:5px 8px; font-size:11px; color:#374151; font-weight:600;
          background: #edf7f7;
          border-bottom:1px solid #e4eaec;
        }
        .rows{ display:grid; }

        .row{
          display:grid; grid-template-columns: 1fr minmax(56px,auto) minmax(64px,auto) 1fr; gap:6px; align-items:center;
          padding:6px 8px; border-bottom:1px solid #edf2f3; font-size:12px; line-height:1.1;
          border-left:2px solid transparent; border-right:2px solid transparent; cursor:pointer;
        }
        .row:nth-child(even){ background:#f7fbfb; }
        .row:last-child{ border-bottom:none; }
        .row:hover{
          border-left-color:#0c5e61; border-right-color:#0c5e61;
          background:#ecf7f7;
          box-shadow: 0 0 0 1px #0c5e6122 inset;
        }
        .row.child-hover:hover{ border-left-color:transparent; border-right-color:transparent; box-shadow:none; }

        .nameCell{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:600; }
        .meta{ color:#6b7280; font-weight:400; }
        .mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size:11px; font-weight:400; }

        .chip{ font-size:10px; padding:1px 6px; border:1px solid #e5e7eb; border-radius:999px; background:#f9fafb; cursor:pointer; transition: border-color 120ms ease, box-shadow 120ms ease; font-weight:600; }
        .chip.meta{ color:#6b7280; font-weight:400; }
        .chip:hover{ border-color:#0c5e61; box-shadow: 0 0 0 1px #0c5e6122 inset; }

        /* Global Modifiers strip */
        .gmods{
          display:flex; gap:6px; align-items:center; margin-bottom:6px; margin-top:2px;
        }
        .gmods select, .gmods label{
          border:1px solid #ddd; border-radius:6px; background:#fff; font-size:11px; padding:2px 6px; font-weight:600;
        }
        .gmods input{ transform: scale(.9); }

        /* Feature expand */
        .featRow{ user-select:none; display:grid; grid-template-columns: 60% 25%; align-items:center; }
        .caret{ display:inline-block; width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:7px solid #6b7280; margin-right:6px; transform: rotate(0deg); transition: transform 150ms ease, border-top-color 120ms ease; cursor:pointer; }
        .caret:hover{ border-top-color:#0c5e61; }
        .caret.open{ transform: rotate(180deg); }
        .details{
          grid-column: 1 / -1;
          max-height: 0;
          overflow: hidden;
          transition: max-height 220ms ease;
          font-size:11px; color:#374151; padding:0 8px; font-weight:400;
          white-space:pre-line;
        }

        /* Features tab: first column 75%, the remaining 25% is split across the 3 right cells */
#featureList header,
#featureList .row{
  grid-template-columns: 75% auto auto auto;
}
#featureList .nameCell{
  min-width: 0;                /* allow ellipsis to kick in */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

        .details.in{ padding-top:4px; }
        .featControls{ display:flex; gap:6px; align-items:center; padding:6px 0 8px; }
        .ctrlChip{ font-size:10px; padding:2px 8px; border:1px solid #e5e7eb; border-radius:999px; background:#fff; cursor:pointer; font-weight:600; }
        .ctrlChip:hover{ border-color:#0c5e61; box-shadow: 0 0 0 1px #0c5e6122 inset; }

        /* Slots (Spells tab) — BIG glowing dots */
        .slotsPanel{
          display:flex;
          align-items:center;
          gap:20px;
          margin-bottom:8px;
        }
        .slotGroupInline{
          display:flex;
          align-items:center;
          gap:8px;
        }
        .slotsTitle{
          font-size:12px;
          color:#374151;
          white-space:nowrap;
        }
        .slotsRow{
          display:flex;
          gap:8px;
          align-items:center;
        }
        .slotDot{
          width:14px; height:14px; border-radius:999px; border:1px solid #dbe7e9; background:#dbe7e9;
          cursor:pointer; display:inline-block; transition: transform .05s, background .15s, border-color .15s;
        }
        .slotDot.filled{
          background:#0c5e61;
          border-color:#0c5e61;
        }
        .slotDot.empty:hover{ box-shadow: 0 0 0 2px #0c5e611a inset; }
        .slotDot:active{ transform: scale(.96); }

        /* Magic item rarity text colors */
        .r-uncommon { color:#10b981; }  /* green */
        .r-rare     { color:#3b82f6; }  /* blue */
        .r-veryrare { color:#a855f7; }  /* purple */
        .r-legend   { color:#f59e0b; }  /* orange */
        .r-common   { color:#9ca3af; }  /* gray fallback */

        /* Inline consumable charges — SMALL glowing dots */
        .mCharges{ display:flex; gap:6px; align-items:center; }
        .chargeDot{
          width:6px; height:6px; border-radius:999px; border:1px solid #e5e7eb; background:#e5e7eb; cursor:pointer;
        }
        .chargeDot.filled{
          background:#0c5e61;
          border-color:#0c5e61;
        }
        .chargeDot:hover{ transform: scale(1.2); }
        .chargeDot:active{ transform: scale(.9); }

        /* Smite menu */
        .ico{ width:12px; height:12px; vertical-align:-1px; }
      </style>

      <div class="card" id="card">
        <!-- Header -->
        <div class="header" id="drag">
          <div>
            <div class="title"><span class="semibold">${characterData.name}</span></div>
            <div class="sub">Level 7  •  AC 20  •  PP 9  •  Speed 30 ft.</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="toggle" id="collapseAll" title="Collapse/Expand"><span class="chev" id="allChev">▾</span></button>
          </div>
        </div>

        <div class="quickbar">
          <div id="qbInitIcon" class="qbIcon" title="Initiative"></div>
          <button class="qbtn" id="qbSmite">Smite</button>
          <button class="qbtn" id="qbAttack">${characterData.attacks[0]?.name ?? "Attack"}</button>
        </div>

        <div class="body" id="bodyPane">
          <div class="bodyInner">
            <!-- Classic abilities -->
            <div class="stats" id="stats">
              <div class="block">
                <div class="blockHead"><div></div><div>MOD</div><div>SAVE</div></div>
                ${["STR","DEX","CON"].map(ABL=>ablRow(ABL)).join("")}
              </div>
              <div class="block">
                <div class="blockHead"><div></div><div>MOD</div><div>SAVE</div></div>
                ${["INT","WIS","CHA"].map(ABL=>ablRow(ABL)).join("")}
              </div>
            </div>

            <!-- Tabs -->
            <div class="tabsWrap">
              <div class="tabBar" id="tabBar">
                <button class="tab active" data-tab="attacks">Attacks</button>
                <button class="tab" data-tab="features">Features</button>
                <button class="tab" data-tab="skills">Skills</button>
                <button class="tab" data-tab="spells">Spells</button>
                <button class="tab" data-tab="inventory">Inventory</button>
              </div>

              <div class="tabPanels">
                <!-- Attacks -->
                <section class="tabPanel active" data-panel="attacks">
                  <!-- Global Modifiers -->
                  <div class="gmods" id="gmods">
                    <select id="gmShroud" title="Spirit Shroud">
                      <option value="off">Shroud: Off</option>
                      <option value="cold">Shroud: Cold (+1d8)</option>
                      <option value="radiant">Shroud: Radiant (+1d8)</option>
                      <option value="necrotic">Shroud: Necrotic (+1d8)</option>
                    </select>
                    <select id="gmConvert" title="Damage Conversion">
                      <option value="off">Convert: Off</option>
                      <option value="psychic">Convert: Psychic</option>
                      <option value="radiant">Convert: Radiant</option>
                      <option value="necrotic">Convert: Necrotic</option>
                    </select>
                    <label title="Bless (+1d4 to attack)"><input type="checkbox" id="gmBless"> <span class="semibold">Bless</span></label>
                  </div>

                  <div class="list" id="attackList">
                    <header><span>Name</span><span>Range</span><span>To Hit</span><span>Damage</span></header>
                    <div class="rows">
                      ${characterData.attacks.map((a,i)=>attackRowHTML(a,i)).join("")}
                    </div>
                  </div>
                </section>

                <!-- Features -->
                <section class="tabPanel" data-panel="features">
                  <div class="list" id="featureList">
                    <header><span>Name</span><span></span><span>Charges</span><span></span></header>
                    <div class="rows">
                      ${(() => {
                        const withIdx = characterData.features.map((f, idx) => ({ f, idx }));
                        withIdx.sort((a, b) => {
                          const aHas = Number.isFinite(a.f.chargesMax);
                          const bHas = Number.isFinite(b.f.chargesMax);
                          if (aHas && !bHas) return -1;
                          if (!aHas && bHas) return 1;
                          return 0;
                        });
                        return withIdx.map(({ f, idx }) => featureRowHTML(f, idx)).join("");
                      })()}
                    </div>
                  </div>
                </section>

                <!-- Skills -->
                <section class="tabPanel" data-panel="skills">
                  <div class="list" id="skillList">
                    <header><span>Name</span><span>Ability</span><span>Bonus</span><span></span></header>
                    <div class="rows">
                      ${characterData.skills.map((s,i)=>skillRowHTML(s,i)).join("")}
                    </div>
                  </div>
                </section>

                <!-- Spells -->
                <section class="tabPanel" data-panel="spells">
                  <div class="slotsPanel" id="slotsPanel">
                    <div class="slotGroupInline">
                      <span class="slotsTitle semibold">Spell Slots (1st):</span>
                      <div class="slotsRow" id="spellSlotsRow"></div>
                    </div>
                    <div class="slotGroupInline">
                      <span class="slotsTitle semibold">Pact Slots (3rd):</span>
                      <div class="slotsRow" id="pactSlotsRow"></div>
                    </div>
                  </div>

                  <div class="list" id="spellList">
                    <header><span>Name</span><span></span><span></span><span>Info</span></header>
                    <div class="rows">
                      ${characterData.spells.map((sp,i)=>spellRowHTML(sp,i)).join("")}
                    </div>
                  </div>
                </section>

                <!-- Inventory -->
                <section class="tabPanel" data-panel="inventory">
                  <div class="list" id="magicList">
                    <header><span>Name</span><span></span><span>Charges</span><span></span></header>
                    <div class="rows">
                      ${characterData.inventory.magic.map((m,i)=>magicRowHTML(m,i)).join("")}
                    </div>
                  </div>
                  <div class="list" id="mundaneList" style="margin-top:6px;">
                    <header><span>Name</span><span></span><span></span><span>Qty</span></header>
                    <div class="rows">
                      ${characterData.inventory.mundane.map(mi=>mundaneRowHTML(mi)).join("")}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>

        <!-- Smite Menu (click-anchored) -->
        <style>
          .modalMask{ position:fixed; inset:0; background:transparent; display:none; z-index:2147483647; }
          .modalMask.show{ display:block; }
          .menu{
            position:fixed; left:0; top:0;
            min-width:280px; max-width:360px;
            background:#fff; border:1px solid #e5e7eb; border-radius:10px;
            overflow:hidden; animation: menuIn 140ms cubic-bezier(.2,.8,.2,1);
          }
          @keyframes menuIn { from{opacity:0; transform:translateY(4px) scale(.98);} to{opacity:1; transform:none;} }
          .menuHdr{ padding:8px 10px; background:linear-gradient(90deg,#0c5e61,#18b3b8); color:#fff; font-weight:600; font-size:13px; }
          .menuBody{ padding:10px; display:grid; gap:8px; }
          .optionLine{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
          .menuBtns{ display:flex; gap:8px; justify-content:flex-end; padding:8px 10px; border-top:1px solid #eef2f3; }
          .btn{ font-size:12px; font-weight:600; padding:6px 10px; border:1px solid #e5e7eb; border-radius:8px; background:#fff; cursor:pointer; }
          .btn.primary{ background:#0c5e61; border-color:#0c5e61; color:#fff; }
          .btn.primary:hover{ background:#18b3b8; border-color:#18b3b8; }
          .btn:hover{ box-shadow:0 0 0 1px #0c5e6122 inset; }
          .subtle{ font-size:11px; color:#64748b; }
        </style>
        <div class="modalMask" id="smiteMask" part="modal">
          <div class="menu" id="smiteMenu" role="dialog" aria-modal="true" aria-labelledby="smiteTitle">
            <div class="menuHdr" id="smiteTitle">Smite</div>
            <div class="menuBody">
              <div class="optionLine">
                <label><input type="checkbox" id="optSpell"> <span class="semibold">Spell Slot (1st)</span></label>
                <label><input type="checkbox" id="optPact"> <span class="semibold">Pact Slot (3rd)</span></label>
              </div>
              <div class="optionLine">
                <label class="subtle"><input type="checkbox" id="optUndead"> Undead Target (Divine +1d8)</label>
                <label class="subtle"><input type="checkbox" id="optProne"> Knock Prone (Eldritch)</label>
                <label class="subtle"><input type="checkbox" id="optCrit"> Critical Hit (double dice)</label>
              </div>
              <div class="subtle">Tip: select either slot or both; Roll posts a compact damage card with types.</div>
            </div>
            <div class="menuBtns">
              <button class="btn" id="smiteCancel">Cancel</button>
              <button class="btn primary" id="smiteRoll">Roll Smite</button>
            </div>
          </div>
        </div>
      </div>
    `;
    return {host, root};
  }

  // ---------- Row builders ----------
  function ablRow(ABL){
    const a = characterData.abilities[ABL], saveVal = getSave(ABL);
    return `<div class="ablRow">
      <div class="abl semibold">${ABL}</div>
      <div class="score">${a.score}</div>
      <button class="pillBtn" data-abl="${ABL}" data-type="mod">${fmtBonus(a.mod)}</button>
      <button class="pillBtn" data-abl="${ABL}" data-type="save">${fmtBonus(saveVal)}</button>
    </div>`;
  }

  function buildCompactDamageParts(a){
    const ablMod  = characterData.abilities[a.abl]?.mod ?? 0;
    const flat    = (a.addAblToDamage!==false ? ablMod : 0) + (a.magic||0) + (a.damageBonus||0);

    const terms = [];
    if (a.dmg1) {
      const flatTxt = flat ? (flat > 0 ? `+${flat}` : `${flat}`) : '';
      terms.push(`${a.dmg1}${flatTxt} ${iconHTML(a.dmg1type)} `);
    }
    if (a.dmg2 && a.dmg2type) {
      terms.push(`${a.dmg2} ${iconHTML(a.dmg2type)}`);
    }

    let out = '';
    for (let i=0; i<terms.length; i++){
      const t = terms[i];
      if (i === 0) out += t;
      else out += (t.startsWith('-') ? t : `+${t}`);
    }
    return out || '—';
  }

  function attackRowHTML(a,i){
    const ablMod = characterData.abilities[a.abl]?.mod ?? 0;
    const toHit  = ablMod + (a.prof?characterData.profBonus:0) + (a.misc||0) + (a.magic||0);
    const dmgStr = buildCompactDamageParts(a);

    return `<div class="row" data-attack="${i}" title="Click: roll • Shift=Adv • Alt=Dis">
      <div class="nameCell"><span class="semibold">${a.name}</span></div>
      <div class="mono">${a.range || '5 ft'}</div>
      <div class="mono">${fmtBonus(toHit)}</div>
      <div class="mono">${dmgStr}</div>
    </div>`;
  }

  function featureRowHTML(f,i){
    const saved=GM_getValue(`feat_${i}_charges`,null),
          max=Number.isFinite(f.chargesMax)?f.chargesMax:null,
          cur=Math.max(0,Math.min(max??0,(saved ?? f.charges ?? f.chargesMax ?? 0)));
    const counter = (max==null) ? '' : `<span class="chip" id="featCnt_${i}" title="Charges">${cur}/${max}</span>`;
    return `<div class="row featRow" data-feature="${i}" title="Click row to Use; caret to expand">
      <div class="nameCell"><span class="caret" id="caret_${i}" data-caret="${i}" title="Expand/collapse"></span><span class="semibold">${f.name}</span></div>
      <div></div>
      <div>${counter}</div>
      <div></div>
      <div class="details" id="fdet_${i}">
        ${f.text?`<div>${f.text}</div>`:''}
        <div class="featControls">
          ${max!=null?`<span class="ctrlChip" data-feature="${i}" data-chg="-1">− Spend</span><span class="ctrlChip" data-feature="${i}" data-chg="+1">+ Regain</span>`:''}
          <span class="ctrlChip" data-feature="${i}" data-use="1">Use</span>
        </div>
      </div>
    </div>`;
  }

function skillRowHTML(s,i){
  const total=(characterData.abilities[s.abl].mod||0)+(s.prof?characterData.profBonus:0);
  return `<div class="row" data-skill="${i}" title="Click to roll">
    <div class="nameCell"><span class="semibold">${s.key}</span></div>
    <div><span class="chip" data-skill="${i}" data-act="ABL" title="Change ability">${s.abl}</span></div>
    <div class="mono" data-col="bonus">${fmtBonus(total)}</div>
    <div><span class="chip ${s.prof?'':'meta'}" data-skill="${i}" data-act="PROF" title="Toggle proficiency">${s.prof?'Prof':'NoProf'}</span></div>
  </div>`;
}


  function spellRowHTML(sp,i){
    return `<div class="row" data-spell="${i}" title="Click to cast">
      <div class="nameCell"><span class="semibold">${sp.name}</span></div>
      <div></div>
      <div></div>
      <div class="meta">${sp.text||''}</div>
    </div>`;
  }

  /* ---------- Inventory: magic charges + rarity text color ---------- */

  // Persistence helpers for magic-item charges
  function getMagicCharges(i){
    const item = characterData.inventory.magic[i];
    const max = Number.isFinite(item?.chargesMax) ? item.chargesMax : 0;
    if (!max) return { cur:0, max:0 };
    const key = `magic_${i}_charges`;
    let cur = GM_getValue(key, null);
    if (cur == null){ cur = max; GM_SetValue_silent(key, cur); }
    return { cur, max };
  }
  function setMagicCharges(i, cur){
    const { max } = getMagicCharges(i);
    cur = Math.max(0, Math.min(max, cur));
    GM_SetValue_silent(`magic_${i}_charges`, cur);
    return { cur, max };
  }
  function consumeMagicCharge(i){
    const { cur } = getMagicCharges(i);
    if (cur <= 0) return false;
    setMagicCharges(i, cur - 1);
    return true;
  }
  function rechargeMagicCharge(i){
    const { cur, max } = getMagicCharges(i);
    if (cur >= max) return false;
    setMagicCharges(i, cur + 1);
    return true;
  }

  function rarityClass(rarity){
    const r = (rarity||'common').toLowerCase();
    return r.includes('legend') ? 'r-legend'
         : r.includes('very')   ? 'r-veryrare'
         : r === 'rare'         ? 'r-rare'
         : r === 'uncommon'     ? 'r-uncommon'
         : 'r-common';
  }

  function magicRowHTML(item,i){
    const rClass = rarityClass(item.rarity);

    // Charges UI if configured
    let chargesHTML = '';
    if (Number.isFinite(item.chargesMax)){
      const { cur, max } = getMagicCharges(i);
      chargesHTML = `<div class="mCharges" data-magic="${i}">
        ${Array.from({length:max}, (_,k)=>`<span class="chargeDot ${k<cur?'filled':''}" data-magic="${i}" data-index="${k}" title="${k<cur?'Click to consume':'Click to recharge'}"></span>`).join('')}
      </div>`;
    }

    return `<div class="row" data-magic="${i}" title="Click to use • Click dots to spend/recharge">
      <div class="nameCell"><span class="semibold ${rClass}">${item.name}</span></div>
      <div></div>
      <div>${chargesHTML}</div>
      <div></div>
    </div>`;
  }

  function mundaneRowHTML(mi){
    return `<div class="row" data-mundane="1">
      <div class="nameCell"><span class="semibold">${mi.name}</span></div>
      <div></div>
      <div></div>
      <div class="mono">${mi.qty}</div>
    </div>`;
  }

  // ---------- Interactions ----------
  function wireInteractions(root, host){
    const card=root.getElementById('card');
    const drag=root.getElementById('drag'); makeDraggable(host, drag);

    // ---- Smite menu helpers & roller
    function openSmite(ev){
      const mask = root.getElementById('smiteMask');
      const menu = root.getElementById('smiteMenu');
      if (!mask || !menu) return;

      let x = (ev?.clientX ?? (window.innerWidth/2));
      let y = (ev?.clientY ?? (window.innerHeight/2));

      mask.classList.add('show');
      menu.style.visibility = 'hidden';
      menu.style.left = x + 'px';
      menu.style.top  = y + 'px';

      requestAnimationFrame(()=>{
        const r = menu.getBoundingClientRect();
        const pad = 8;
        if (x + r.width > window.innerWidth - pad)  x = Math.max(pad, x - r.width);
        if (y + r.height > window.innerHeight - pad) y = Math.max(pad, y - r.height);
        menu.style.left = x + 'px';
        menu.style.top  = y + 'px';
        menu.style.visibility = 'visible';
      });
    }
    function closeSmite(){ root.getElementById('smiteMask')?.classList.remove('show'); }

    function buildSmiteMsg({ useSpell, usePact, undead, prone, crit }){
      // Divine Smite (1st): 2d8 radiant (+1d8 if undead); crit doubles dice
      let divDice = 0;
      if (useSpell){
        divDice = 2 + (undead ? 1 : 0); // number of d8s
        if (crit) divDice *= 2;
      }
      // Eldritch Smite (3rd): 1d8 + 1d8/level (3) = 4d8; crit doubles
      let eldDice = 0;
      if (usePact){
        eldDice = 1 + 3;
        if (crit) eldDice *= 2;
      }

      let msg = `&{template:atkdmg} {{rname=Smite}} {{damage=1}}`;
      if (useSpell){
        msg += ` {{dmg1flag=1}} {{dmg1=[[${divDice}d8]]}} {{dmg1type=Radiant}}`;
      }
      if (usePact){
        msg += ` {{dmg2flag=1}} {{dmg2=[[${eldDice}d8]]}} {{dmg2type=Force}}`;
      }

      const notes = [];
      if (useSpell && undead) notes.push("Undead target");
      if (usePact && prone)  notes.push("Knock Prone");
      if (crit)              notes.push("Critical");
      if (notes.length) msg += ` {{range=${notes.join(" • ")}}}`;
      msg += ` {{charname=${characterData.name}}}`;
      return msg;
    }

    // Collapse
const bodyPane  = root.getElementById('bodyPane');
const collapseAll = root.getElementById('collapseAll');
const allChev   = root.getElementById('allChev');

// Initialize expanded/collapsed state with measured max-height
function setBodyExpanded(on){
  if (on){
    // expanding: from current max-height to content height
    bodyPane.style.maxHeight = bodyPane.scrollHeight + 'px';
    allChev.classList.remove('rot');
  } else {
    // collapsing: set explicit height first to animate down to 0
    bodyPane.style.maxHeight = bodyPane.scrollHeight + 'px';
    // next frame, go to 0
    requestAnimationFrame(()=> bodyPane.style.maxHeight = '0px');
    allChev.classList.add('rot');
  }
  GM_SetValue_silent('expanded', on ? 1 : 0);
}

// restore persisted state
const wasExpanded = GM_getValue('expanded', 1) === 1;
if (wasExpanded){
  // set to natural height (no jump) after mount
  requestAnimationFrame(()=> bodyPane.style.maxHeight = bodyPane.scrollHeight + 'px');
  allChev.classList.remove('rot');
} else {
  bodyPane.style.maxHeight = '0px';
  allChev.classList.add('rot');
}

// toggle on click
collapseAll.addEventListener('click', ()=>{
  const isOpen = (parseFloat(bodyPane.style.maxHeight||'0') > 0);
  setBodyExpanded(!isOpen);
});

// keep height in sync if the inner content changes size while open
const ro = new ResizeObserver(()=>{
  const isOpen = (GM_getValue('expanded',1)===1);
  if (isOpen) bodyPane.style.maxHeight = bodyPane.scrollHeight + 'px';
});
ro.observe(bodyPane);

    root.getElementById('drag').addEventListener('dblclick',()=>collapseAll.click());

// --- Sliding tabs ---
const tabBar   = root.getElementById('tabBar');
const panels   = Array.from(root.querySelectorAll('.tabPanel'));
const tabs     = Array.from(tabBar.querySelectorAll('.tab'));
const panelIdx = new Map(panels.map((p,i)=>[p.dataset.panel, i]));

// ensure exactly one active on init
if (!panels.some(p => p.classList.contains('active'))) panels[0].classList.add('active');

tabBar.addEventListener('click', (e)=>{
  const t = e.target.closest('.tab');
  if (!t) return;

  const targetName = t.dataset.tab;
  const next = panels[panelIdx.get(targetName)];
  const cur  = panels.find(p => p.classList.contains('active'));
  if (next === cur) return;

  // tab button active state
  tabs.forEach(tb => tb.classList.toggle('active', tb === t));

  const curIdx  = panels.indexOf(cur);
  const nextIdx = panels.indexOf(next);
  const dirLeft = nextIdx < curIdx;

  // prepare incoming panel so it starts from the correct side
  next.style.transform = `translateX(${dirLeft ? '-100%' : '100%'})`;
  next.style.opacity = '0';
  next.classList.add('active'); // becomes the new active

  // trigger reflow so the transform takes effect before transition
  // (important for consistent animation)
  void next.offsetWidth;

  // animate outgoing
  cur.classList.remove('active');
  cur.classList.add(dirLeft ? 'exit-right' : 'exit-left');

  // let CSS bring the incoming to 0,1 automatically
  next.style.transform = '';
  next.style.opacity = '';

  // cleanup after transition
  const onDone = (ev)=>{
    if (ev.target !== cur) return;
    cur.classList.remove('exit-left','exit-right');
    cur.removeEventListener('transitionend', onDone);
  };
  cur.addEventListener('transitionend', onDone, { once:true });
});


    // Slots UI (big glowing dots)
    renderSlotsUI(root);
    root.getElementById('slotsPanel')?.addEventListener('click', (e)=>{
      const dot = e.target.closest('.slotDot'); if (!dot) return;
      const kind = dot.dataset.kind;     // 'spell' | 'pact'
      const lvl  = dot.dataset.lvl;      // '1' | '3'
      if (dot.classList.contains('filled')) consumeSlot(kind, lvl);
      else                                  rechargeSlot(kind, lvl);
      renderSlotsUI(root);
    });

    // Abilities roll
root.getElementById('stats').addEventListener('click', (e)=>{
  const btn = e.target.closest('.pillBtn'); if(!btn||!btn.dataset.abl) return;
  const abl = btn.dataset.abl;
  const type = btn.dataset.type;

  if (type === 'save'){
    const mod = getSave(abl);
    sendToChat(buildSimpleRoll({
      rname: `${abl} Save`,
      mod,
      charname: characterData.name
    }));
  } else {
    // Ability check: keep your existing /roll format
    const mod = characterData.abilities[abl].mod;
    sendToChat(`/em ${characterData.name} rolls ${abl} Check\n/roll 1d20 ${fmtBonus(mod)}`);
  }
});


    // Quickbar
    root.getElementById('qbInitIcon')?.addEventListener('click', ()=>{
      const initMod = characterData.abilities.DEX?.mod ?? 0;
      sendToChat(`/roll 1d20 ${initMod>=0?`+${initMod}`:initMod} &{tracker}`);
    });
    root.getElementById('qbAttack')?.addEventListener('click', (e)=>{
      const a=characterData.attacks[0];
      const adv = e.ctrlKey ? 'always' : (e.shiftKey ? 'adv' : (e.altKey ? 'dis' : 'normal'));
      sendToChat(buildAtkdmgTemplate(a, { adv }));
    });
    root.getElementById('qbSmite')?.addEventListener('click', (e)=>openSmite(e));

    // Global modifiers
    const gm = getGlobalMods();
    const selShroud  = root.getElementById('gmShroud');
    const selConvert = root.getElementById('gmConvert');
    const chkBless   = root.getElementById('gmBless');
    selShroud.value  = gm.shroud ?? 'off';
    selConvert.value = gm.convert ?? 'off';
    chkBless.checked = !!gm.bless;

    selShroud.addEventListener('change', ()=> setGlobalMods({ ...getGlobalMods(), shroud: selShroud.value }));
    selConvert.addEventListener('change', ()=> setGlobalMods({ ...getGlobalMods(), convert: selConvert.value }));
    chkBless.addEventListener('change', ()=> setGlobalMods({ ...getGlobalMods(), bless: chkBless.checked }));

    // Smart hover (suppress row highlight if interactive child hovered)
    function isInteractiveChild(el){ return !!el.closest('.chip, .ctrlChip, .chargeDot, [data-caret]'); }
    function setChildHoverState(target, on){ const row = target.closest('.row'); if(row) row.classList.toggle('child-hover', !!on); }
    root.addEventListener('mouseover', (e)=>{ if (isInteractiveChild(e.target)) setChildHoverState(e.target, true); });
    root.addEventListener('mouseout',  (e)=>{ if (isInteractiveChild(e.target)) setChildHoverState(e.target, false); });

    // Attacks
    const attackList=root.getElementById('attackList');
    attackList.addEventListener('click', (e)=>{
      const row=e.target.closest('.row[data-attack]'); if(!row) return;
      const i=+row.dataset.attack; const a=characterData.attacks[i];
      const advKey = (e.shiftKey?'adv':(e.altKey?'dis':'normal'));
      sendToChat(buildAtkdmgTemplate(a, { adv: advKey }));
    });

    // ---- Smite menu option wiring
    const mask = root.getElementById('smiteMask');
    const optSpell = root.getElementById('optSpell');
    const optPact  = root.getElementById('optPact');
    const optUndead= root.getElementById('optUndead');
    const optProne = root.getElementById('optProne');
    const optCrit  = root.getElementById('optCrit');

    function updateOptionVisibility(){
      optUndead.disabled = !optSpell.checked;
      optProne.disabled  = !optPact.checked;
    }
    optSpell.addEventListener('change', updateOptionVisibility);
    optPact .addEventListener('change', updateOptionVisibility);
    updateOptionVisibility();

    root.getElementById('smiteCancel')?.addEventListener('click', closeSmite);
    mask?.addEventListener('click', (e)=>{ if (e.target === mask) closeSmite(); });

    root.getElementById('smiteRoll')?.addEventListener('click', ()=>{
      const useSpell = !!optSpell.checked;
      const usePact  = !!optPact.checked;
      const undead   = !!optUndead.checked;
      const prone    = !!optProne.checked;
      const crit     = !!optCrit.checked;

      if (!useSpell && !usePact){
        optSpell.checked = true;
        updateOptionVisibility();
        return;
      }

      let notes = [];
      if (useSpell){
        const ok = consumeSlot('spell','1');
        if (!ok) notes.push('No 1st-level spell slots');
      }
      if (usePact){
        const ok = consumeSlot('pact','3');
        if (!ok) notes.push('No 3rd-level pact slots');
      }
      renderSlotsUI(root);

      let msg = buildSmiteMsg({ useSpell, usePact, undead, prone, crit });
      if (notes.length){
        msg += ` {{range=${notes.join(" • ")}}}`;
      }

      sendToChat(msg);
      closeSmite();
    });

    // Features (expand/charges/use + smite launcher)
    const featureList=root.getElementById('featureList');
    featureList.addEventListener('click', (e)=>{
      const caretBtn = e.target.closest('[data-caret]');
      const ctrl     = e.target.closest('.ctrlChip[data-feature]');

      if (caretBtn){ toggleFeatureDetails(root, +caretBtn.dataset.caret); return; }

      if (ctrl){
        const i = +ctrl.dataset.feature;
        const f = characterData.features[i];

        if (ctrl.dataset.use){
          if (f.smiteLauncher){ openSmite(e); return; }
          sendToChat(`/em uses ${f.name}. ${f.text||""}`);
          return;
        }

        if (ctrl.dataset.chg){
          const delta = parseInt(ctrl.dataset.chg, 10);
          if (Number.isFinite(f.chargesMax)){
            const key   = `feat_${i}_charges`;
            const saved = GM_getValue(key, null);
            const cur   = Math.max(0, Math.min(f.chargesMax, saved ?? f.charges ?? f.chargesMax));
            const nxt   = Math.max(0, Math.min(f.chargesMax, cur + delta));
            GM_SetValue_silent(key, nxt);
            const cnt = root.getElementById(`featCnt_${i}`);
            if (cnt) cnt.textContent = `${nxt}/${f.chargesMax}`;
          }
          return;
        }
      }

      const row = e.target.closest('.row.featRow[data-feature]');
      if (!row) return;
      const i = +row.dataset.feature;
      const f = characterData.features[i];

      if (f.smiteLauncher){ openSmite(e); return; }
      sendToChat(`/em uses ${f.name}. ${f.text||""}`);
    });

      // Skills: roll on row click; chips to cycle ability / toggle proficiency
// --- Skills: cycle ability / toggle prof / roll row ---
const skillRows = root.querySelector('#skillList .rows');
if (skillRows) {
  const bonusOf = (sk) =>
    (characterData.abilities[sk.abl].mod || 0) +
    (sk.prof ? characterData.profBonus : 0);

  skillRows.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip[data-skill]');
    if (chip) {
      const i  = +chip.dataset.skill;
      const sk = characterData.skills[i];
      const row = chip.closest('.row[data-skill]');
      if (!row) return;

      if (chip.dataset.act === 'ABL') {
        sk.abl = nextABL(sk.abl);
        row.querySelector('.chip[data-act="ABL"]').textContent = sk.abl;
        const newBonus = bonusOf(sk);
        row.querySelector('[data-col="bonus"]').textContent =
          (newBonus >= 0 ? `+${newBonus}` : `${newBonus}`);
        e.stopPropagation();
        return;
      }

      if (chip.dataset.act === 'PROF') {
        sk.prof = !sk.prof;
        const profChip = row.querySelector('.chip[data-act="PROF"]');
        profChip.textContent = sk.prof ? 'Prof' : 'NoProf';
        profChip.classList.toggle('meta', !sk.prof);
        const newBonus = bonusOf(sk);
        row.querySelector('[data-col="bonus"]').textContent =
          (newBonus >= 0 ? `+${newBonus}` : `${newBonus}`);
        e.stopPropagation();
        return;
      }
    }

    // Row click rolls the check
// Roll when clicking anywhere else on the row
const row = e.target.closest('.row[data-skill]');
if (!row) return;
const i  = +row.dataset.skill;
const sk = characterData.skills[i];
const total = bonusOf(sk);
sendToChat(buildSimpleRoll({
  rname: `${sk.key} (${sk.abl})`,
  mod: total,
  charname: characterData.name
}));

  });
}
// <-- nothing else here related to skills; DO NOT leave any stray code after this

    // Spells
    root.getElementById('spellList').addEventListener('click', (e)=>{
      const row=e.target.closest('.row[data-spell]'); if(!row) return;
      const i=+row.dataset.spell; const sp=characterData.spells[i];
      sendToChat(sp.macro ?? `/em casts ${sp.name}.`);
    });

    // Inventory (magic) — small glowing dots
    const magicList = root.getElementById('magicList');
    magicList.addEventListener('click', (e)=>{
      const dot = e.target.closest('.chargeDot');
      if (dot){
        const i = +dot.dataset.magic;
        if (dot.classList.contains('filled')) consumeMagicCharge(i);
        else                                   rechargeMagicCharge(i);
        rerenderMagicRow(root, i);
        return;
      }
      const row=e.target.closest('.row[data-magic]'); if(!row) return;
      const i=+row.dataset.magic; const it=characterData.inventory.magic[i];
      sendToChat(`/em uses ${it.name}.`);
    });
  }

  // Safe wrapper for GM_setValue
  function GM_SetValue_silent(k,v){ try{ GM_setValue(k,v); }catch(e){} }

  function nextABL(cur){
    const i = ABL_ORDER.indexOf(cur);
    return ABL_ORDER[(i+1) % ABL_ORDER.length];
  }

  function toggleFeatureDetails(root, i){
    const caret=root.getElementById(`caret_${i}`);
    const det=root.getElementById(`fdet_${i}`);
    if(!caret || !det) return;
    const opening = !caret.classList.contains('open');
    caret.classList.toggle('open', opening);
    if(opening){
      det.classList.add('in');
      det.style.maxHeight = det.scrollHeight + 'px';
    }else{
      det.style.maxHeight = det.scrollHeight + 'px';
      requestAnimationFrame(()=>{ det.classList.remove('in'); det.style.maxHeight = '0px'; });
    }
  }

  function rerenderMagicRow(root, i){
    const rows = root.querySelector('#magicList .rows');
    const old  = rows.querySelector(`.row[data-magic="${i}"]`);
    if(!old) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = magicRowHTML(characterData.inventory.magic[i], i);
    old.replaceWith(wrap.firstElementChild);
  }

  function restorePosition(host){
    const pos=GM_getValue('pos',null);
    if(pos?.left && pos?.top){ host.style.left=pos.left; host.style.top=pos.top; host.style.right='auto'; }
  }
  function makeDraggable(host, handle){
    let ix=0,iy=0,ox=0,oy=0,down=false;
    handle.addEventListener('mousedown', e=>{down=true; ix=e.clientX; iy=e.clientY; ox=host.offsetLeft; oy=host.offsetTop; e.preventDefault();});
    window.addEventListener('mousemove', e=>{ if(!down) return; const dx=e.clientX-ix, dy=e.clientY-iy; host.style.left=(ox+dx)+'px'; host.style.top=(oy+dy)+'px'; host.style.right='auto'; });
    window.addEventListener('mouseup', ()=>{ if(!down) return; down=false; GM_SetValue_silent('pos',{left:host.style.left, top:host.style.top}); });
  }
})();
