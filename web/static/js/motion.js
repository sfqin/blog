// motion.js — shared motion primitives for the public site (window.Motion).
//
// Every animated module reads capability flags from here instead of probing
// media queries itself, shares one IntersectionObserver per option set, and
// hangs its per-frame work on one rAF loop that pauses while the tab is
// hidden. The globe keeps its own loop. No dependencies.
(function () {
  "use strict";

  var mqReduce = matchMedia("(prefers-reduced-motion: reduce)");
  var mqTouch = matchMedia("(hover: none), (pointer: coarse)");
  var changeFns = [];

  var Motion = {
    reduced: mqReduce.matches,
    touch: mqTouch.matches,
    onChange: function (fn) { changeFns.push(fn); },
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    easeInOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    easeOut: function (t) { return 1 - Math.pow(1 - t, 3); }
  };

  function listen(mq, fn) {
    if (mq.addEventListener) mq.addEventListener("change", fn);
    else if (mq.addListener) mq.addListener(fn);
  }
  listen(mqReduce, function () {
    Motion.reduced = mqReduce.matches;
    changeFns.forEach(function (fn) { try { fn(Motion.reduced); } catch (e) { setTimeout(function () { throw e; }); } });
  });
  listen(mqTouch, function () { Motion.touch = mqTouch.matches; });

  // ---- shared IntersectionObserver, one instance per threshold|rootMargin ----
  var observers = {};   // key -> { io, cbs: Map(el -> {cb, once}) }
  var owner = new Map(); // el -> key

  function observerFor(threshold, rootMargin) {
    var key = threshold + "|" + rootMargin;
    if (observers[key]) return observers[key];
    var entry = { cbs: new Map() };
    entry.io = new IntersectionObserver(function (list) {
      list.forEach(function (e) {
        var rec = entry.cbs.get(e.target);
        if (!rec) return;
        if (rec.once && !e.isIntersecting) return;
        if (rec.once) Motion.unobserve(e.target);
        rec.cb(e);
      });
    }, { threshold: threshold, rootMargin: rootMargin });
    observers[key] = entry;
    entry.key = key;
    return entry;
  }

  // observe(el, cb, {threshold=0.2, once=true, rootMargin="0px"}). With once,
  // cb fires a single time when el first intersects; otherwise on every change.
  Motion.observe = function (el, cb, opts) {
    if (!el || typeof cb !== "function") return;
    opts = opts || {};
    var threshold = opts.threshold == null ? 0.2 : opts.threshold;
    var rootMargin = opts.rootMargin || "0px";
    var once = opts.once !== false;
    if (!("IntersectionObserver" in window)) {
      cb({ target: el, isIntersecting: true, intersectionRatio: 1 });
      return;
    }
    Motion.unobserve(el);
    var entry = observerFor(threshold, rootMargin);
    entry.cbs.set(el, { cb: cb, once: once });
    owner.set(el, entry.key);
    entry.io.observe(el);
  };

  Motion.unobserve = function (el) {
    var key = owner.get(el);
    if (!key) return;
    var entry = observers[key];
    entry.cbs.delete(el);
    entry.io.unobserve(el);
    owner.delete(el);
  };

  // ---- shared rAF loop; stops itself when nothing is registered ----
  var fns = [];
  var rafId = 0, last = 0;

  function frame(t) {
    rafId = 0;
    if (document.hidden || !fns.length) return;
    var dt = last ? Math.min(t - last, 50) : 16;
    last = t;
    fns.slice().forEach(function (fn) {
      try { fn(t, dt); } catch (e) { Motion.loop.remove(fn); setTimeout(function () { throw e; }); }
    });
    if (fns.length) rafId = requestAnimationFrame(frame);
  }
  function kick() {
    if (!rafId && fns.length && !document.hidden) { last = 0; rafId = requestAnimationFrame(frame); }
  }

  Motion.loop = {
    add: function (fn) {
      if (fns.indexOf(fn) === -1) fns.push(fn);
      kick();
      return function () { Motion.loop.remove(fn); };
    },
    remove: function (fn) {
      var i = fns.indexOf(fn);
      if (i !== -1) fns.splice(i, 1);
    }
  };

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    } else {
      kick(); // last resets to 0, so the first dt after resuming is clamped
    }
  });

  // countUp(el, to, ms=900): roll a number from 0 to `to` (F3 / P1). Reduced
  // motion writes the final value at once.
  Motion.countUp = function (el, to, ms) {
    if (!el) return;
    to = Number(to) || 0;
    ms = ms || 900;
    if (el.__countStop) el.__countStop();
    if (Motion.reduced || to === 0) { el.textContent = String(to); return; }
    var start = 0;
    el.textContent = "0";
    var step = function (t) {
      if (!start) start = t;
      var k = Motion.clamp((t - start) / ms, 0, 1);
      el.textContent = String(Math.round(to * Motion.easeOut(k)));
      if (k >= 1) stop();
    };
    var stop = Motion.loop.add(step);
    el.__countStop = function () { stop(); el.__countStop = null; };
    // A hidden tab never runs the loop; make sure the final value still lands.
    setTimeout(function () { if (el.__countStop) { el.__countStop(); el.textContent = String(to); } }, ms + 1500);
  };

  // ---- generic [data-reveal] (+ [data-reveal-group] stagger) and G2 heads ----
  function initReveal() {
    document.querySelectorAll("[data-reveal-group]").forEach(function (g) {
      g.querySelectorAll("[data-reveal]").forEach(function (el, i) { el.style.setProperty("--i", i); });
    });
    var targets = document.querySelectorAll("[data-reveal], .sec-head");
    targets.forEach(function (el) {
      if (Motion.reduced) { el.classList.add("is-in"); return; }
      Motion.observe(el, function () { el.classList.add("is-in"); }, { threshold: 0.2 });
    });
  }

  // ---- glass nav: transparent until 40px of scroll ----
  function initNav() {
    var nav = document.getElementById("site-nav");
    if (!nav) return;
    var solid = null;
    var sync = function () {
      var s = window.scrollY > 40;
      if (s !== solid) { solid = s; nav.classList.toggle("is-solid", s); }
    };
    window.addEventListener("scroll", sync, { passive: true });
    sync();
    // O6: low-end touch devices skip backdrop-filter.
    if (Motion.touch && (navigator.hardwareConcurrency || 8) <= 4) document.documentElement.classList.add("no-blur");

    // Mobile search: the icon expands a full-width search row. The "/" hotkey
    // (search.js) focuses #site-search, so open the row on any focus too.
    var btn = nav.querySelector(".nav-search-btn");
    var input = document.getElementById("site-search");
    var setOpen = function (open) {
      nav.classList.toggle("search-open", open);
      if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
    };
    if (btn && input) {
      btn.addEventListener("click", function () {
        var open = !nav.classList.contains("search-open");
        setOpen(open);
        if (open) input.focus(); else input.blur();
      });
    }
    if (input) {
      input.addEventListener("focus", function () { setOpen(true); });
      input.addEventListener("blur", function () {
        setTimeout(function () { if (document.activeElement !== input && !input.value) setOpen(false); }, 150);
      });
    }
  }

  window.Motion = Motion;

  function init() { initNav(); initReveal(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
