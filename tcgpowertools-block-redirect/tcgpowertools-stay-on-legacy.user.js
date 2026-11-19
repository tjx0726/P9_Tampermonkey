// ==UserScript==
// @name         TCG PowerTools - Stay on Legacy App
// @namespace    local.tcgpowertools
// @version      1.0.3
// @description  Prevent the legacy app from redirecting this tab to the new app's login redirect.
// @match        https://app.tcgpowertools.com/*
// @run-at       document-start
// @grant        none
// @sandbox      raw
// @noframes
// @homepageURL  https://github.com/tjx0726/P9_Tampermonkey/tree/main/tcgpowertools-block-redirect
// @updateURL    https://raw.githubusercontent.com/tjx0726/P9_Tampermonkey/main/tcgpowertools-block-redirect/tcgpowertools-stay-on-legacy.user.js
// @downloadURL  https://raw.githubusercontent.com/tjx0726/P9_Tampermonkey/main/tcgpowertools-block-redirect/tcgpowertools-stay-on-legacy.user.js
// ==/UserScript==

(() => {
  'use strict';

  if (!window.navigation?.addEventListener) {
    console.error('[TCG PowerTools] Redirect blocker unavailable: Navigation API not supported.');
    return;
  }

  window.navigation.addEventListener('navigate', (event) => {
    // P9 TCGPowerTools now owns this feature and its shared preferences.
    // Keep this old update URL working without adding a second blocker.
    if (window.P9TCGPowerTools) return;
    const destination = new URL(event.destination.url);

    if (
      destination.origin !== 'https://new.tcgpowertools.com' ||
      !/^\/login-redirect\/?$/.test(destination.pathname)
    ) {
      return;
    }

    if (!event.cancelable) {
      console.warn('[TCG PowerTools] Unable to block a non-cancelable redirect to the new app.');
      return;
    }

    event.preventDefault();
    console.info('[TCG PowerTools] Blocked automatic redirect to the new app.');
  });

  console.info('[TCG PowerTools] Legacy app redirect blocker active.');
})();
