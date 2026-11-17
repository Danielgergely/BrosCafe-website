// Bros Cafe — staff login (/belepes/). Session: staff.js.
(() => {
  const S = window.BROS.staff, t = window.BROS.t;
  const $ = (s) => document.querySelector(s);
  const form = $('#login-form'), email = $('#login-email'), password = $('#login-password'), error = $('#login-error'), go = $('#login-submit');
  const from = new URLSearchParams(location.search).get('from');
  const enter = (user) => location.replace(S.landing(user.role, from));

  // already signed in: straight to the scanner (or the admin)
  S.me().then((user) => { if (user) enter(user); }).catch(() => {});

  function fail(text, field) {
    error.textContent = text; error.hidden = false;
    form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
    (field || password).focus();
  }
  let busy = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    error.hidden = true;
    if (!email.checkValidity()) return fail(t('Írd be az e-mail-címed.'), email);
    if (!password.value) return fail(t('Írd be a jelszavad.'), password);
    busy = true; go.disabled = true; go.textContent = t('Belépés…');
    try {
      enter(await S.signIn(email.value.trim(), password.value));
    } catch (err) {
      busy = false; go.disabled = false; go.textContent = t('Belépés');
      fail(err.message);
    }
  });
})();
