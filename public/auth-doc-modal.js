// Reading the terms and the privacy notice without leaving the sign-in form.
//
// Loaded ONLY by /sign-in/ — it is the one page with a form the reader must
// not lose their place in. Lifted out of sign-in.astro on 2026-09-02, verbatim:
// it touches nothing page-local beyond element ids and the .auth-wrap panel,
// and 160 lines of dialog plumbing were a third of that page's script for a
// feature the form itself knows nothing about. Deliberately NOT in
// auth-pages.js, which /account/ also loads and which has no such modal.
//
// Loaded with the defer attribute, so the markup it binds to exists when it
// runs. Where <dialog>.showModal is missing it does nothing at all, and every
// one of these links stays an ordinary link to a real page — which is why the
// hrefs are real and not "#".

(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }

  //
  // Bound once on the panel rather than per link, so the summary's own
  // links and anything added to it later are covered without re-binding.
  var modal = el('auth-doc-modal');

  // The feature test that decides whether to intercept at all. Where it
  // fails, every one of these stays an ordinary link to a real page —
  // which is why the hrefs are real and not '#'.
  if (!modal || typeof modal.showModal !== 'function') return;

  var frame = el('auth-doc-frame');
  var titleEl = el('auth-doc-title');
  var tabLink = el('auth-doc-tab');
  var pendingHash = '';

  // ── THE MODAL IS A READER, NOT A BROWSER ────────────────────────────
  //
  // ⚠️ WITHOUT THIS RULE THE MODAL NESTS INSIDE ITSELF. privacy.html links
  // to why-sign-up.html and to /sign-in/, so a reader could reach the
  // sign-up form INSIDE the modal, click "terms of use" there, and open a
  // second modal within the first — and again, and again. Every layer
  // holds a live copy of the form, only one of which is the one they were
  // filling in.
  //
  // The fix is to decide what this surface IS rather than to special-case
  // the loop. It shows the legal documents and nothing else, so every link
  // inside it resolves to one of four outcomes:
  //
  //   1. A fragment on the same page  -> let it scroll. This is the
  //      16-entry contents list, and it is the main way the page is read.
  //   2. The OTHER legal document     -> swap it into this modal. The two
  //      cross-reference each other constantly and belong to one task.
  //   3. mailto:, tel:                -> let it through; nothing navigates.
  //   4. Anything else                -> new tab, and close the modal.
  //      The form behind it survives, which was the whole point.
  //
  // Recursion is then impossible by construction: the frame can only ever
  // hold privacy.html or terms.html, and /sign-in/ can never load inside
  // it. That is a stronger guarantee than a depth counter, and it needs no
  // state to maintain.
  var DOCS = ['privacy.html', 'terms.html'];

  function docLabel(path) {
    return path.indexOf('terms.html') > -1 ? 'Terms of use' : 'Privacy &amp; cookies';
  }

  frame.addEventListener('load', function () {
    var doc;
    try { doc = frame.contentDocument; } catch (e) { return; }
    if (!doc) return;

    // Belt and braces for the "#s8" links. The fragment in `src` should
    // land the reader on that section; this repeats it after load, once
    // the layout being scrolled through exists.
    //
    // ⚠️ UNVERIFIED, and labelled as such. Scrolling is inert in the
    // agent's browser — `window.scrollTo` moves nothing, top level or in
    // a frame — so neither the native fragment nor this could be
    // measured. If a human finds these landing at the top of the document
    // instead of on the section, this is the first thing to look at; the
    // native fragment may be doing the job alone, making this redundant
    // rather than wrong.
    if (pendingHash) {
      var target = pendingHash;
      pendingHash = '';
      var node = doc.querySelector(target);
      if (node) node.scrollIntoView();
    }

    // Re-attached on every load, because outcome 2 causes another one.
    doc.addEventListener('click', function (e) {
      var link = e.target.closest ? e.target.closest('a[href]') : null;
      if (!link) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

      var raw = link.getAttribute('href') || '';

      // 1. Same-page fragment — the contents list. Leave it entirely.
      if (raw.charAt(0) === '#') return;

      // 3. Nothing navigates, so nothing to manage.
      if (/^(mailto:|tel:)/i.test(raw)) return;

      // `link.href` is absolute and already resolved against the frame's
      // own base, which is what makes the relative hrefs on these pages
      // work here at all.
      var abs = link.href;
      var sameOrigin = abs.indexOf(window.location.origin) === 0;

      // 2. The sibling document — swap it in rather than leaving.
      if (sameOrigin && DOCS.some(function (d) { return abs.indexOf(d) > -1; })) {
        e.preventDefault();
        open(abs, docLabel(abs));
        return;
      }

      // 4. Everything else leaves, and the modal goes with it.
      e.preventDefault();
      window.open(abs, '_blank', 'noopener');
      close();
    });
  });

  function open(href, label) {
    titleEl.innerHTML = label || 'Document';
    tabLink.href = href;

    // ⚠️ `embed=1` BEFORE any #fragment, or it lands inside the fragment
    // and the page never sees it — the modal would then show the full
    // page complete with nav and footer, which looks like a bug in the
    // modal rather than a malformed URL.
    var hash = '';
    var url = href;
    var i = href.indexOf('#');
    if (i > -1) { hash = href.slice(i); url = href.slice(0, i); }
    pendingHash = hash;
    frame.src = url + (url.indexOf('?') > -1 ? '&' : '?') + 'embed=1' + hash;

    modal.showModal();
  }

  document.querySelector('.auth-wrap').addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('a[data-doc]') : null;
    if (!link) return;

    // Leave the modifier-click conventions alone: ctrl/cmd/shift/middle
    // click means "open this somewhere else", and hijacking that is the
    // most reliable way to make a link feel broken.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

    e.preventDefault();
    open(link.getAttribute('href'), link.getAttribute('data-doc'));
  });

  function close() {
    modal.close();
    // Drop the page rather than leave it loaded behind a closed dialog.
    frame.src = 'about:blank';
  }

  el('auth-doc-close').addEventListener('click', close);

  // "Open in a new tab" closes this one. The link keeps target="_blank"
  // and does its own work; all this adds is dismissing a modal the reader
  // has just finished with — leaving it up would mean coming back to the
  // form and finding the document still covering it.
  //
  // Not preventDefault'd: the browser opens the tab, and closing after
  // that keeps middle-click and the context menu behaving normally.
  el('auth-doc-tab').addEventListener('click', function () { close(); });

  // The one thing showModal() does not give us. The dialog element fills
  // the viewport including its backdrop, so a click whose target IS the
  // dialog — rather than anything inside it — landed on the backdrop.
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

  // Escape is handled by the dialog itself; this only clears the iframe
  // afterwards so the next open starts fresh.
  modal.addEventListener('close', function () { frame.src = 'about:blank'; });
})();
