// Preview uses the same Markdown renderer as publication and an opaque-origin
// frame. Content never becomes executable markup in the editor document.
(function () {
  "use strict";
  var toggle = document.getElementById("toggle-preview");
  var preview = document.getElementById("preview");
  var body = document.getElementById("post-body");
  if (!toggle || !preview || !body) return;
  var timer, sequence = 0;
  async function render() {
    var n = ++sequence;
    try {
      var form = body.form;
      var data = new URLSearchParams();
      data.set("body_md", body.value);
      data.set("csrf_token", form.elements.csrf_token.value);
      var r = await fetch(document.body.dataset.adminBase + "/preview", { method: "POST", body: data, redirect: "error" });
      if (!r.ok) throw new Error("预览失败，请检查登录状态与编辑权限");
      var html = await r.text();
      if (n !== sequence) return;
      var frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "");
      frame.title = "Markdown 预览";
      frame.style.cssText = "width:100%;min-height:320px;border:0";
      frame.srcdoc = '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;"><style>body{font:16px/1.7 system-ui;overflow-wrap:anywhere}pre{white-space:pre-wrap}</style>' + html;
      preview.replaceChildren(frame);
    } catch (e) { preview.textContent = e.message; }
  }
  toggle.addEventListener("click", function () {
    preview.style.display = preview.style.display === "none" ? "block" : "none";
    toggle.textContent = preview.style.display === "none" ? "预览" : "隐藏预览";
    if (preview.style.display !== "none") render();
  });
  body.addEventListener("input", function () {
    clearTimeout(timer);
    if (preview.style.display !== "none") timer = setTimeout(render, 350);
  });
})();
