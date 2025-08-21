// ==UserScript== for Tampermonkey
// @name         Roll20 Overlay (Loader)
// @namespace    https://yourdomain.example
// @version      1.0.0
// @description  Loads a separated HTML/CSS/JS overlay in Roll20
// @match        https://app.roll20.net/*
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle

// --- external JS ---
/* Host overlay.js somewhere stable (GitHub Pages/Netlify/Cloudflare Pages) */
// @require      https://raw.githubusercontent.com/Lebowskigrande/roll20-profiles/main/overlay.js

// --- external resources (fetched by TM) ---
// @resource     overlayHTML https://raw.githubusercontent.com/Lebowskigrande/roll20-profiles/main/overlay.html
// @resource     overlayCSS  https://raw.githubusercontent.com/Lebowskigrande/roll20-profiles/main/style.css
// @resource     characterJSON https://raw.githubusercontent.com/Lebowskigrande/roll20-profiles/main/ecthelion_profile.json
// ==/UserScript==

(function () {
  'use strict';

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  async function waitForEditor() {
    for (let i = 0; i < 120; i++) {                // up to ~2 minutes
      const ok = document.querySelector('#playerzone,#editor-wrapper,#floatingtoolbar');
      if (ok) return true;
      await sleep(1000);
    }
    return false;
  }

  function createHostWithShadow() {
    const host = document.createElement('div');
    host.id = 'r20-overlay-host';
    host.style.position = 'fixed';
    host.style.top = '96px';
    host.style.right = '24px';
    host.style.zIndex = '999999';
    document.body.appendChild(host);
    return { host, root: host.attachShadow({ mode: 'open' }) };
  }

  async function boot() {
    if (!(await waitForEditor())) return;

    const html = GM_getResourceText('overlayHTML');
    const css  = GM_getResourceText('overlayCSS');
    let characterData = null;
    try { characterData = JSON.parse(GM_getResourceText('characterJSON')); } catch {}
    if (!html || !css || !window.Overlay || !characterData) {
      console.error('[Overlay Loader] Missing HTML/CSS/Overlay.js');
      return;
    }

    const { host, root } = createHostWithShadow();
    window.characterData = characterData; // make it visible to overlay.js

    // inject CSS + HTML into the shadow root
    const style = document.createElement('style');
    style.textContent = css;
    root.appendChild(style);

    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    root.appendChild(wrap);

    // hand off to your logic (overlay.js)
    window.Overlay.init(root, host);
  }

  boot();
})();
