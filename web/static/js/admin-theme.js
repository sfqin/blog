
(function () {
  "use strict";
  var sel   = document.getElementById("theme-select");
  var frame = document.getElementById("tp-frame");
  var stage = document.getElementById("tp-stage");
  var url   = document.getElementById("tp-url");
  var open  = document.getElementById("tp-open");
  if (!sel || !frame || !stage) return;

  // Render the preview at a logical desktop viewport, then scale it down to fit
  // the admin panel width so visitors' real (desktop-first) layout is faithful.
  var W = 1280, H = 860;
  function fit() {
    var scale = stage.clientWidth / W;
    frame.style.width = W + "px";
    frame.style.height = H + "px";
    frame.style.transform = "scale(" + scale + ")";
    stage.style.height = (H * scale) + "px";
  }

  // Swap the previewed theme without saving. The home handler honors
  // ?preview_theme=X for this render only (nothing is written to the DB).
  function refresh() {
    var t = sel.value || "F";
    var href = "/?preview_theme=" + encodeURIComponent(t);
    frame.src = href;
    if (url) url.textContent = href;
    if (open) open.setAttribute("href", href);
  }

  sel.addEventListener("change", refresh);
  window.addEventListener("resize", fit);
  frame.addEventListener("load", fit);
  fit();
})();
