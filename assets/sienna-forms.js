/* Sienna forms: inline, on-brand validation for the contact and email list forms. */
(function () {
  function msgFor(el) {
    var v = el.validity;
    if (v.valueMissing) return el.getAttribute('data-msg-required') || 'This field is required.';
    if (v.typeMismatch || v.patternMismatch) return el.getAttribute('data-msg-type') || 'Please check this field.';
    return el.validationMessage || 'Please check this field.';
  }
  function show(el) {
    var wrap = el.closest('[data-field]');
    if (!wrap) return;
    var errId = el.getAttribute('aria-describedby');
    var err = (errId && document.getElementById(errId)) || wrap.querySelector('[data-err]');
    var bad = !el.checkValidity();
    wrap.classList.toggle('is-invalid', bad);
    el.setAttribute('aria-invalid', bad ? 'true' : 'false');
    if (err) {
      err.textContent = bad ? msgFor(el) : '';
      err.hidden = !bad;
    }
  }
  function init(form) {
    /* Both sections load this file; bind each form only once. */
    if (form.dataset.siennaBound) return;
    form.dataset.siennaBound = '1';
    /* Native validation stays on until JS takes over, so an empty form never posts. */
    form.noValidate = true;
    var fields = form.querySelectorAll('input[required], textarea[required]');
    fields.forEach(function (el) {
      el.addEventListener('blur', function () {
        if (el.value !== '') show(el);
      });
      el.addEventListener('input', function () {
        var wrap = el.closest('[data-field]');
        if (wrap && wrap.classList.contains('is-invalid')) show(el);
      });
    });
    form.addEventListener('submit', function (e) {
      /* Spam clicks: one post at a time, and a short cooldown after it lands. */
      if (form.dataset.siennaBusy) {
        e.preventDefault();
        return;
      }
      var first = null;
      fields.forEach(function (el) {
        show(el);
        if (!el.checkValidity() && !first) first = el;
      });
      e.preventDefault();
      if (first) {
        first.focus();
        return;
      }
      send(form);
    });
  }

  /* Post in the background so the page never leaves the home screen. */
  function note(form, text, kind) {
    var isList = form.classList.contains('s-list__form-wrap');
    var el = form.querySelector('.s-list__msg--live');
    if (!el) {
      el = document.createElement('p');
      el.className = 's-list__msg s-list__msg--live';
      el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
      form.appendChild(el);
    }
    el.className = 's-list__msg s-list__msg--live s-list__msg--' + (kind === 'error' ? 'error' : 'ok');
    el.textContent = text;
    el.hidden = false;
    if (isList) {
      var fine = form.querySelector('.s-list__fine');
      var err = form.querySelector('.s-list__err');
      if (fine) fine.hidden = true;
      if (err) err.hidden = true;
    }
  }
  function send(form) {
    var isList = form.classList.contains('s-list__form-wrap');
    var btn = form.querySelector('button[type="submit"]');
    var label = btn ? btn.textContent : '';
    form.dataset.siennaBusy = '1';
    if (btn) {
      btn.disabled = true;
      btn.classList.add('is-pending');
      btn.textContent = isList ? 'Joining' : 'Sending';
    }
    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'text/html' },
      credentials: 'same-origin'
    })
      .then(function (res) {
        console.info('[sienna-forms]', res.status, res.url);
        if (/\/challenge/.test(res.url)) {
          /* Shopify wants a captcha: only a full-page post can show it. Never do that on the local preview. */
          if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) {
            note(form, 'Shopify asked for a captcha, which only works on the live site.', 'error');
            return;
          }
          HTMLFormElement.prototype.submit.call(form);
          return;
        }
        /* Shopify redirects to /contact?contact_posted=true, which is a 404 here (no contact page); the flag still means it posted. */
        var ok = /(contact|customer)_posted=true/.test(res.url);
        if (ok) {
          form.reset();
          form.querySelectorAll('[data-field]').forEach(function (w) {
            w.classList.remove('is-invalid');
          });
          note(
            form,
            isList ? 'Thanks for joining. Watch your inbox.' : 'Thanks for writing. We will get back to you soon.',
            'ok'
          );
        } else {
          note(
            form,
            isList
              ? 'That email did not go through. Check it and try again.'
              : 'Something went wrong. Please check your details and try again.',
            'error'
          );
        }
      })
      .catch(function () {
        note(form, 'We could not send that. Check your connection and try again.', 'error');
      })
      .then(function () {
        if (btn) {
          btn.disabled = false;
          btn.classList.remove('is-pending');
          btn.textContent = label;
        }
        setTimeout(function () {
          delete form.dataset.siennaBusy;
        }, 3000);
      });
  }
  document.querySelectorAll('form.s-contact__form, form.s-list__form-wrap').forEach(init);
})();
