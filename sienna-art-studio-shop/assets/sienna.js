/* Sienna storefront behavior: mega panel, mobile drawer, hero lights switch, hero parallax. */
(function () {
  'use strict';

  /* ---------- Mega panel ---------- */
  function initMega() {
    var nav = document.querySelector('.sn');
    if (!nav) return;
    var panel = nav.querySelector('[data-sn-panel]');
    var item = nav.querySelector('[data-sn-item]');
    var trigger = item.querySelector('[data-sn-trigger]');

    var isOpen = false;
    var closeTimer;

    /* Closing plays the open animation backwards, then hides the panel. */
    function finishClose() {
      panel.hidden = true;
      panel.classList.remove('is-closing');
    }
    function setOpen(on) {
      if (on === isOpen) return;
      isOpen = on;
      clearTimeout(closeTimer);
      item.classList.toggle('is-open', on);
      trigger.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (on) {
        panel.classList.remove('is-closing');
        panel.hidden = false;
      } else if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        finishClose();
      } else {
        panel.classList.add('is-closing');
        closeTimer = setTimeout(finishClose, 200);
      }
    }
    function close() {
      setOpen(false);
    }

    /* Shop opens on click only; the column under the mouse lights up through CSS :hover. */
    trigger.addEventListener('click', function () {
      setOpen(!isOpen);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) {
        close();
        trigger.focus();
      }
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
    var closeTimer = null;
    function setOpen(state) {
      clearTimeout(closeTimer);
      drawer.classList.remove('is-closing');
      openBtn.setAttribute('aria-expanded', state ? 'true' : 'false');
      document.documentElement.style.overflow = state ? 'hidden' : '';
      if (state) {
        drawer.hidden = false;
        var first = drawer.querySelector('.sm__close');
        first && first.focus();
      } else {
        if (drawer.hidden) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          drawer.hidden = true;
        } else {
          drawer.classList.add('is-closing');
          closeTimer = setTimeout(function () {
            drawer.hidden = true;
            drawer.classList.remove('is-closing');
          }, 280);
        }
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

  /* ---------- Logos: go home, or glide to the top when already there ---------- */
  function initHomeLinks() {
    document.querySelectorAll('[data-home-link]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
        var here = window.location.pathname.replace(/\/$/, '') || '/';
        var target = a.pathname.replace(/\/$/, '') || '/';
        if (here !== target) return;
        e.preventDefault();
        var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      });
    });
  }

  /* ---------- Product gallery: drag to swipe with the mouse (touch already swipes) ---------- */
  function initGalleryDrag() {
    document.querySelectorAll('media-gallery').forEach(function (gallery) {
      var list = gallery.querySelector('[id^="Slider-Gallery"]');
      if (!list) return;
      var startX = 0;
      var dragging = false;
      var moved = false;
      function step(dir) {
        var thumbs = gallery.querySelectorAll('.thumbnail');
        if (!thumbs.length) return;
        var cur = 0;
        thumbs.forEach(function (t, i) {
          if (t.getAttribute('aria-current') === 'true') cur = i;
        });
        var next = Math.max(0, Math.min(thumbs.length - 1, cur + dir));
        if (next !== cur) thumbs[next].click();
      }
      list.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        dragging = true;
        moved = false;
        startX = e.clientX;
        list.classList.add('is-dragging');
      });
      window.addEventListener('pointermove', function (e) {
        if (dragging && Math.abs(e.clientX - startX) > 6) moved = true;
      });
      window.addEventListener('pointerup', function (e) {
        if (!dragging) return;
        dragging = false;
        list.classList.remove('is-dragging');
        var dx = e.clientX - startX;
        if (moved && Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
      });
      /* a drag must not open the zoom lightbox */
      list.addEventListener(
        'click',
        function (e) {
          if (moved) {
            e.stopPropagation();
            e.preventDefault();
            moved = false;
          }
        },
        true
      );
      /* arrow keys while the gallery has focus */
      gallery.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') step(1);
        if (e.key === 'ArrowLeft') step(-1);
      });
    });
  }

  /* ---------- Sort dropdown: custom list on top of the native select ---------- */
  function enhanceSort() {
    document.querySelectorAll('select.facet-filters__sort, .mobile-facets__sort select').forEach(function (sel) {
      if (sel.dataset.sEnhanced) return;
      sel.dataset.sEnhanced = '1';
      var wrap = document.createElement('div');
      wrap.className = 's-select';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 's-select__btn';
      btn.setAttribute('aria-haspopup', 'listbox');
      btn.setAttribute('aria-expanded', 'false');
      var label = document.createElement('span');
      btn.appendChild(label);
      btn.insertAdjacentHTML(
        'beforeend',
        '<svg class="s-select__caret" width="10" height="7" viewBox="0 0 10 7" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      );
      var list = document.createElement('ul');
      list.className = 's-select__list';
      list.setAttribute('role', 'listbox');
      list.hidden = true;
      Array.prototype.forEach.call(sel.options, function (o) {
        var li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.dataset.value = o.value;
        li.textContent = o.textContent.trim();
        li.setAttribute('aria-selected', o.selected ? 'true' : 'false');
        if (o.selected) label.textContent = li.textContent;
        list.appendChild(li);
      });
      function close() {
        list.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
      btn.addEventListener('click', function () {
        var open = list.hidden;
        document.querySelectorAll('.s-select__list').forEach(function (l) {
          l.hidden = true;
        });
        list.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      list.addEventListener('click', function (e) {
        var li = e.target.closest('li');
        if (!li) return;
        sel.value = li.dataset.value;
        close();
        label.textContent = li.textContent;
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
      document.addEventListener('click', function (e) {
        if (!wrap.contains(e.target)) close();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') close();
      });
      wrap.appendChild(btn);
      wrap.appendChild(list);
      sel.classList.add('s-select__native');
      sel.tabIndex = -1;
      sel.parentNode.insertBefore(wrap, sel);
    });
  }
  /* Mobile filter sheet: tell the CSS how tall the sheet is, so its close button can sit in the top-right corner */
  function trackSheet() {
    if (!window.ResizeObserver) return;
    document.querySelectorAll('.mobile-facets__disclosure').forEach(function (d) {
      var inner = d.querySelector('.mobile-facets__inner');
      if (!inner || inner.dataset.sRo) return;
      inner.dataset.sRo = '1';
      new ResizeObserver(function () {
        d.style.setProperty('--s-sheet-h', inner.offsetHeight + 'px');
      }).observe(inner);
    });
  }
  function initSortSelect() {
    enhanceSort();
    trackSheet();
    var t;
    new MutationObserver(function () {
      clearTimeout(t);
      t = setTimeout(function () {
        enhanceSort();
        trackSheet();
      }, 80);
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* ---------- Search: closes with a fade instead of vanishing ---------- */
  function initSearchMotion() {
    if (!window.customElements) return;
    customElements.whenDefined('details-modal').then(function () {
      var DM = customElements.get('details-modal');
      if (!DM || DM.prototype.__sienna) return;
      var orig = DM.prototype.close;
      var origOpen = DM.prototype.open;
      DM.prototype.__sienna = true;
      /* keep the page where it is when the scrollbar disappears */
      function lockWidth() {
        var w = window.innerWidth - document.documentElement.clientWidth;
        if (w > 0) {
          document.body.style.paddingRight = w + 'px';
          document.documentElement.style.setProperty('--s-sbw', w + 'px');
        }
      }
      function unlockWidth() {
        document.body.style.paddingRight = '';
        document.documentElement.style.removeProperty('--s-sbw');
      }
      DM.prototype.open = function (event) {
        if (this.classList.contains('header__search')) lockWidth();
        return origOpen.call(this, event);
      };
      DM.prototype.close = function (focusToggle) {
        var self = this;
        var d = this.detailsContainer;
        var isSearch = this.classList.contains('header__search');
        if (!isSearch || !d.hasAttribute('open')) {
          return orig.call(this, focusToggle);
        }
        if (d.classList.contains('is-closing')) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          orig.call(this, focusToggle);
          unlockWidth();
          return;
        }
        d.classList.add('is-closing');
        setTimeout(function () {
          d.classList.remove('is-closing');
          orig.call(self, focusToggle);
          unlockWidth();
        }, 240);
      };
      /* The X button was bound to the original close() when the element was built, so it skips the fade. Route it through the patched one. */
      document.querySelectorAll('details-modal.header__search').forEach(function (modal) {
        var closeBtn = modal.querySelector('button[type="button"]');
        if (!closeBtn) return;
        modal.addEventListener(
          'click',
          function (e) {
            if (e.target.closest('button[type="button"]') !== closeBtn) return;
            e.stopPropagation();
            modal.close();
          },
          true
        );
      });
    });
  }

  /* ---------- Custom option fields (Easify): labels become placeholders ---------- */
  function tidyOptions() {
    document.querySelectorAll('.easify-product-options [class*="po-field-root"]').forEach(function (f) {
      if (f.dataset.sTidy) return;
      var labelEl = f.querySelector('[class*="po-label-label"]');
      var area = f.querySelector('textarea');
      var file = f.querySelector('input[type="file"]');
      if (!labelEl || (!area && !file)) return;
      f.dataset.sTidy = '1';
      var required = !!f.querySelector('[class*="po-label-required"]');
      var text = labelEl.textContent.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
      if (area) {
        var old = area.getAttribute('placeholder');
        if (old && !f.querySelector('[class*="po-field-helpText"]')) area.setAttribute('title', old);
        area.setAttribute('placeholder', text + (required ? ' *' : ''));
      }
      f.classList.add('s-po-nolabel');
      if (required) f.classList.add('s-po-required');
    });
  }
  function initOptions() {
    tidyOptions();
    var t;
    new MutationObserver(function () {
      clearTimeout(t);
      t = setTimeout(tidyOptions, 120);
    }).observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    initOptions();
    initSearchMotion();
    initSortSelect();
    initGalleryDrag();
    initHomeLinks();
    initMega();
    initDrawer();
    initLights();
    initHero();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* Collection category sidebar: always open on desktop, collapsible on mobile */
(function () {
  var d = document.querySelector('[data-s-side]');
  if (!d) return;
  var mq = window.matchMedia('(min-width: 990px)');
  function sync() { d.open = mq.matches; }
  sync();
  mq.addEventListener('change', sync);
})();

/* Mobile menu: category dropdowns slide open and closed instead of snapping */
(function () {
  var groups = document.querySelectorAll('.sm__group');
  if (!groups.length || !window.Element || !Element.prototype.animate) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  groups.forEach(function (d) {
    var summary = d.querySelector('summary');
    var list = d.querySelector('ul');
    if (!summary || !list) return;
    var anim = null;
    var PROPS = ['height', 'paddingTop', 'paddingBottom', 'marginTop', 'marginBottom'];
    function frame(open) {
      var cs = getComputedStyle(list);
      var f = { opacity: open ? 1 : 0 };
      PROPS.forEach(function (k) {
        f[k] = open ? (k === 'height' ? list.offsetHeight : parseFloat(cs[k])) + 'px' : '0px';
      });
      return f;
    }
    function run(opening, done) {
      if (anim) anim.cancel();
      var full = frame(true);
      var none = frame(false);
      list.style.overflow = 'hidden';
      anim = list.animate(opening ? [none, full] : [full, none], {
        duration: 280,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      });
      anim.onfinish = anim.oncancel = function () {
        anim = null;
        list.style.overflow = '';
        if (done) done();
      };
    }
    summary.addEventListener('click', function (e) {
      if (reduce.matches) return;
      e.preventDefault();
      if (d.open && !d.dataset.closing) {
        d.dataset.closing = '1';
        run(false, function () {
          d.open = false;
          delete d.dataset.closing;
        });
      } else if (!d.open) {
        d.open = true;
        run(true);
      }
    });
  });
})();

/* Accordion-style <details> (Categories on the collection page, product accordions): the box grows and shrinks smoothly */
(function () {
  if (!window.Element || !Element.prototype.animate) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('details.s-side__wrap, .accordion details').forEach(function (d) {
    var summary = d.querySelector(':scope > summary');
    if (!summary) return;
    var anim = null;
    function closedHeight() {
      var was = d.open;
      d.open = false;
      var h = d.offsetHeight;
      d.open = was;
      return h;
    }
    function run(from, to, done) {
      if (anim) anim.cancel();
      d.style.overflow = 'hidden';
      anim = d.animate([{ height: from + 'px' }, { height: to + 'px' }], {
        duration: 280,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      });
      anim.onfinish = anim.oncancel = function () {
        anim = null;
        d.style.overflow = '';
        if (done) done();
      };
    }
    summary.addEventListener('click', function (e) {
      if (reduce.matches) return;
      e.preventDefault();
      if (d.open && !d.dataset.closing) {
        d.dataset.closing = '1';
        var from = d.offsetHeight;
        run(from, closedHeight(), function () {
          d.open = false;
          delete d.dataset.closing;
        });
      } else if (!d.open) {
        var start = closedHeight();
        d.open = true;
        run(start, d.offsetHeight);
      }
    });
  });
})();

/* Product zoom on touch screens: tapping anywhere outside the photo closes it (the theme only does this for a mouse pointer) */
(function () {
  function outside(e) {
    var m = document.querySelector('product-modal[open]');
    if (!m || !m.contains(e.target)) return;
    if (e.target.closest('deferred-media, product-model, img, [id^="ModalClose-"], .product-media-modal__toggle')) return;
    if (typeof m.hide === 'function') m.hide();
  }
  /* a tap fires click on every phone, even when the finger moved a little and pointerup never arrives */
  document.addEventListener('click', outside);
  document.addEventListener('touchend', function (e) {
    if (e.changedTouches && e.changedTouches.length === 1) outside(e);
  });
})();
