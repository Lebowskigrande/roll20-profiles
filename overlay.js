/* overlay.js
   Public API: window.Overlay.init(rootShadow, hostDiv)
   - rootShadow: the ShadowRoot created by the loader
   - hostDiv:    the absolutely-positioned container for dragging/persisting
*/
(function () {
  'use strict';

  // -------- Utilities & formatting --------
  const ABL_ORDER = ["STR","DEX","CON","INT","WIS","CHA"];
  const ICON_SVGS = { slashing:"🗡️", piercing:"🏹", bludgeoning:"🔨", fire:"🔥", cold:"❄️", radiant:"✨", necrotic:"💀", force:"💥", lightning:"⚡", thunder:"🔊", acid:"🧪", poison:"☠️" };
  const fmtBonus = n => (n>=0?`+${n}`:`${n}`);
  const fmtSign  = n => (n>=0?`+${n}`:`${n}`);

  function GM_SetValue_silent(k,v){ try{ GM_setValue(k,v); }catch(e){} }
  function GM_GetValue_silent(k, d){ try{ const v=GM_getValue(k,d); return v===undefined?d:v; }catch(e){ return d; } }

  // send text to Roll20 chat
  function sendToChat(text){
    const ta = document.querySelector('#textchat-input textarea');
    if(!ta) return false;
    ta.value = text;
    ta.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', code:'Enter', which:13, keyCode:13, bubbles:true}));
    return true;
  }

  // wait for element (not used here — loader waits for VTT)
  function waitFor(sel, cb){
    const el = document.querySelector(sel);
    if (el) return cb(el);
    const obs = new MutationObserver(()=>{
      const el2 = document.querySelector(sel);
      if (el2){ obs.disconnect(); cb(el2); }
    });
    obs.observe(document.documentElement, {subtree:true, childList:true});
  }

  // -------- Character helpers --------
  // Derive save proficiency flags once
  for (const abl of Object.keys(characterData.abilities)) {
    const a = characterData.abilities[abl];
    a.saveProf = (typeof a.save === 'number') ? ((a.save - a.mod) >= characterData.profBonus) : false;
  }
  const getSave = abl => {
    const a = characterData.abilities[abl] || {};
    return (a.mod||0) + (a.saveProf ? characterData.profBonus : 0);
  };

  // global roll builder (simple)
  function buildSimpleRoll({ rname, mod, charname }){
    const m = mod >= 0 ? `+${mod}` : `${mod}`;
    return `&{template:simple} {{rname=${rname}}} {{mod=${fmtBonus(mod)}}} {{r1=[[1d20${m}]]}} {{always=1}} {{r2=[[1d20${m}]]}} {{charname=${charname}}}`;
  }

  // -------- Global modifiers (Spirit Shroud / Conversion / Bless) --------
  function getGlobalMods(){
    const v = GM_GetValue_silent('r20_global_mods', null);
    if (v && typeof v==='object') return v;
    const def = { shroud:'off', convert:'off', bless:false };
    GM_SetValue_silent('r20_global_mods', def);
    return {...def};
  }
  function setGlobalMods(next){
    GM_SetValue_silent('r20_global_mods', next);
    window.dispatchEvent(new CustomEvent('r20Overlay:globalMods', { detail: next }));
  }

  // -------- Slots (spell/pact) persistence --------
  function getSlotState(kind, level){
    const key = `slots_${kind}_${level}`;
    const max = (kind==='spell'
      ? (characterData.spellSlots[level]?.max||0)
      : (characterData.pactSlots[level]?.max||0));
    let cur = GM_GetValue_silent(key, null);
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
  const consumeSlot  = (kind,lvl)=>{ const s=getSlotState(kind,lvl); if(s.cur<=0) return false; setSlotState(kind,lvl,s.cur-1); return true; };
  const rechargeSlot = (kind,lvl)=>{ const s=getSlotState(kind,lvl); if(s.cur>=s.max) return false; setSlotState(kind,lvl,s.cur+1); return true; };

  function renderSlotsUI(root){
    const spellRow = root.getElementById('spellSlotsRow');
    const pactRow  = root.getElementById('pactSlotsRow');
    if (!spellRow || !pactRow) return;

    const s = getSlotState('spell','1');
    spellRow.innerHTML = Array.from({length: s.max}, (_,i)=>{
      const filled = i < s.cur;
      return `<span class="slotDot ${filled?'filled':'empty'}" data-kind="spell" data-lvl="1" data-index="${i}" title="${filled?'Click to consume':'Click to recharge'}"></span>`;
    }).join('');

    const p = getSlotState('pact','2');
    pactRow.innerHTML = Array.from({length: p.max}, (_,i)=>{
      const filled = i < p.cur;
      return `<span class="slotDot ${filled?'filled':'empty'}" data-kind="pact" data-lvl="2" data-index="${i}" title="${filled?'Click to consume':'Click to recharge'}"></span>`;
    }).join('');
  }

  // -------- Attack & damage rolls --------
  function iconHTML(type){ return ICON_SVGS[(type||'').toLowerCase()] || ICON_SVGS.force; }

  function buildCompactDamageParts(a){
    const ablMod  = characterData.abilities[a.abl]?.mod ?? 0;
    const flat    = (a.addAblToDamage!==false ? ablMod : 0) + (a.magic||0) + (a.damageBonus||0);
    const terms = [];
    if (a.dmg1) {
      const flatTxt = flat ? (flat > 0 ? `+${flat}` : `${flat}`) : '';
      terms.push(`${a.dmg1}${flatTxt} ${iconHTML(a.dmg1type)} `);
    }
    if (a.dmg2 && a.dmg2type) terms.push(`${a.dmg2} ${iconHTML(a.dmg2type)}`);
    return terms.length ? terms.join('+') : '—';
  }

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
    if (mods.shroud && mods.shroud !== 'off'){ shroudDice = '1d8'; shroudType = String(mods.shroud).toLowerCase(); }

    const addAbl   = a.addAblToDamage !== false;
    const dmgBonus = (addAbl ? ablMod : 0) + magic + (a.damageBonus ?? 0);
    const range    = a.range ?? '5 ft';

    // Global conversion
    const toType = (mods.convert && mods.convert !== 'off') ? String(mods.convert).toLowerCase() : null;
    const convType = (t)=> toType ? toType : t;

    // group dice parts by final type
    const groups = {};
    [{dice:primaryDice,type:convType(primaryType)}]
      .concat(hasDmg2 ? [{dice:secDice,type:convType(secType)}] : [])
      .concat(shroudDice ? [{dice:shroudDice, type:convType(shroudType)}] : [])
      .forEach(p => { (groups[p.type] ||= []).push(p.dice); });

    const entries = Object.entries(groups);
    const mainTypeAfter = convType(primaryType);
    const primaryGroup  = entries.find(([t])=>t===mainTypeAfter) || entries[0];
    const secondaryGroup= entries.filter(([t])=>t!==primaryGroup[0]);

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
      + ` {{damage=1}} {{dmg1flag=1}} {{dmg1=${dmg1Inline}}} {{dmg1type=${primaryGroup[0]}}}`;

    if (secondaryGroup.length){
      const [t, diceList] = secondaryGroup[0];
      msg += ` {{dmg2flag=1}} {{dmg2=[[(${diceList.join(' + ')})]]}} {{dmg2type=${t}}}`;
    }

    msg += ` {{charname=${characterData.name}}}`;
    return msg;
  }

  // -------- Inventory charge persistence --------
  function getMagicCharges(i){
    const item = characterData.inventory?.magic?.[i];
    const max = Number.isFinite(item?.chargesMax) ? item.chargesMax : 0;
    if (!max) return { cur:0, max:0 };
    const key = `magic_${i}_charges`;
    let cur = GM_GetValue_silent(key, null);
    if (cur == null){ cur = max; GM_SetValue_silent(key, cur); }
    return { cur, max };
  }
  function setMagicCharges(i, cur){
    const { max } = getMagicCharges(i);
    cur = Math.max(0, Math.min(max, cur));
    GM_SetValue_silent(`magic_${i}_charges`, cur);
    return { cur, max };
  }
  const consumeMagicCharge = (i)=>{ const {cur}=getMagicCharges(i); if(cur<=0) return false; setMagicCharges(i,cur-1); return true; };
  const rechargeMagicCharge= (i)=>{ const {cur,max}=getMagicCharges(i); if(cur>=max) return false; setMagicCharges(i,cur+1); return true; };
  function rarityClass(r){
    const x = (r||'common').toLowerCase();
    return x.includes('legend') ? 'r-legend' : x.includes('very') ? 'r-veryrare' : x==='rare' ? 'r-rare' : x==='uncommon' ? 'r-uncommon' : 'r-common';
  }

  // -------- Row builders & renderers --------
  function ablRow(ABL){
    const a = characterData.abilities[ABL], saveVal = getSave(ABL);
    return `<div class="ablRow">
      <div class="abl semibold">${ABL}</div>
      <div class="score">${a.score}</div>
      <button class="pillBtn" data-abl="${ABL}" data-type="mod">${fmtBonus(a.mod)}</button>
      <button class="pillBtn" data-abl="${ABL}" data-type="save">${fmtBonus(saveVal)}</button>
    </div>`;
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
    const saved=GM_GetValue_silent(`feat_${i}_charges`,null),
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

  function componentsChipHTML(sp){
    const v = sp.components?.v ? 'V' : '<span class="off">V</span>';
    const s = sp.components?.s ? 'S' : '<span class="off">S</span>';
    const m = sp.components?.m ? 'M' : '<span class="off">M</span>';
    return `<span class="compChip compVSM" title="Components">${v}${s}${m}</span>`;
  }
  const tagChipHTML = (letter,title)=>`<span class="tagSq" title="${title}">${letter}</span>`;
  function renderLevelSlots(kind, level){
    const state = (kind === 'spell') ? characterData.spellSlots[level] : characterData.pactSlots[level];
    if (!state?.max) return '';
    const s = getSlotState(kind, String(level));
    const ord = (n)=>`${n}${n===1?'st':n===2?'nd':n===3?'rd':'th'}`;
    const title = (kind==='spell') ? `Spell Slots (${ord(level)})` : `Pact Slots (${ord(level)})`;
    const dots = Array.from({length:s.max}, (_,i)=>{
      const filled = i < s.cur;
      return `<span class="slotDot ${filled?'filled':'empty'}" data-kind="${kind}" data-lvl="${level}" data-index="${i}" title="${filled?'Click to consume':'Click to recharge'}"></span>`;
    }).join('');
    return `<div class="slotGroupInline"><span class="slotsTitle semibold">${title}:</span><div class="slotsRow">${dots}</div></div>`;
  }
  function spellRowGroupHTML(level, spellsAtLevel){
    if (!spellsAtLevel.length) return '';
    const spellDots = renderLevelSlots('spell', level);
    const pactDots  = renderLevelSlots('pact',  level);
    const headDots  = [spellDots, pactDots].filter(Boolean).join('<span style="width:8px;"></span>');

    const rows = spellsAtLevel.map(sp => {
      const comps = componentsChipHTML(sp);
      const tags = [
        sp.ritual ? tagChipHTML('R','Ritual') : '',
        sp.concentration ? tagChipHTML('C','Concentration') : ''
      ].filter(Boolean).join('<span style="width:4px;"></span>');
      return `
        <div class="spellRow" data-spell-name="${sp.name}" data-spell-level="${sp.level}">
          <div class="spellName">${sp.name}</div>
          <div style="display:flex; gap:6px; align-items:center;">${comps}${tags?`<span style="width:6px;"></span>${tags}`:''}</div>
          <div class="metaSmall"></div>
          <div class="metaSmall">${sp.short||''}</div>
        </div>
        <div class="spellDetails">${sp.long?sp.long:''}</div>
      `;
    }).join('');

    const levelLabel = (level===0 ? 'Cantrips' :
      `${level}${level===1?'st':level===2?'nd':level===3?'rd':'th'}‑level`);

    return `
      <div class="levelSection" data-lvlsec="${level}">
        <div class="levelHead">
          <div class="levelTitle">${levelLabel}</div>
          <div class="levelSlots">${headDots || ''}</div>
        </div>
        <div class="rows">
          ${rows}
        </div>
      </div>
    `;
  }
  function buildSpellGroupsHTML(){
    const byLevel = new Map();
    for (const sp of (characterData.spells || [])) {
      const lvl = Number(sp.level||0);
      if (!byLevel.has(lvl)) byLevel.set(lvl, []);
      byLevel.get(lvl).push(sp);
    }
    const ordered = [0,1,2,3,4,5,6,7,8,9].filter(l => byLevel.has(l) && byLevel.get(l).length);
    return ordered.map(l => spellRowGroupHTML(l, byLevel.get(l))).join('');
  }
  function renderSpellsTab(root){
    const wrap = root.getElementById('spellGroups');
    if (!wrap) return;
    wrap.innerHTML = buildSpellGroupsHTML();
  }

  function magicRowHTML(item,i){
    const rClass = rarityClass(item.rarity);
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
  function rerenderMagicRow(root, i){
    const rows = root.querySelector('#magicList .rows');
    const old  = rows?.querySelector(`.row[data-magic="${i}"]`);
    if(!old) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = magicRowHTML(characterData.inventory.magic[i], i);
    old.replaceWith(wrap.firstElementChild);
  }

  // Section renderers
  function renderAbilities(root){ const el = root.getElementById('stats'); if (!el) return; el.innerHTML = ABL_ORDER.map(abl => ablRow(abl)).join(''); }
  function renderAttacks(root){
    const list = root.getElementById('attackList')?.querySelector('.rows'); if (!list) return;
    const arr = characterData.attacks || [];
    list.innerHTML = arr.map((a, i) => attackRowHTML(a, i)).join('');
  }
  function renderSkills(root){
    const list = root.getElementById('skillList')?.querySelector('.rows'); if (!list) return;
    const arr = characterData.skills || [];
    list.innerHTML = arr.map((s, i) => {
      const total = (characterData.abilities[s.abl].mod || 0) + (s.prof ? characterData.profBonus : 0);
      return `<div class="row" data-skill="${i}" title="Click to roll">
        <div class="nameCell"><span class="semibold">${s.key}</span></div>
        <div><span class="chip" data-skill="${i}" data-act="ABL" title="Change ability">${s.abl}</span></div>
        <div class="mono" data-col="bonus">${fmtBonus(total)}</div>
        <div><span class="chip ${s.prof ? '' : 'meta'}" data-skill="${i}" data-act="PROF" title="Toggle proficiency">${s.prof ? 'Prof' : 'NoProf'}</span></div>
      </div>`;
    }).join('');
  }
  function renderFeatures(root){
    const list = root.getElementById('featureList')?.querySelector('.rows'); if (!list) return;
    const arr = characterData.features || [];
    list.innerHTML = arr.map((f, i) => featureRowHTML(f, i)).join('');
  }
  function renderMagic(root){
    const list = root.getElementById('magicList')?.querySelector('.rows'); if (!list) return;
    const arr = characterData.inventory?.magic || [];
    list.innerHTML = arr.map((it, i) => magicRowHTML(it, i)).join('');
  }

  // -------- Draggable host & persistence --------
  function restorePosition(host){
    const pos=GM_GetValue_silent('pos',null);
    if(pos?.left && pos?.top){ host.style.left=pos.left; host.style.top=pos.top; host.style.right='auto'; }
  }
  function makeDraggable(host, handle){
    let ix=0,iy=0,ox=0,oy=0,down=false;
    handle.addEventListener('mousedown', e=>{down=true; ix=e.clientX; iy=e.clientY; ox=host.offsetLeft; oy=host.offsetTop; e.preventDefault();});
    window.addEventListener('mousemove', e=>{ if(!down) return; const dx=e.clientX-ix, dy=e.clientY-iy; host.style.left=(ox+dx)+'px'; host.style.top=(oy+dy)+'px'; host.style.right='auto'; });
    window.addEventListener('mouseup', ()=>{ if(!down) return; down=false; GM_SetValue_silent('pos',{left:host.style.left, top:host.style.top}); });
  }

  // -------- Smite dialog --------
  function buildSmiteMsg({ useSpell, usePact, undead, prone, crit }){
    let divDice = 0; if (useSpell){ divDice = 2 + (undead ? 1 : 0); if (crit) divDice *= 2; }
    let eldDice = 0; if (usePact){ eldDice = 3; if (crit) eldDice *= 2; }
    let msg = `&{template:atkdmg} {{rname=Smite}} {{damage=1}}`;
    if (useSpell){ msg += ` {{dmg1flag=1}} {{dmg1=[[${divDice}d8]]}} {{dmg1type=Radiant}}`; }
    if (usePact){ msg += ` {{dmg2flag=1}} {{dmg2=[[${eldDice}d8]]}} {{dmg2type=Force}}`; }
    const notes = []; if (useSpell && undead) notes.push("Undead target"); if (usePact && prone) notes.push("Attempt Knock Prone"); if (crit) notes.push("Critical");
    if (notes.length) msg += ` {{range=${notes.join(" • ")}}}`;
    msg += ` {{charname=${characterData.name}}}`;
    return msg;
  }

  // -------- Wiring everything --------
  function wireInteractions(root, host){
    // Render all sections
    renderAbilities(root);
    renderAttacks(root);
    renderSkills(root);
    renderFeatures(root);
    renderMagic(root);
    renderSpellsTab(root);
    renderSlotsUI(root);

    // Dragging + position restore
    makeDraggable(host, root.getElementById('drag'));
    restorePosition(host);

    // Collapse/expand
    const bodyPane  = root.getElementById('bodyPane');
    const collapseAll = root.getElementById('collapseAll');
    const allChev   = root.getElementById('allChev');

    function setBodyExpanded(on){
      if (on){ bodyPane.style.maxHeight = bodyPane.scrollHeight + 'px'; allChev.classList.remove('rot'); }
      else   { bodyPane.style.maxHeight = bodyPane.scrollHeight + 'px'; requestAnimationFrame(()=> bodyPane.style.maxHeight = '0px'); allChev.classList.add('rot'); }
      GM_SetValue_silent('expanded', on ? 1 : 0);
    }
    const wasExpanded = GM_GetValue_silent('expanded', 1) === 1;
    if (wasExpanded){ requestAnimationFrame(()=> bodyPane.style.maxHeight = bodyPane.scrollHeight + 'px'); allChev.classList.remove('rot'); }
    else { bodyPane.style.maxHeight = '0px'; allChev.classList.add('rot'); }
    collapseAll.addEventListener('click', ()=> setBodyExpanded(!(parseFloat(bodyPane.style.maxHeight||'0') > 0)));
    root.getElementById('drag').addEventListener('dblclick',()=>collapseAll.click());
    new ResizeObserver(()=>{ if (GM_GetValue_silent('expanded',1)===1) bodyPane.style.maxHeight = bodyPane.scrollHeight + 'px'; }).observe(bodyPane);

    // Tabs (slide animation)
    const tabBar = root.getElementById('tabBar');
    const panels = Array.from(root.querySelectorAll('.tabPanel'));
    const tabs   = Array.from(tabBar.querySelectorAll('.tab'));
    const panelIdx = new Map(panels.map((p,i)=>[p.dataset.panel, i]));
    if (!panels.some(p => p.classList.contains('active'))) panels[0].classList.add('active');

    tabBar.addEventListener('click', (e)=>{
      const t = e.target.closest('.tab'); if (!t) return;
      const targetName = t.dataset.tab;
      const next = panels[panelIdx.get(targetName)];
      const cur  = panels.find(p => p.classList.contains('active'));
      if (next === cur) return;
      tabs.forEach(tb => tb.classList.toggle('active', tb === t));
      const curIdx = panels.indexOf(cur), nextIdx = panels.indexOf(next), dirLeft = nextIdx < curIdx;
      next.style.transform = `translateX(${dirLeft ? '-100%' : '100%'})`; next.style.opacity = '0'; next.classList.add('active'); void next.offsetWidth;
      cur.classList.remove('active'); cur.classList.add(dirLeft ? 'exit-right' : 'exit-left');
      next.style.transform = ''; next.style.opacity = '';
      cur.addEventListener('transitionend', (ev)=>{ if (ev.target===cur) cur.classList.remove('exit-left','exit-right'); }, { once:true });
    });

    // Quickbar
    root.getElementById('qbInitIcon')?.addEventListener('click', ()=>{
      const initMod = characterData.abilities.DEX?.mod ?? 0;
      sendToChat(`/roll 1d20 ${initMod>=0?`+${initMod}`:initMod} &{tracker}`);
    });
    root.getElementById('qbAttack')?.addEventListener('click', (e)=>{
      const a = characterData.attacks?.[0]; if (!a) return;
      const adv = e.ctrlKey ? 'always' : (e.shiftKey ? 'adv' : (e.altKey ? 'dis' : 'normal'));
      sendToChat(buildAtkdmgTemplate(a, { adv }));
    });

    // Global modifiers
    const gm = getGlobalMods();
    const selShroud  = root.getElementById('gmShroud');
    const selConvert = root.getElementById('gmConvert');
    const chkBless   = root.getElementById('gmBless');
    if (selShroud)  selShroud.value  = gm.shroud ?? 'off';
    if (selConvert) selConvert.value = gm.convert ?? 'off';
    if (chkBless)   chkBless.checked = !!gm.bless;
    selShroud?.addEventListener('change', ()=> setGlobalMods({ ...getGlobalMods(), shroud: selShroud.value }));
    selConvert?.addEventListener('change', ()=> setGlobalMods({ ...getGlobalMods(), convert: selConvert.value }));
    chkBless?.addEventListener('change', ()=> setGlobalMods({ ...getGlobalMods(), bless: chkBless.checked }));

    // Abilities roll buttons
    root.getElementById('stats').addEventListener('click', (e)=>{
      const btn = e.target.closest('.pillBtn'); if(!btn||!btn.dataset.abl) return;
      const abl = btn.dataset.abl, type = btn.dataset.type;
      if (type === 'save'){
        const mod = getSave(abl);
        sendToChat(buildSimpleRoll({ rname: `${abl} Save`, mod, charname: characterData.name }));
      } else {
        const mod = characterData.abilities[abl].mod;
        sendToChat(`/em ${characterData.name} rolls ${abl} Check\n/roll 1d20 ${fmtBonus(mod)}`);
      }
    });

    // Attacks list
    root.getElementById('attackList')?.addEventListener('click', (e)=>{
      const row=e.target.closest('.row[data-attack]'); if(!row) return;
      const i=+row.dataset.attack; const a=characterData.attacks[i];
      const advKey = (e.shiftKey?'adv':(e.altKey?'dis':'normal'));
      sendToChat(buildAtkdmgTemplate(a, { adv: advKey }));
    });

    // Skills list (chip toggles + roll)
    const skillRows = root.querySelector('#skillList .rows');
    if (skillRows) {
      const bonusOf = (sk) => (characterData.abilities[sk.abl].mod||0) + (sk.prof?characterData.profBonus:0);
      skillRows.addEventListener('click', (e)=>{
        const chip = e.target.closest('.chip[data-skill]');
        if (chip){
          const i=+chip.dataset.skill, sk=characterData.skills[i], row=chip.closest('.row[data-skill]'); if(!row) return;
          if (chip.dataset.act==='ABL'){ sk.abl = nextABL(sk.abl); row.querySelector('.chip[data-act="ABL"]').textContent = sk.abl; row.querySelector('[data-col="bonus"]').textContent = fmtBonus(bonusOf(sk)); e.stopPropagation(); return; }
          if (chip.dataset.act==='PROF'){ sk.prof=!sk.prof; const c=row.querySelector('.chip[data-act="PROF"]'); c.textContent=sk.prof?'Prof':'NoProf'; c.classList.toggle('meta',!sk.prof); row.querySelector('[data-col="bonus"]').textContent = fmtBonus(bonusOf(sk)); e.stopPropagation(); return; }
        }
        const row=e.target.closest('.row[data-skill]'); if(!row) return;
        const i=+row.dataset.skill, sk=characterData.skills[i];
        sendToChat(buildSimpleRoll({ rname: `${sk.key} (${sk.abl})`, mod: bonusOf(sk), charname: characterData.name }));
      });
    }

    // Spells: expand/cast; per‑level slot dots (header & group)
    const spellGroups = root.getElementById('spellGroups');
    spellGroups?.addEventListener('click', (e)=>{
      const dot = e.target.closest('.slotDot'); // header dots
      if (dot) {
        const kind = dot.dataset.kind, lvl = dot.dataset.lvl;
        if (dot.classList.contains('filled')) consumeSlot(kind, lvl); else rechargeSlot(kind, lvl);
        renderSpellsTab(root);
        return;
      }

      const row = e.target.closest('.spellRow'); if (!row) return;
      const name = row.dataset.spellName;
      const sp = (characterData.spells || []).find(s => s.name === name);
      const details = row.nextElementSibling;
      const clickedInteractive = e.target.closest('.slotDot, .compChip, .tagSq');

      if (!clickedInteractive) {
        const isOpen = row.classList.toggle('open');
        if (details && details.classList.contains('spellDetails')) {
          if (isOpen) details.style.maxHeight = details.scrollHeight + 'px';
          else { details.style.maxHeight = details.scrollHeight + 'px'; requestAnimationFrame(()=> details.style.maxHeight = '0px'); }
        }
      }

      if (sp) {
        const notes = [];
        if (sp.cast && sp.cast.kind && Number.isFinite(sp.cast.slotLevel)) {
          const ok = consumeSlot(sp.cast.kind, String(sp.cast.slotLevel));
          if (!ok) {
            const ord = (n)=>`${n}${n===1?'st':n===2?'nd':n===3?'rd':'th'}`;
            notes.push(`No ${ord(sp.cast.slotLevel)}‑level ${sp.cast.kind} slots`);
          }
          renderSpellsTab(root);
        }
        let msg = sp.macro || `/em casts ${sp.name}.`;
        if (notes.length) msg += ` {{range=${notes.join(" • ")}}}`;
        sendToChat(msg);
      }
    });

    // Static slots rows (top of Spells tab)
    root.getElementById('spellSlotsRow')?.addEventListener('click', (e)=>{
      const dot = e.target.closest('.slotDot'); if (!dot) return;
      const kind = dot.dataset.kind, lvl = dot.dataset.lvl;
      if (dot.classList.contains('filled')) consumeSlot(kind, lvl); else rechargeSlot(kind, lvl);
      renderSlotsUI(root);
    });
    root.getElementById('pactSlotsRow')?.addEventListener('click', (e)=>{
      const dot = e.target.closest('.slotDot'); if (!dot) return;
      const kind = dot.dataset.kind, lvl = dot.dataset.lvl;
      if (dot.classList.contains('filled')) consumeSlot(kind, lvl); else rechargeSlot(kind, lvl);
      renderSlotsUI(root);
    });

    // Features list (expand/use/spend/regen and smite launcher)
    const featureList = root.getElementById('featureList');
    function toggleFeatureDetails(root, i){
      const caret=root.getElementById(`caret_${i}`);
      const det=root.getElementById(`fdet_${i}`);
      if(!caret || !det) return;
      const opening = !caret.classList.contains('open');
      caret.classList.toggle('open', opening);
      if(opening){ det.classList.add('in'); det.style.maxHeight = det.scrollHeight + 'px'; }
      else { det.style.maxHeight = det.scrollHeight + 'px'; requestAnimationFrame(()=>{ det.classList.remove('in'); det.style.maxHeight = '0px'; }); }
    }
    featureList?.addEventListener('click', (e)=>{
      const caretBtn = e.target.closest('[data-caret]');
      const ctrl     = e.target.closest('.ctrlChip[data-feature]');
      if (caretBtn){ toggleFeatureDetails(root, +caretBtn.dataset.caret); return; }
      if (ctrl){
        const i = +ctrl.dataset.feature;
        const f = characterData.features[i];
        if (ctrl.dataset.use){ if (f.smiteLauncher){ openSmite(e); return; } sendToChat(`/em uses ${f.name}. ${f.text||""}`); return; }
        if (ctrl.dataset.chg){
          const delta = parseInt(ctrl.dataset.chg, 10);
          if (Number.isFinite(f.chargesMax)){
            const key   = `feat_${i}_charges`;
            const saved = GM_GetValue_silent(key, null);
            const cur   = Math.max(0, Math.min(f.chargesMax, saved ?? f.charges ?? f.chargesMax));
            const nxt   = Math.max(0, Math.min(f.chargesMax, cur + delta));
            GM_SetValue_silent(key, nxt);
            const cnt = root.getElementById(`featCnt_${i}`); if (cnt) cnt.textContent = `${nxt}/${f.chargesMax}`;
          }
          return;
        }
      }
      const row = e.target.closest('.row.featRow[data-feature]'); if (!row) return;
      const i = +row.dataset.feature; const f = characterData.features[i];
      if (f.smiteLauncher){ openSmite(e); return; }
      sendToChat(`/em uses ${f.name}. ${f.text||""}`);
    });

    // Inventory (magic) — small dots
    const magicList = root.getElementById('magicList');
    magicList?.addEventListener('click', (e)=>{
      const dot = e.target.closest('.chargeDot');
      if (dot){
        const i = +dot.dataset.magic;
        if (dot.classList.contains('filled')) consumeMagicCharge(i); else rechargeMagicCharge(i);
        rerenderMagicRow(root, i);
        return;
      }
      const row=e.target.closest('.row[data-magic]'); if(!row) return;
      const i=+row.dataset.magic; const it=characterData.inventory.magic[i];
      sendToChat(`/em uses ${it.name}.`);
    });

    // Smite menu
    function openSmite(ev){
      const mask = root.getElementById('smiteMask');
      const menu = root.getElementById('smiteMenu');
      if (!mask || !menu) return;
      let x = (ev?.clientX ?? (window.innerWidth/2));
      let y = (ev?.clientY ?? (window.innerHeight/2));
      mask.classList.add('show');
      menu.style.visibility = 'hidden';
      menu.style.left = x + 'px'; menu.style.top  = y + 'px';
      requestAnimationFrame(()=>{
        const r = menu.getBoundingClientRect(), pad = 8;
        if (x + r.width > window.innerWidth - pad)  x = Math.max(pad, x - r.width);
        if (y + r.height > window.innerHeight - pad) y = Math.max(pad, y - r.height);
        menu.style.left = x + 'px'; menu.style.top  = y + 'px'; menu.style.visibility = 'visible';
      });
    }
    function closeSmite(){ root.getElementById('smiteMask')?.classList.remove('show'); }
    root.getElementById('qbSmite')?.addEventListener('click', (e)=>openSmite(e));
    root.getElementById('smiteCancel')?.addEventListener('click', closeSmite);
    root.getElementById('smiteMask')?.addEventListener('click', (e)=>{ if (e.target === root.getElementById('smiteMask')) closeSmite(); });

    const optSpell = root.getElementById('optSpell');
    const optPact  = root.getElementById('optPact');
    const optUndead= root.getElementById('optUndead');
    const optProne = root.getElementById('optProne');
    const optCrit  = root.getElementById('optCrit');
    function updateOptionVisibility(){ if(optUndead) optUndead.disabled = !optSpell?.checked; if(optProne) optProne.disabled = !optPact?.checked; }
    optSpell?.addEventListener('change', updateOptionVisibility);
    optPact ?.addEventListener('change', updateOptionVisibility);
    updateOptionVisibility();

    root.getElementById('smiteRoll')?.addEventListener('click', ()=>{
      const useSpell = !!optSpell?.checked, usePact  = !!optPact?.checked;
      const undead   = !!optUndead?.checked, prone    = !!optProne?.checked;
      const crit     = !!optCrit?.checked;
      if (!useSpell && !usePact){ if (optSpell) optSpell.checked = true; updateOptionVisibility(); return; }
      const notes = [];
      if (useSpell && !consumeSlot('spell','1')) notes.push('No 1st‑level spell slots');
      if (usePact  && !consumeSlot('pact','2'))  notes.push('No 2nd‑level pact slots');
      renderSlotsUI(root);
      let msg = buildSmiteMsg({ useSpell, usePact, undead, prone, crit });
      if (notes.length) msg += ` {{range=${notes.join(" • ")}}}`;
      sendToChat(msg);
      closeSmite();
    });

    // Smart hover suppression for interactive children
    function isInteractiveChild(el){ return !!el.closest('.chip, .ctrlChip, .chargeDot, [data-caret]'); }
    function setChildHoverState(target, on){ const row = target.closest('.row'); if(row) row.classList.toggle('child-hover', !!on); }
    root.addEventListener('mouseover', (e)=>{ if (isInteractiveChild(e.target)) setChildHoverState(e.target, true); });
    root.addEventListener('mouseout',  (e)=>{ if (isInteractiveChild(e.target)) setChildHoverState(e.target, false); });
  }

  // -------- Public API --------
  window.Overlay = {
    init(root, host){
      // initial header values
      root.getElementById('ov-name').textContent  = characterData?.name ?? '—';
      root.getElementById('ov-ac'  ).textContent  = characterData?.ac ?? '—';
      root.getElementById('ov-pp'  ).textContent  = characterData?.passivePerception ?? '—';
      root.getElementById('ov-speed').textContent = characterData?.speed ?? '—';
      root.getElementById('ov-hp'  ).textContent  = characterData?.hp?.current ?? '—';
      root.getElementById('ov-hpmax').textContent = characterData?.hp?.max ?? '—';
      wireInteractions(root, host);
    }
  };
})();
