let repeatMode = "none"; // "none" | "once" | "loop"

/**
 * Updates the global repeat state and synchronizes the button UI colors.
 * @param {'none' | 'once' | 'loop'} newState The new repeat mode to set.
 */
function updateRepeatState(newState) {
  repeatMode = newState;
  
  const repeatOnceBtn = document.querySelector("#yt-repeat-once");
  const repeatToggleBtn = document.querySelector("#yt-repeat-toggle");

  if (repeatOnceBtn) {
    repeatOnceBtn.style.color = (repeatMode === "once") ? "yellow" : "";
  }
  if (repeatToggleBtn) {
    repeatToggleBtn.style.color = (repeatMode === "loop") ? "yellow" : "";
  }
}

/**
 * Finds the YouTube player controls and injects the repeat buttons.
 */
function addRepeatButtons() {
  const controls = document.querySelector(".ytp-right-controls");
  if (!controls) return;

  // Prevent duplicates (unchanged)
  if (document.querySelector("#yt-repeat-once") || document.querySelector("#yt-repeat-toggle")) return;

  const repeatToggleBtn = document.createElement("button");
  repeatToggleBtn.id = "yt-repeat-toggle";
  repeatToggleBtn.className = "ytp-button ytp-size-button";
  repeatToggleBtn.title = "Toggle Repeat (r)"; 
  repeatToggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="75%" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-repeat-icon lucide-repeat"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>`;

  const repeatOnceBtn = document.createElement("button");
  repeatOnceBtn.id = "yt-repeat-once";
  repeatOnceBtn.className = "ytp-button ytp-size-button";
  repeatOnceBtn.title = "Repeat Once";
  repeatOnceBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="75%" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-repeat1-icon lucide-repeat-1"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><path d="M11 10h1v4"/></svg>`;

  const settingsBtn = controls.querySelector(".ytp-settings-button");
  if (settingsBtn) {
    controls.insertBefore(repeatOnceBtn, settingsBtn);
    controls.insertBefore(repeatToggleBtn, settingsBtn);
  } else {
    controls.appendChild(repeatOnceBtn);
    controls.appendChild(repeatToggleBtn);
  }


  updateRepeatState(repeatMode);

  repeatOnceBtn.addEventListener("click", () => {
    const newState = (repeatMode === "once") ? "none" : "once";
    updateRepeatState(newState);
  });

  repeatToggleBtn.addEventListener("click", () => {
    const newState = (repeatMode === "loop") ? "none" : "loop";
    updateRepeatState(newState);
  });

  const video = document.querySelector("video");
  if (!video) return;

  video.addEventListener("ended", () => {
    if (repeatMode === "once") {
      video.currentTime = 0;
      video.play();
      updateRepeatState("none"); 
    } else if (repeatMode === "loop") {
      video.currentTime = 0;
      video.play();
    }
  });
}

// Watches for SPA navigation changes.
const observer = new MutationObserver(() => {
  addRepeatButtons();
});
observer.observe(document.body, { childList: true, subtree: true });

addRepeatButtons();


