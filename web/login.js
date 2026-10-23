const next = Auth.safeNext(new URLSearchParams(location.search).get('next'));
if (Auth.currentUser()) location.replace(next);

const tabs = document.getElementById('auth-tabs');
const panels = {
  login:document.getElementById('panel-login'),
  register:document.getElementById('panel-register'),
  reset:document.getElementById('panel-reset')
};
const loginForm = document.getElementById('panel-login');
const loginName = document.getElementById('login-name');
const loginPassword = document.getElementById('login-password');
const loginMessage = document.getElementById('login-message');
const registerForm = document.getElementById('panel-register');
const registerMessage = document.getElementById('register-message');
const findForm = document.getElementById('reset-find');
const findName = document.getElementById('reset-name');
const findMessage = document.getElementById('reset-find-message');
const setForm = document.getElementById('reset-set');
const setPassword = document.getElementById('reset-password');
const setRepeat = document.getElementById('reset-repeat');
const setMessage = document.getElementById('reset-set-message');
const resetUser = document.getElementById('reset-user');
let resetLogin = '';

function showMessage(element, text, success = false) {
  element.textContent = text;
  element.classList.toggle('is-success', success);
}

function setTab(name) {
  tabs.dataset.active = name;
  tabs.querySelectorAll('[role="tab"]').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.tab === name)));
  Object.entries(panels).forEach(([key, panel]) => { panel.hidden = key !== name; });
  if (name === 'reset') showResetStep('find');
  if (name === 'login') (loginName.value ? loginPassword : loginName).focus();
  if (name === 'register') registerForm.elements.lastName.focus();
  if (name === 'reset') findName.focus();
}

function showResetStep(step) {
  findForm.hidden = step !== 'find';
  setForm.hidden = step !== 'set';
  showMessage(findMessage, '');
  showMessage(setMessage, '');
}

document.getElementById('register-department').replaceChildren(...Object.entries(Auth.departments).map(([value, dept]) => {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = dept.name;
  return option;
}));

tabs.querySelectorAll('[role="tab"]').forEach(tab => tab.addEventListener('click', () => setTab(tab.dataset.tab)));

document.querySelectorAll('[data-toggle-password]').forEach(button => {
  button.addEventListener('click', () => {
    const input = button.parentElement.querySelector('input');
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(visible));
    button.setAttribute('aria-label', visible ? 'Скрыть пароль' : 'Показать пароль');
  });
});

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (!loginName.value.trim() || !loginPassword.value) {
    showMessage(loginMessage, 'Введите логин и пароль');
    return;
  }
  const button = loginForm.querySelector('[type="submit"]');
  button.disabled = true;
  const result = await Auth.login(loginName.value, loginPassword.value);
  button.disabled = false;
  if (result.ok) {
    location.replace(next);
    return;
  }
  showMessage(loginMessage, result.error);
  loginPassword.select();
});

registerForm.addEventListener('submit', async e => {
  e.preventDefault();
  const fields = registerForm.elements;
  if (fields.password.value !== fields.repeat.value) {
    showMessage(registerMessage, 'Пароли не совпадают');
    return;
  }
  const result = await Auth.register({
    lastName:fields.lastName.value,
    firstName:fields.firstName.value,
    login:fields.login.value,
    department:fields.department.value,
    password:fields.password.value
  });
  if (!result.ok) {
    showMessage(registerMessage, result.error);
    return;
  }
  location.replace('account.html');
});

findForm.addEventListener('submit', e => {
  e.preventDefault();
  const user = Auth.findUser(findName.value);
  if (!user) {
    showMessage(findMessage, findName.value.trim() ? 'Пользователь с таким логином не найден' : 'Введите логин');
    return;
  }
  resetLogin = user.login;
  resetUser.textContent = Auth.fullName(user) ? `${Auth.fullName(user)} (${user.login})` : user.login;
  setPassword.value = '';
  setRepeat.value = '';
  showResetStep('set');
  setPassword.focus();
});

setForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (setPassword.value !== setRepeat.value) {
    showMessage(setMessage, 'Пароли не совпадают');
    return;
  }
  const result = await Auth.resetPassword(resetLogin, setPassword.value);
  if (!result.ok) {
    showMessage(setMessage, result.error);
    return;
  }
  loginName.value = resetLogin;
  loginPassword.value = '';
  setTab('login');
  showMessage(loginMessage, 'Пароль изменён — войдите с новым паролем', true);
});

document.getElementById('reset-back').addEventListener('click', () => {
  showResetStep('find');
  findName.focus();
});

document.getElementById('forgot-link').addEventListener('click', () => {
  findName.value = loginName.value.trim();
  setTab('reset');
});

document.getElementById('back-to-login').addEventListener('click', () => setTab('login'));
