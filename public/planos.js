/* planos.js — checkout SiteSales com Clerk Auth + PIX */
(function () {
  'use strict';

  var CLERK_KEY = 'pk_live_Y2xlcmsuc2l0ZXNhbGVzLmNvbS5iciQ';
  var $ = function (id) { return document.getElementById(id); };

  /* ---- Evergreen countdown (Black Friday) ---- */
  function initCountdown() {
    var LS_KEY = 'prospecta_bf_v1';
    var CYCLE = 24 * 60 * 60 * 1000;
    var start = 0;
    try { start = parseInt(localStorage.getItem(LS_KEY) || '0', 10); } catch (e) {}
    var now = Date.now();
    if (!start || now - start >= CYCLE) {
      start = now;
      try { localStorage.setItem(LS_KEY, String(start)); } catch (e) {}
    }
    var el = $('bf-timer');
    if (!el) return;
    function tick() {
      var rem = CYCLE - ((Date.now() - start) % CYCLE);
      var h = Math.floor(rem / 3600000);
      var m = Math.floor((rem % 3600000) / 60000);
      var s = Math.floor((rem % 60000) / 1000);
      el.textContent =
        String(h).padStart(2, '00') + ':' +
        String(m).padStart(2, '00') + ':' +
        String(s).padStart(2, '00');
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ---- Helpers ---- */
  function showErr(msg) {
    var el = $('err');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    var btn = $('btn-pay');
    if (btn) { btn.disabled = false; btn.textContent = 'Gerar QR Code PIX →'; }
  }

  /* ---- PIX flow ---- */
  function initPixFlow(clerk, clerkEmail) {
    var chargeId = null;
    var pollTimer = null;
    var cdTimer = null;

    function copyCode() {
      var code = $('pix-code') ? $('pix-code').textContent : '';
      if (navigator.clipboard && code) {
        navigator.clipboard.writeText(code).then(function () {
          var hint = $('copy-hint');
          if (hint) {
            hint.textContent = '✓ Copiado!';
            setTimeout(function () { hint.textContent = 'Clique no código para copiar'; }, 2000);
          }
        });
      }
    }

    function showForm() {
      clearInterval(pollTimer);
      var qs = $('qr-state'); if (qs) qs.style.display = 'none';
      var fs = $('form-state'); if (fs) fs.style.display = 'block';
      var s2 = $('step2'); if (s2) { s2.className = 'step-num active'; s2.textContent = '2'; }
      chargeId = null;
    }

    function showSuccess() {
      var qr = $('qr-state'); if (qr) qr.style.display = 'none';
      var suc = $('success-state'); if (suc) suc.style.display = 'block';
      var s2 = $('step2'); if (s2) { s2.className = 'step-num done'; s2.textContent = '✓'; }
      var s3 = $('step3'); if (s3) s3.className = 'step-num active';
      var secs = 5;
      var cd = $('countdown');
      if (cd) cd.textContent = 'Redirecionando em ' + secs + 's…';
      cdTimer = setInterval(function () {
        secs--;
        if (secs <= 0) { clearInterval(cdTimer); window.location.href = '/'; }
        else if (cd) cd.textContent = 'Redirecionando em ' + secs + 's…';
      }, 1000);
    }

    function checkStatus() {
      if (!chargeId) return;
      fetch('/api/pix/status?id=' + chargeId)
        .then(function (r) { return r.json(); })
        .then(function (d) { if (d.paid) { clearInterval(pollTimer); showSuccess(); } })
        .catch(function () {});
    }

    /* Copy PIX button */
    var copyPixBtn = $('btn-copy-pix');
    if (copyPixBtn) copyPixBtn.addEventListener('click', function () {
      var code = $('pix-code') ? $('pix-code').textContent : '';
      if (navigator.clipboard && code) {
        navigator.clipboard.writeText(code).then(function () {
          var hint = $('copy-hint');
          if (hint) { hint.textContent = '✓ Código copiado!'; hint.style.color = '#22c55e'; }
          copyPixBtn.textContent = '✓ Copiado!';
          setTimeout(function () {
            if (hint) { hint.textContent = ''; }
            copyPixBtn.textContent = '📋 Copiar código PIX';
          }, 3000);
        });
      }
    });

    /* Back button */
    var backBtn = $('btn-back');
    if (backBtn) backBtn.addEventListener('click', function () { showForm(); });

    /* Pay button */
    var btn = $('btn-pay');
    if (!btn) return;
    btn.addEventListener('click', async function (e) {
      e.preventDefault();
      var errEl = $('err'); if (errEl) errEl.style.display = 'none';

      var nameVal = $('inp-name') ? $('inp-name').value.trim() : '';
      var emailVal = clerkEmail; // sempre usa o e-mail do Clerk (vincula à conta)

      if (!nameVal) {
        showErr('Por favor, preencha seu nome.');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Gerando…';

      try {
        var phone = $('inp-phone') ? $('inp-phone').value.trim() : '';

        var headers = { 'Content-Type': 'application/json' };
        try {
          var token = clerk && clerk.session ? await clerk.session.getToken() : null;
          if (token) headers['Authorization'] = 'Bearer ' + token;
        } catch (e) {}

        var res = await fetch('/api/pix/create', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ name: nameVal, email: emailVal, phone: phone }),
        });
        var data = await res.json();
        if (!res.ok) { showErr(data.error || 'Erro ao gerar QR Code.'); return; }

        chargeId = data.id;
        var qrImg = $('qr-img'); if (qrImg) qrImg.src = data.qrCodeImage;
        var pixCode = $('pix-code');
        if (pixCode) { pixCode.textContent = data.brCode; pixCode.onclick = copyCode; }

        var fs = $('form-state'); if (fs) fs.style.display = 'none';
        var qs = $('qr-state'); if (qs) qs.style.display = 'block';

        pollTimer = setInterval(checkStatus, 3000);
      } catch (e) {
        showErr('Erro de rede. Tente novamente.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Gerar QR Code PIX →';
      }
    });
  }

  /* ---- Clerk init ---- */
  async function init() {
    var clerk = window.Clerk;
    if (!clerk) {
      clerk = await new Promise(function (resolve) {
        var t = setTimeout(function () { resolve(null); }, 6000);
        var i = setInterval(function () {
          if (window.Clerk) { clearInterval(i); clearTimeout(t); resolve(window.Clerk); }
        }, 50);
      });
    }

    if (!clerk) {
      var ls = $('loading-state');
      if (ls) ls.innerHTML = '<p style="color:#ef4444;text-align:center">Erro ao carregar autenticação.<br><a href="" style="color:inherit">Recarregue a página</a>.</p>';
      return;
    }

    if (typeof clerk.load === 'function') {
      try { await clerk.load({ publishableKey: CLERK_KEY }); } catch (e) {}
    }

    initCountdown();

    var ls = $('loading-state'); if (ls) ls.style.display = 'none';

    if (!clerk.user) {
      var s1 = $('step1'); if (s1) { s1.className = 'step-num active'; s1.textContent = '1'; }
      var as = $('auth-state'); if (as) as.style.display = 'block';
      var su = $('btn-signup');
      if (su) su.onclick = function () { clerk.redirectToSignUp({ redirectUrl: window.location.href }); };
      var si = $('btn-signin');
      if (si) si.onclick = function () { clerk.redirectToSignIn({ redirectUrl: window.location.href }); };
      return;
    }

    var user = clerk.user;
    var emailAddr = (user.primaryEmailAddress && user.primaryEmailAddress.emailAddress) || '';
    var clerkName = ([user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || '').trim();

    /* Pré-preenche os inputs */
    var nameInput = $('inp-name');
    if (nameInput) nameInput.value = clerkName;

    var emailInput = $('inp-email');
    if (emailInput) emailInput.value = emailAddr;

    var s1 = $('step1'); if (s1) { s1.className = 'step-num done'; s1.textContent = '✓'; }
    var s2 = $('step2'); if (s2) s2.className = 'step-num active';

    var fs = $('form-state'); if (fs) fs.style.display = 'block';

    initPixFlow(clerk, emailAddr);
  }

  window.addEventListener('load', function () { init(); });
})();
