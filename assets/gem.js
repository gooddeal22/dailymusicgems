// Click-to-load music players. The page ships a plain "Play" button; the real
// Spotify / YouTube / SoundCloud iframe is only created when a visitor presses
// it, so no third-party player (or its cookies) loads on page view.
document.addEventListener("click", function (e) {
  var btn = e.target && e.target.closest ? e.target.closest(".gem-play") : null;
  if (!btn) return;
  var slot = btn.parentNode;
  var frame = document.createElement("iframe");
  frame.className = "gem-frame";
  frame.src = btn.getAttribute("data-src");
  frame.setAttribute("width", "100%");
  frame.setAttribute("height", btn.getAttribute("data-height") || "152");
  frame.setAttribute("allow", btn.getAttribute("data-allow") || "encrypted-media");
  frame.setAttribute("title", btn.getAttribute("aria-label") || "Music player");
  frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  frame.setAttribute("allowfullscreen", "");
  frame.style.border = "0";
  while (slot.firstChild) slot.removeChild(slot.firstChild);
  slot.appendChild(frame);
});
