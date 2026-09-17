(function () {
  "use strict";
  document.querySelectorAll("form[data-confirm]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      if (!window.confirm(form.dataset.confirm)) e.preventDefault();
    });
  });
  if (document.body.dataset.ops !== "true") return;
  var base = "/ojbk/opq_aaa";
  var actor = null;
  var notice = document.createElement("div");
  notice.setAttribute("role", "status");
  document.querySelector(".admin-main").prepend(notice);
  function message(text, login) {
    notice.replaceChildren(document.createTextNode(text));
    if (login) {
      var a = document.createElement("a");
      a.href = base + "/login"; a.target = "_blank"; a.rel = "noopener";
      a.textContent = " 在新标签页重新登录"; notice.appendChild(a);
    }
  }
  async function session() {
    var r = await fetch(base + "/api/session", { cache: "no-store", redirect: "error" });
    if (!r.ok) throw new Error("登录已失效。当前内容保留在本页，重新登录后再保存。");
    var s = await r.json();
    if (actor !== null && actor !== s.account.id) throw new Error("登录账号已变更，请保留草稿后关闭当前页面。");
    actor = s.account.id;
    var caps = (s.grants || []).map(function (g) { return g.capability; });
    if (!s.account.superuser && !(caps.includes("blog.read") && caps.includes("blog.edit"))) throw new Error("编辑权限已撤销。当前内容仍保留在本页。");
    document.querySelectorAll('[name="csrf_token"]').forEach(function (input) { input.value = s.csrf; });
    if (s.expiresAt * 1000 - Date.now() < 600000) message("登录将在 10 分钟内过期，请及时保存。");
    return s;
  }
  var ready = session();
  ready.catch(function (e) { message(e.message, true); });
  setInterval(function () { session().catch(function (e) { message(e.message, true); }); }, 60000);
  document.addEventListener("submit", async function (e) {
    var form = e.target;
    if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== "post" || e.defaultPrevented) return;
    e.preventDefault();
    if (form.dataset.saving === "true") return;
    form.dataset.saving = "true";
    try {
      await ready; await session();
      var r = await fetch(form.action, { method: "POST", body: new URLSearchParams(new FormData(form)), headers: {"X-Ops-Form":"1"}, redirect: "follow" });
      if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "登录或权限已变化，内容保留在本页。" : "保存未成功，请检查数据后重试。");
      if (!r.redirected || !r.url.startsWith(location.origin + document.body.dataset.adminBase + "/")) throw new Error("保存结果无法确认，请在新标签核对文章列表，避免重复提交。");
      window.dispatchEvent(new Event("admin-saved"));
      location.assign(r.url);
    } catch (err) {
      window.dispatchEvent(new Event("admin-save-failed"));
      message(err instanceof TypeError ? "连接中断，保存结果未知。内容保留在本页，请在新标签核对文章列表后再操作。" : err.message, true);
      // Retry starts with a fresh session, including after expired login.
      ready = Promise.resolve();
    } finally { form.dataset.saving = "false"; }
  });
})();
