let user = Auth.currentUser();
const sections = [...document.querySelectorAll('[data-section]')];
const sectionLinks = [...document.querySelectorAll('[data-section-link]')];
const sectionAccess = {department:'department', users:'users'};
const profileForm = document.getElementById('profile-form');
const passwordForm = document.getElementById('password-form');
const userForm = document.getElementById('user-form');
const usersBody = document.getElementById('users-body');
const deptSelect = document.getElementById('dept-select');
const pendingCount = document.getElementById('pending-count');
const menuPill = document.querySelector('.menu-pill');
const sideCloud = document.querySelector('.cloud-side');
const toast = document.getElementById('toast');
const dateFormat = new Intl.DateTimeFormat('ru-RU', {day:'2-digit', month:'2-digit', year:'numeric'});
let toastTimer;

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function showToast(text) {
  toast.textContent = text;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function showMessage(id, text) {
  document.getElementById(id).textContent = text;
}

function fillOptions(select, items, selected) {
  select.replaceChildren(...Object.entries(items).map(([value, item]) => {
    const option = el('option', '', item.name);
    option.value = value;
    option.defaultSelected = option.selected = value === selected;
    return option;
  }));
}

function departmentName(key) {
  return Auth.departments[key] ? Auth.departments[key].name : '—';
}

function roleName(key) {
  return Auth.roles[key] ? Auth.roles[key].name : key;
}

function applyAccess() {
  document.querySelectorAll('[data-access]').forEach(node => { node.hidden = !Auth.can(user, node.dataset.access); });
  document.querySelectorAll('[data-pending-only]').forEach(node => { node.hidden = user.role !== 'pending'; });
}

function renderIdentity() {
  document.querySelectorAll('[data-user-initials]').forEach(node => { node.textContent = Auth.initials(user); });
  document.querySelectorAll('[data-user-name]').forEach(node => { node.textContent = Auth.fullName(user) || user.login; });
  document.querySelectorAll('[data-user-role]').forEach(node => { node.textContent = roleName(user.role); });
  document.querySelectorAll('[data-user-department]').forEach(node => { node.textContent = departmentName(user.department); });
}

function fillProfile() {
  const fields = profileForm.elements;
  fields.lastName.value = user.lastName;
  fields.firstName.value = user.firstName;
  fields.login.value = user.login;
  fields.department.value = departmentName(user.department);
  fields.role.value = roleName(user.role);
}

function refreshSelf() {
  user = Auth.currentUser();
  applyAccess();
  renderIdentity();
  fillProfile();
}

// Справа облако точек из картинки отдела; у отдела без картинки точки рассеиваются
function showDepartmentCloud(key) {
  const {src = null, ...options} = (Auth.departments[key] && Auth.departments[key].cloud) || {};
  if (sideCloud && sideCloud.cloud) sideCloud.cloud.show(src, options);
}

function renderDepartment(key) {
  const dept = Auth.departments[key] || Object.values(Auth.departments)[0];
  const lead = document.getElementById('dept-lead');
  const widgets = dept.widgets || [];
  document.getElementById('dept-name').textContent = dept.name;
  lead.textContent = dept.lead || '';
  lead.hidden = !dept.lead;
  document.getElementById('dept-widgets').replaceChildren(...(widgets.length ? widgets.map(widget => {
    const card = el('article', 'panel-box widget');
    card.append(el('h2', '', widget.title), el('p', '', widget.text), el('span', 'soon', 'В разработке'));
    return card;
  }) : [(() => {
    const empty = el('div', 'panel-box dept-empty');
    empty.append(el('h2', '', 'Разделы появятся позже'), el('p', '', `Наполнение кабинета отдела «${dept.name}» сейчас уточняется.`));
    return empty;
  })()]));
  if (!Auth.can(user, 'team')) return;
  const members = Auth.team(key);
  document.getElementById('team-list').replaceChildren(...(members.length ? members.map(member => {
    const item = el('li', 'team-member');
    const copy = el('div');
    copy.append(el('b', '', Auth.fullName(member) || member.login), el('small', '', roleName(member.role)));
    item.append(el('span', 'avatar avatar-sm', Auth.initials(member)), copy);
    return item;
  }) : [el('li', 'empty-note', 'В отделе пока нет подтверждённых сотрудников')]));
}

function updatePendingCount() {
  if (!Auth.can(user, 'users')) return;
  const count = Auth.listUsers().filter(item => item.role === 'pending').length;
  pendingCount.textContent = count;
  pendingCount.hidden = !count;
}

function saveUser(login, field, select) {
  const result = Auth.updateUser(login, {[field]:select.value});
  if (!result.ok) {
    select.value = select.dataset.value;
    showToast(result.error);
    return;
  }
  select.dataset.value = select.value;
  select.closest('tr').classList.toggle('is-pending', result.user.role === 'pending');
  showToast(field === 'role' ? `Роль: ${roleName(result.user.role)}` : `Отдел: ${departmentName(result.user.department)}`);
  updatePendingCount();
  if (login === user.login) refreshSelf();
}

function userRow(item, isNew) {
  const self = item.login === user.login;
  const pending = item.role === 'pending';
  const row = el('tr', [isNew ? 'is-new' : '', pending ? 'is-pending' : ''].join(' ').trim());

  const person = el('div', 'user-cell');
  const copy = el('div');
  const meta = pending ? `${item.login} · заявка от ${dateFormat.format(new Date(item.createdAt))}` : item.login;
  copy.append(el('b', '', Auth.fullName(item) || item.login), el('small', '', self ? `${item.login} · это вы` : meta));
  person.append(el('span', 'avatar avatar-sm', Auth.initials(item)), copy);

  const selects = [['department', Auth.departments, 'Отдел'], ['role', Auth.roles, 'Роль']].map(([field, items, label]) => {
    const select = el('select', 'select');
    fillOptions(select, items, item[field]);
    select.dataset.value = item[field];
    select.setAttribute('aria-label', `${label}: ${Auth.fullName(item) || item.login}`);
    select.disabled = self && field === 'role';
    select.addEventListener('change', () => saveUser(item.login, field, select));
    return select;
  });

  const remove = el('button', 'icon-button danger');
  remove.type = 'button';
  remove.disabled = self;
  remove.title = self ? 'Нельзя удалить свою учётную запись' : 'Удалить пользователя';
  remove.setAttribute('aria-label', `Удалить: ${Auth.fullName(item) || item.login}`);
  remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
  remove.addEventListener('click', () => {
    if (!confirm(`Удалить пользователя ${Auth.fullName(item) || item.login}?`)) return;
    const result = Auth.deleteUser(item.login);
    showToast(result.ok ? 'Пользователь удалён' : result.error);
    if (result.ok) renderUsers();
  });

  const cells = [person, ...selects, remove].map(content => {
    const cell = el('td');
    cell.append(content);
    return cell;
  });
  cells[3].className = 'cell-actions';
  row.append(...cells);
  return row;
}

function renderUsers(highlight = '') {
  usersBody.replaceChildren(...Auth.listUsers().map(item => userRow(item, item.login === highlight)));
  updatePendingCount();
}

// Плашка переезжает под активный пункт; первый раз встаёт на место без анимации
function movePill() {
  const link = sectionLinks.find(item => item.hasAttribute('aria-current'));
  if (!link) return;
  menuPill.style.width = `${link.offsetWidth}px`;
  menuPill.style.height = `${link.offsetHeight}px`;
  menuPill.style.transform = `translate(${link.offsetLeft}px, ${link.offsetTop}px)`;
  if (!menuPill.classList.contains('is-ready')) {
    menuPill.getBoundingClientRect();
    menuPill.classList.add('is-ready');
  }
}

function showSection(name) {
  const known = sections.some(section => section.dataset.section === name);
  if (!known || (sectionAccess[name] && !Auth.can(user, sectionAccess[name]))) name = 'profile';
  sections.forEach(section => { section.hidden = section.dataset.section !== name; });
  sectionLinks.forEach(link => {
    if (link.dataset.sectionLink === name) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });
  movePill();
  if (name === 'users') renderUsers();
  if (name === 'department') renderDepartment(Auth.can(user, 'users') ? deptSelect.value : user.department);
  window.scrollTo({top:0});
}

profileForm.addEventListener('submit', e => {
  e.preventDefault();
  const fields = profileForm.elements;
  const result = Auth.updateProfile({lastName:fields.lastName.value, firstName:fields.firstName.value});
  if (!result.ok) {
    showMessage('profile-message', result.error);
    return;
  }
  showMessage('profile-message', '');
  refreshSelf();
  showToast('Профиль сохранён');
});

passwordForm.addEventListener('submit', async e => {
  e.preventDefault();
  const fields = passwordForm.elements;
  if (fields.password.value !== fields.repeat.value) {
    showMessage('password-message', 'Новые пароли не совпадают');
    return;
  }
  const result = await Auth.changePassword(fields.current.value, fields.password.value);
  if (!result.ok) {
    showMessage('password-message', result.error);
    return;
  }
  passwordForm.reset();
  showMessage('password-message', '');
  showToast('Пароль изменён');
});

userForm.addEventListener('submit', async e => {
  e.preventDefault();
  const fields = userForm.elements;
  const result = await Auth.createUser({
    lastName:fields.lastName.value,
    firstName:fields.firstName.value,
    login:fields.login.value,
    password:fields.password.value,
    department:fields.department.value,
    role:fields.role.value
  });
  if (!result.ok) {
    showMessage('user-message', result.error);
    return;
  }
  userForm.reset();
  showMessage('user-message', '');
  renderUsers(result.user.login);
  showToast('Пользователь добавлен');
});

deptSelect.addEventListener('change', () => {
  renderDepartment(deptSelect.value);
  showDepartmentCloud(deptSelect.value);
});

document.getElementById('logout').addEventListener('click', () => {
  Auth.logout();
  location.replace('login.html');
});

window.addEventListener('hashchange', () => showSection(location.hash.slice(1)));
window.addEventListener('resize', movePill);
document.fonts.ready.then(movePill);

if (user) {
  fillOptions(deptSelect, Auth.departments, user.department);
  fillOptions(userForm.elements.department, Auth.departments, Object.keys(Auth.departments)[0]);
  fillOptions(userForm.elements.role, Auth.roles, 'employee');
  applyAccess();
  renderIdentity();
  fillProfile();
  updatePendingCount();
  showSection(location.hash.slice(1));
  showDepartmentCloud(user.department);
}
