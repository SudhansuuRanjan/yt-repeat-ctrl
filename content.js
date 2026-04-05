// ============================================================
// YouTube Repeat Controls — Content Script (v2.0)
// Features: Repeat Once/Loop, A-B Loop, Keyboard Shortcuts,
//           Repeat Count Badge, Persistent State, Tooltips,
//           Sleep Timer
// ============================================================

(() => {
  "use strict";

  // ──────────────────── State ────────────────────
  let repeatMode = "none"; // "none" | "once" | "loop"
  let repeatCount = 0;
  let abLoop = { a: null, b: null };
  let sleepConfig = { byRepeats: 0, byMinutes: 0, active: false };
  let sleepTimeout = null;
  let currentVideoId = null;
  let videoEndedHandlerAttached = false;
  let timeUpdateHandlerAttached = false;
  let keyboardHandlerAttached = false;
  let isSeeking = false; // guard to prevent A-B loop re-triggering during seek

  // ──────────────────── Helpers ────────────────────
  function getVideoId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("v");
  }

  function formatTime(seconds) {
    if (seconds == null || isNaN(seconds)) return "--:--";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function showNotification(msg) {
    const existing = document.querySelector(".yt-rc-notification");
    if (existing) existing.remove();
    const el = document.createElement("div");
    el.className = "yt-rc-notification";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  // ──────────────────── Persistence ────────────────────
  const extAPI = typeof browser !== "undefined" ? browser : chrome;

  function saveState() {
    const vid = getVideoId();
    if (!vid) return;
    const key = `yt-rc-${vid}`;
    const data = { repeatMode, abLoop, sleepConfig };
    try {
      extAPI.storage.local.set({ [key]: data });
    } catch (_) { /* extension context may be invalidated */ }
  }

  function loadState(callback) {
    const vid = getVideoId();
    if (!vid) { callback(); return; }
    const key = `yt-rc-${vid}`;
    try {
      extAPI.storage.local.get([key], (result) => {
        const data = result[key];
        if (data) {
          repeatMode = data.repeatMode || "none";
          abLoop = data.abLoop || { a: null, b: null };
          sleepConfig = data.sleepConfig || { byRepeats: 0, byMinutes: 0, active: false };
        } else {
          repeatMode = "none";
          abLoop = { a: null, b: null };
          sleepConfig = { byRepeats: 0, byMinutes: 0, active: false };
        }
        repeatCount = 0;
        callback();
      });
    } catch (_) {
      callback();
    }
  }

  // ──────────────────── UI Updates ────────────────────
  function updateRepeatUI() {
    const onceBtn = document.querySelector("#yt-repeat-once");
    const loopBtn = document.querySelector("#yt-repeat-toggle");
    if (onceBtn) onceBtn.style.color = repeatMode === "once" ? "#3ea6ff" : "";
    if (loopBtn) loopBtn.style.color = repeatMode === "loop" ? "#3ea6ff" : "";
    updateBadge();
    saveState();
  }

  function updateBadge() {
    const loopBtn = document.querySelector("#yt-repeat-toggle");
    if (!loopBtn) return;
    let badge = loopBtn.querySelector(".yt-repeat-badge");
    if (repeatCount > 0 && repeatMode !== "none") {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "yt-repeat-badge";
        loopBtn.appendChild(badge);
      }
      badge.textContent = repeatCount;
    } else if (badge) {
      badge.remove();
    }
  }

  function updateABButtons() {
    const aBtn = document.querySelector("#yt-ab-a");
    const bBtn = document.querySelector("#yt-ab-b");
    if (aBtn) {
      const label = aBtn.querySelector(".yt-ab-label");
      if (abLoop.a != null) {
        aBtn.classList.add("yt-ab-active");
        if (label) label.textContent = `A ${formatTime(abLoop.a)}`;
      } else {
        aBtn.classList.remove("yt-ab-active");
        if (label) label.textContent = "A";
      }
    }
    if (bBtn) {
      const label = bBtn.querySelector(".yt-ab-label");
      if (abLoop.b != null) {
        bBtn.classList.add("yt-ab-active");
        if (label) label.textContent = `B ${formatTime(abLoop.b)}`;
      } else {
        bBtn.classList.remove("yt-ab-active");
        if (label) label.textContent = "B";
      }
    }
    saveState();
  }

  // ──────────────────── Tooltip Helper ────────────────────
  function attachTooltip(button, text) {
    button.addEventListener("mouseenter", () => {
      // Remove any existing tooltip
      const old = button.querySelector(".yt-rc-tooltip");
      if (old) old.remove();
      const tip = document.createElement("div");
      tip.className = "yt-rc-tooltip";
      tip.textContent = text;
      button.appendChild(tip);
    });
    button.addEventListener("mouseleave", () => {
      const tip = button.querySelector(".yt-rc-tooltip");
      if (tip) tip.remove();
    });
  }

  // ──────────────────── Sleep Timer ────────────────────
  function startSleepTimer() {
    clearSleepTimer();
    sleepConfig.active = true;

    const timerBtn = document.querySelector("#yt-sleep-timer-btn");
    if (timerBtn) timerBtn.classList.add("yt-sleep-active");

    if (sleepConfig.byMinutes > 0) {
      sleepTimeout = setTimeout(() => {
        triggerSleepStop("Sleep timer: time limit reached");
      }, sleepConfig.byMinutes * 60 * 1000);
    }
    saveState();
    showNotification("💤 Sleep timer started");
  }

  function clearSleepTimer() {
    sleepConfig.active = false;
    if (sleepTimeout) {
      clearTimeout(sleepTimeout);
      sleepTimeout = null;
    }
    const timerBtn = document.querySelector("#yt-sleep-timer-btn");
    if (timerBtn) timerBtn.classList.remove("yt-sleep-active");
    saveState();
  }

  function triggerSleepStop(msg) {
    const video = document.querySelector("video");
    if (video) video.pause();
    clearSleepTimer();
    showNotification(msg || "💤 Sleep timer stopped playback");
  }

  function checkSleepByRepeats() {
    if (!sleepConfig.active || sleepConfig.byRepeats <= 0) return false;
    if (repeatCount >= sleepConfig.byRepeats) {
      triggerSleepStop(`💤 Stopped after ${repeatCount} repeats`);
      return true; // signal that we stopped — caller should NOT call play()
    }
    return false;
  }

  function toggleSleepPanel() {
    const existing = document.querySelector(".yt-sleep-panel");
    if (existing) { existing.remove(); return; }

    const timerBtn = document.querySelector("#yt-sleep-timer-btn");
    if (!timerBtn) return;

    const panel = document.createElement("div");
    panel.className = "yt-sleep-panel";
    panel.innerHTML = `
      <div class="yt-sleep-panel-title">💤 Sleep Timer</div>
      <div class="yt-sleep-panel-row">
        <label>Stop after repeats</label>
        <input type="number" id="yt-sleep-repeats" min="0" max="999" value="${sleepConfig.byRepeats || ""}" placeholder="0">
      </div>
      <div class="yt-sleep-panel-row">
        <label>Stop after minutes</label>
        <input type="number" id="yt-sleep-minutes" min="0" max="999" value="${sleepConfig.byMinutes || ""}" placeholder="0">
      </div>
      <div class="yt-sleep-panel-actions">
        <button class="yt-sleep-btn yt-sleep-btn-start" id="yt-sleep-start">Start</button>
        <button class="yt-sleep-btn yt-sleep-btn-cancel" id="yt-sleep-cancel">Cancel</button>
      </div>
    `;

    // Append to body so YouTube's overflow:hidden on the button doesn't clip the panel
    document.body.appendChild(panel);

    // Position above the button using getBoundingClientRect
    const rect = timerBtn.getBoundingClientRect();
    panel.style.position = "fixed";
    panel.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    panel.style.right = `${window.innerWidth - rect.right}px`;
    panel.style.left = "auto";
    panel.style.top = "auto";

    // Stop propagation so clicks inside the panel don't close it
    panel.addEventListener("click", (e) => e.stopPropagation());

    panel.querySelector("#yt-sleep-start").addEventListener("click", () => {
      const reps = parseInt(panel.querySelector("#yt-sleep-repeats").value) || 0;
      const mins = parseInt(panel.querySelector("#yt-sleep-minutes").value) || 0;
      sleepConfig.byRepeats = reps;
      sleepConfig.byMinutes = mins;
      if (reps > 0 || mins > 0) {
        startSleepTimer();
      }
      panel.remove();
    });

    panel.querySelector("#yt-sleep-cancel").addEventListener("click", () => {
      clearSleepTimer();
      panel.remove();
    });

    // Close panel when clicking outside
    setTimeout(() => {
      const closeHandler = (e) => {
        if (!panel.contains(e.target) && e.target !== timerBtn) {
          panel.remove();
          document.removeEventListener("click", closeHandler);
        }
      };
      document.addEventListener("click", closeHandler);
    }, 100);
  }

  // ──────────────────── Video Event Handlers ────────────────────
  function onVideoEnded() {
    if (repeatMode === "once") {
      const video = document.querySelector("video");
      if (video) { video.currentTime = 0; video.play(); }
      repeatCount++;
      updateRepeatUI();
      checkSleepByRepeats();
      // After "once", revert to none
      repeatMode = "none";
      updateRepeatUI();
    } else if (repeatMode === "loop") {
      const video = document.querySelector("video");
      if (video) { video.currentTime = 0; video.play(); }
      repeatCount++;
      updateRepeatUI();
      checkSleepByRepeats();
    }
  }

  function onTimeUpdate() {
    if (isSeeking) return; // prevent re-entrancy during seek
    if (abLoop.a != null && abLoop.b != null) {
      const video = document.querySelector("video");
      if (!video) return;
      // Use a small 0.2s tolerance so we catch it before the video ends
      if (video.currentTime >= abLoop.b - 0.2) {
        isSeeking = true;
        video.currentTime = abLoop.a;
        const onSeeked = () => {
          isSeeking = false;
          video.removeEventListener("seeked", onSeeked);
          repeatCount++;
          updateBadge();
          const stopped = checkSleepByRepeats(); // returns true if it paused the video
          if (!stopped) {
            video.play();
          }
        };
        video.addEventListener("seeked", onSeeked);
      }
    }
  }

  // ──────────────────── Keyboard Shortcuts ────────────────────
  function onKeyDown(e) {
    // Don't trigger when typing in inputs
    const tag = e.target.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;

    const video = document.querySelector("video");

    switch (e.key.toLowerCase()) {
      case "r":
        e.preventDefault();
        if (repeatMode === "none") repeatMode = "loop";
        else if (repeatMode === "loop") repeatMode = "once";
        else repeatMode = "none";
        repeatCount = 0;
        updateRepeatUI();
        showNotification(
          repeatMode === "none" ? "Repeat off" :
          repeatMode === "loop" ? "🔁 Loop on" : "🔂 Repeat once"
        );
        break;

      case "a":
        if (!video) return;
        e.preventDefault();
        if (abLoop.a != null) {
          abLoop.a = null;
          showNotification("A point cleared");
        } else {
          abLoop.a = video.currentTime;
          showNotification(`A set at ${formatTime(abLoop.a)}`);
        }
        updateABButtons();
        break;

      case "b":
        if (!video) return;
        e.preventDefault();
        if (abLoop.b != null) {
          abLoop.b = null;
          showNotification("B point cleared");
        } else {
          abLoop.b = video.currentTime;
          showNotification(`B set at ${formatTime(abLoop.b)}`);
        }
        updateABButtons();
        break;
    }
  }

  // ──────────────────── Button Creation ────────────────────
  function createButton(id, title, tooltipText, svgHTML) {
    const btn = document.createElement("button");
    btn.id = id;
    btn.className = "ytp-button ytp-size-button";
    btn.title = "";
    btn.setAttribute("aria-label", title);
    btn.innerHTML = svgHTML;
    attachTooltip(btn, tooltipText);
    return btn;
  }

  // ──────────────────── Main Injection ────────────────────
  function addControls() {
    const settingsBtn = document.querySelector(".ytp-settings-button");
    if (!settingsBtn) return;
    const controls = settingsBtn.parentElement;
    if (!controls) return;

    // Prevent duplicates
    if (document.querySelector("#yt-repeat-toggle")) return;

    // --- Repeat Once Button ---
    const repeatOnceBtn = createButton(
      "yt-repeat-once", "Repeat Once", "Repeat Once",
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><path d="M11 10h1v4"/></svg>`
    );

    // --- Repeat Loop Button ---
    const repeatLoopBtn = createButton(
      "yt-repeat-toggle", "Loop (r)", "Loop (r)",
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>`
    );

    // --- A-B Loop Buttons ---
    const abABtn = createButton(
      "yt-ab-a", "Set A Point (a)", "Set A Point (a)",
      `<span class="yt-ab-label">A</span>`
    );

    const abBBtn = createButton(
      "yt-ab-b", "Set B Point (b)", "Set B Point (b)",
      `<span class="yt-ab-label">B</span>`
    );

    // --- Sleep Timer Button ---
    const sleepBtn = createButton(
      "yt-sleep-timer-btn", "Sleep Timer", "Sleep Timer",
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
    );

    // Insert buttons before settings (order: repeatOnce, loop, B, A, sleep, settings)
    controls.insertBefore(sleepBtn, settingsBtn);
    controls.insertBefore(abABtn, settingsBtn);
    controls.insertBefore(abBBtn, settingsBtn);
    controls.insertBefore(repeatLoopBtn, settingsBtn);
    controls.insertBefore(repeatOnceBtn, settingsBtn);

    // --- Click Handlers ---
    repeatOnceBtn.addEventListener("click", () => {
      repeatMode = repeatMode === "once" ? "none" : "once";
      repeatCount = 0;
      updateRepeatUI();
    });

    repeatLoopBtn.addEventListener("click", () => {
      repeatMode = repeatMode === "loop" ? "none" : "loop";
      repeatCount = 0;
      updateRepeatUI();
    });

    abABtn.addEventListener("click", () => {
      const video = document.querySelector("video");
      if (!video) return;
      if (abLoop.a != null) {
        abLoop.a = null;
        showNotification("A point cleared");
      } else {
        abLoop.a = video.currentTime;
        showNotification(`A set at ${formatTime(abLoop.a)}`);
      }
      updateABButtons();
    });

    abBBtn.addEventListener("click", () => {
      const video = document.querySelector("video");
      if (!video) return;
      if (abLoop.b != null) {
        abLoop.b = null;
        showNotification("B point cleared");
      } else {
        abLoop.b = video.currentTime;
        showNotification(`B set at ${formatTime(abLoop.b)}`);
      }
      updateABButtons();
    });

    sleepBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSleepPanel();
    });

    // Apply restored state to UI
    updateRepeatUI();
    updateABButtons();
    if (sleepConfig.active) {
      sleepBtn.classList.add("yt-sleep-active");
    }

    attachVideoListeners();

    // --- Keyboard shortcut ---
    if (!keyboardHandlerAttached) {
      document.addEventListener("keydown", onKeyDown);
      keyboardHandlerAttached = true;
    }
  }

  // ──────────────────── Attach Video Listeners (called independently) ────────────────────
  function attachVideoListeners() {
    const video = document.querySelector("video");
    if (!video) return;
    if (!videoEndedHandlerAttached) {
      video.addEventListener("ended", onVideoEnded);
      videoEndedHandlerAttached = true;
    }
    if (!timeUpdateHandlerAttached) {
      video.addEventListener("timeupdate", onTimeUpdate);
      timeUpdateHandlerAttached = true;
    }
  }

  // ──────────────────── SPA Navigation Handler ────────────────────
  function onNavigate() {
    const newVideoId = getVideoId();
    if (newVideoId && newVideoId !== currentVideoId) {
      currentVideoId = newVideoId;
      videoEndedHandlerAttached = false;
      timeUpdateHandlerAttached = false;
      clearSleepTimer();

      // Remove old buttons so they get re-injected with fresh state
      ["#yt-repeat-once", "#yt-repeat-toggle", "#yt-ab-a", "#yt-ab-b", "#yt-sleep-timer-btn"]
        .forEach((sel) => { const el = document.querySelector(sel); if (el) el.remove(); });

      loadState(() => {
        addControls();
      });
    }
  }

  // ──────────────────── Bootstrap ────────────────────
  function init() {
    currentVideoId = getVideoId();
    loadState(() => {
      addControls();
    });

    // YouTube is an SPA — listen for navigation events
    document.addEventListener("yt-navigate-finish", onNavigate);

    // Fallback: periodically check if buttons need re-injection
    // Also always try to attach video listeners in case the video element
    // wasn't ready when addControls() first ran (e.g. after page reload)
    setInterval(() => {
      if (!document.querySelector("#yt-repeat-toggle")) {
        addControls();
      } else {
        // Buttons exist but listeners may not be attached yet (video lazy-loaded)
        attachVideoListeners();
      }
    }, 1000);
  }

  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();