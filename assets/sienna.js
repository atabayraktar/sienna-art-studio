/* Sienna storefront behavior: mega panel, mobile drawer, hero lights switch, hero parallax. */
(function () {
  'use strict';

  /* ---------- Mega panel ---------- */
  function initMega() {
    var nav = document.querySelector('.sn');
    if (!nav) return;
    var panel = nav.querySelector('[data-sn-panel]');
    var items = nav.querySelectorAll('[data-sn-item]');
    var cols = panel.querySelectorAll('[data-sn-col]');
    var header = nav.closest('.header-wrapper') || nav;
    var closeTimer;

    function open(idx) {
      clearTimeout(closeTimer);
      panel.hidden = false;
      items.forEach(function (li, i) {
        var on = i === idx;
        li.classList.toggle('is-open', on);
        li.querySelector('[data-sn-trigger]').setAttribute('aria-expanded', on ? 'true' : 'false');
      });
      cols.forEach(function (c, i) {
        c.classList.toggle('is-active', i === idx);
      });
    }
    function close() {
      panel.hidden = true;
      items.forEach(function (li) {
        li.classList.remove('is-open');
        li.querySelector('[data-sn-trigger]').setAttribute('aria-expanded', 'false');
      });
    }
    function later() {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(close, 160);
    }

    items.forEach(function (li, i) {
      var trigger = li.querySelector('[data-sn-trigger]');
      li.addEventListener('mouseenter', function () {
        open(i);
      });
      li.addEventListener('mouseleave', later);
      trigger.addEventListener('focus', function () {
        open(i);
      });
      trigger.addEventListener('click', function (e) {
        // First tap on a touch laptop opens the panel; a second tap follows the link.
        if (li.classList.contains('is-open') && e.detail !== 0 && window.matchMedia('(hover: none)').matches) return;
        if (window.matchMedia('(hover: none)').matches && !li.classList.contains('is-open')) {
          e.preventDefault();
          open(i);
        }
      });
    });
    panel.addEventListener('mouseenter', function () {
      clearTimeout(closeTimer);
    });
    header.addEventListener('mouseleave', later);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    document.addEventListener('click', function (e) {
      if (!nav.contains(e.target)) close();
    });
    nav.addEventListener('focusout', function (e) {
      if (!nav.contains(e.relatedTarget)) close();
    });
  }

  /* ---------- Mobile drawer ---------- */
  function initDrawer() {
    var drawer = document.querySelector('[data-sm]');
    var openBtn = document.querySelector('[data-sm-open]');
    if (!drawer || !openBtn) return;
    function setOpen(state) {
      drawer.hidden = !state;
      openBtn.setAttribute('aria-expanded', state ? 'true' : 'false');
      document.documentElement.style.overflow = state ? 'hidden' : '';
      if (state) {
        var first = drawer.querySelector('.sm__close');
        first && first.focus();
      } else {
        openBtn.focus();
      }
    }
    openBtn.addEventListener('click', function () {
      setOpen(true);
    });
    drawer.querySelectorAll('[data-sm-close]').forEach(function (el) {
      el.addEventListener('click', function () {
        setOpen(false);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !drawer.hidden) setOpen(false);
    });
  }

  /* ---------- Lights (site-wide dark theme) ---------- */
  function initLights() {
    var root = document.documentElement;
    var btns = document.querySelectorAll('[data-lights-toggle]');
    var meta = document.querySelector('meta[name="theme-color"]');
    function paint() {
      var dark = root.getAttribute('data-theme') === 'dark';
      btns.forEach(function (b) {
        b.setAttribute('aria-pressed', dark ? 'true' : 'false');
        b.setAttribute('aria-label', dark ? 'Turn off the lights' : 'Turn on the lights');
        var tip = b.querySelector('.s-lights__tip');
        if (tip) tip.textContent = dark ? tip.dataset.on : tip.dataset.off;
      });
      if (meta) meta.setAttribute('content', dark ? '#1E1A1C' : '#FAF7F2');
    }
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var dark = root.getAttribute('data-theme') !== 'dark';
        if (dark) root.setAttribute('data-theme', 'dark');
        else root.removeAttribute('data-theme');
        try {
          localStorage.setItem('sienna-theme', dark ? 'dark' : 'light');
        } catch (e) {}
        paint();
      });
    });
    paint();
  }

  /* ---------- Hero ---------- */
  function initHero() {
    var hero = document.querySelector('[data-hero]');
    if (!hero) return;
    var sw = hero.querySelector('[data-lights-switch]');
    if (sw) {
      var label = sw.querySelector('.s-switch__label');
      sw.addEventListener('click', function () {
        var on = sw.getAttribute('aria-checked') !== 'true';
        sw.setAttribute('aria-checked', on ? 'true' : 'false');
        hero.setAttribute('data-lights', on ? 'on' : 'off');
        if (label) label.textContent = on ? label.dataset.on : label.dataset.off;
      });
    }

    var art = hero.querySelector('[data-hero-art]');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!art || reduce || !fine) return;
    var layers = art.querySelectorAll('[data-depth]');
    var raf;
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        layers.forEach(function (el) {
          var d = Number(el.dataset.depth) * 6;
          el.style.translate = x * d + 'px ' + y * d + 'px';
        });
      });
    });
  }

  function init() {
    initMega();
    initDrawer();
    initLights();
    initHero();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
