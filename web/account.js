let user = Auth.currentUser();
const sections = [...document.querySelectorAll('[data-section]')];
const sectionLinks = [...document.querySelectorAll('[data-section-link]')];
const sectionAccess = {department:'department', news:'department', users:'users'};
const profileForm = document.getElementById('profile-form');
const passwordForm = document.getElementById('password-form');
const userForm = document.getElementById('user-form');
const usersBody = document.getElementById('users-body');
const deptSelect = document.getElementById('dept-select');
const guestDept = document.getElementById('guest-dept');
const newsForm = document.getElementById('news-form');
const newsImage = document.getElementById('news-image');
const newsPreview = document.getElementById('news-preview');
let viewedDepartment = '';
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

function isGuest() {
  return user.role === 'guest';
}

// Гостю вместо плашки роли — выбор отдела, без смены пароля и сохранения профиля.
// Просмотр любого отдела — только у администратора, добавление пользователей — у администраторов
function applyAccess() {
  document.querySelectorAll('[data-access]').forEach(node => { node.hidden = !Auth.can(user, node.dataset.access); });
  document.querySelectorAll('[data-pending-only]').forEach(node => { node.hidden = user.role !== 'pending'; });
  document.querySelectorAll('[data-guest-only]').forEach(node => { node.hidden = !isGuest(); });
  document.querySelectorAll('[data-admin-only]').forEach(node => { node.hidden = user.role !== 'admin'; });
  document.querySelectorAll('[data-editor-only]').forEach(node => { node.hidden = !Auth.canEditUsers(user); });
  if (isGuest()) document.querySelectorAll('[data-no-guest]').forEach(node => { node.hidden = true; });
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
  fields.lastName.readOnly = fields.firstName.readOnly = isGuest();
}

function refreshSelf() {
  user = Auth.currentUser();
  applyAccess();
  renderIdentity();
  fillProfile();
}

// Справа облако точек из картинки отдела; у отдела без картинки точки рассеиваются.
// Холст .cloud-side сейчас со страницы убран — без него функция ничего не делает
function showDepartmentCloud(key) {
  const {src = null, ...options} = (Auth.departments[key] && Auth.departments[key].cloud) || {};
  if (sideCloud && sideCloud.cloud) sideCloud.cloud.show(src, options);
}

// В кабинете — только два ряда свежих новостей, остальные на странице «Показать все»
function renderNews() {
  document.getElementById('news-grid').replaceChildren(...News.list().slice(0, 8).map(item => News.tile(item)));
}

// Разделы «Мой Ямал» и «Новости» показывают отдел пользователя, а администратору — выбранный в карточке.
// В «Новостях» КМНС читает новости, остальные отделы их публикуют
function renderDepartment(key) {
  const dept = Auth.departments[key] || Object.values(Auth.departments)[0];
  const widgets = dept.widgets || [];
  const isAudience = key === News.audience;
  viewedDepartment = Auth.departments[key] ? key : Object.keys(Auth.departments)[0];
  document.getElementById('dept-news').hidden = !isAudience;
  document.getElementById('dept-post').hidden = isAudience;
  if (isAudience) renderNews();
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

// Заявки, которые этот пользователь может подтвердить
function updatePendingCount() {
  if (!Auth.can(user, 'users')) return;
  const count = Auth.listUsers().filter(item => item.role === 'pending' && Auth.canManage(item)).length;
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

// Роли, которые этот пользователь может назначать: администратор отдела — все, кроме администратора
function rolesToAssign() {
  if (user.role === 'admin') return Auth.assignableRoles;
  const {admin, ...rest} = Auth.assignableRoles;
  return rest;
}

function userRow(item, isNew) {
  const self = item.login === user.login;
  const pending = item.role === 'pending';
  const editable = Auth.canManage(item);
  const row = el('tr', [isNew ? 'is-new' : '', pending ? 'is-pending' : ''].join(' ').trim());

  const person = el('div', 'user-cell');
  const copy = el('div');
  const meta = pending ? `${item.login} · заявка от ${dateFormat.format(new Date(item.createdAt))}` : item.login;
  copy.append(el('b', '', Auth.fullName(item) || item.login), el('small', '', self ? `${item.login} · это вы` : meta));
  person.append(el('span', 'avatar avatar-sm', Auth.initials(item)), copy);

  // Чужих сотрудников видно, но не изменить; переводить между отделами может только администратор
  const roleItems = editable ? rolesToAssign() : Auth.assignableRoles;
  const selects = [['department', Auth.departments, 'Отдел'], ['role', roleItems, 'Роль']].map(([field, items, label]) => {
    const select = el('select', 'select');
    fillOptions(select, items, item[field]);
    select.dataset.value = item[field];
    select.setAttribute('aria-label', `${label}: ${Auth.fullName(item) || item.login}`);
    select.disabled = !editable || (field === 'role' ? self : user.role !== 'admin');
    select.addEventListener('change', () => saveUser(item.login, field, select));
    return select;
  });

  const remove = el('button', 'icon-button danger');
  remove.type = 'button';
  remove.hidden = !editable;
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

// Пользователи по отделам: над каждым отделом строка с числом людей и его администраторами
function renderUsers(highlight = '') {
  const users = Auth.listUsers();
  const rows = [];
  let group = null;
  users.forEach(item => {
    if (item.department !== group) {
      group = item.department;
      const members = users.filter(other => other.department === group);
      const admins = members.filter(other => other.role === 'deptAdmin').map(other => Auth.fullName(other) || other.login);
      const head = el('tr', 'group-row');
      const cell = el('th');
      cell.colSpan = 4;
      cell.scope = 'colgroup';
      cell.append(el('b', '', departmentName(group)), el('span', '', ` · ${members.length}`));
      if (admins.length) cell.append(el('span', 'group-admin', `Админ отдела: ${admins.join(', ')}`));
      head.append(cell);
      rows.push(head);
    }
    rows.push(userRow(item, item.login === highlight));
  });
  usersBody.replaceChildren(...rows);
  updatePendingCount();
}

function renderUsersLead() {
  const lead = document.getElementById('users-lead');
  if (isGuest()) lead.textContent = 'Гостевой режим: пользователей можно смотреть, но не изменять.';
  else if (user.role === 'deptAdmin') lead.textContent = `Вы администратор отдела «${departmentName(user.department)}»: подтверждаете заявки, меняете роли и удаляете сотрудников своего отдела. Остальных можно только смотреть.`;
  else lead.textContent = 'Все пользователи по отделам, заявки на подтверждение — первыми. Назначьте отдел и роль — доступ изменится сразу.';
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
  // На телефоне меню — строка с прокруткой: активный пункт по центру
  const links = link.parentElement;
  if (links.scrollWidth > links.clientWidth) {
    links.scrollTo({left:link.offsetLeft - (links.clientWidth - link.offsetWidth) / 2, behavior:'smooth'});
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
  if (name === 'department' || name === 'news') renderDepartment(user.role === 'admin' ? deptSelect.value : user.department);
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

guestDept.addEventListener('change', () => {
  const result = Auth.setGuestDepartment(guestDept.value);
  if (!result.ok) {
    showToast(result.error);
    return;
  }
  refreshSelf();
  renderDepartment(user.department);
  showDepartmentCloud(user.department);
  showToast(`Вы вошли как: ${departmentName(user.department)}`);
});

deptSelect.addEventListener('change', () => {
  if (!['#department', '#news'].includes(location.hash)) location.hash = 'department';
  else renderDepartment(deptSelect.value);
  showDepartmentCloud(deptSelect.value);
});

function resetNewsForm() {
  newsForm.reset();
  newsForm.elements.level.value = 'normal';
  newsPreview.hidden = true;
  newsPreview.removeAttribute('src');
  newsForm.querySelector('.upload').classList.remove('has-image');
  newsForm.querySelector('.upload-hint b').textContent = 'Загрузить фото';
}

newsImage.addEventListener('change', () => {
  const file = newsImage.files[0];
  if (newsPreview.src) URL.revokeObjectURL(newsPreview.src);
  newsPreview.hidden = !file;
  newsForm.querySelector('.upload').classList.toggle('has-image', Boolean(file));
  newsForm.querySelector('.upload-hint b').textContent = file ? 'Заменить фото' : 'Загрузить фото';
  if (file) newsPreview.src = URL.createObjectURL(file);
});

newsForm.addEventListener('submit', async e => {
  e.preventDefault();
  const fields = newsForm.elements;
  const button = newsForm.querySelector('[type="submit"]');
  const message = document.getElementById('news-message');
  button.disabled = true;
  const result = await News.add({
    title:fields.title.value,
    text:fields.text.value,
    level:fields.level.value,
    file:newsImage.files[0]
  }, {department:viewedDepartment, name:Auth.fullName(user) || user.login});
  button.disabled = false;
  message.classList.toggle('is-success', result.ok);
  if (!result.ok) {
    message.textContent = result.error;
    return;
  }
  resetNewsForm();
  const link = el('a', '', 'Открыть новость');
  link.href = `news.html?id=${encodeURIComponent(result.news.id)}`;
  message.replaceChildren('Опубликовано для КМНС · ', link);
  showToast('Новость опубликована');
});

document.getElementById('logout').addEventListener('click', () => {
  Auth.logout();
  location.replace('login.html');
});

window.addEventListener('hashchange', () => showSection(location.hash.slice(1)));
window.addEventListener('resize', movePill);
document.fonts.ready.then(movePill);

if (user) {
  // Со страницы новости администратор возвращается в кабинет КМНС (?dept=kmns)
  const requestedDept = new URLSearchParams(location.search).get('dept');
  fillOptions(deptSelect, Auth.departments, Auth.departments[requestedDept] ? requestedDept : user.department);
  fillOptions(guestDept, Auth.departments, user.department);
  // Администратор отдела добавляет людей только в свой отдел
  const formDepartments = user.role === 'admin' ? Auth.departments : {[user.department]:Auth.departments[user.department]};
  fillOptions(userForm.elements.department, formDepartments, user.role === 'admin' ? Object.keys(Auth.departments)[0] : user.department);
  fillOptions(userForm.elements.role, rolesToAssign(), 'employee');
  renderUsersLead();
  fillOptions(newsForm.elements.level, News.levels, 'normal');
  document.getElementById('news-legend').replaceChildren(...News.legend());
  applyAccess();
  renderIdentity();
  fillProfile();
  updatePendingCount();
  showSection(location.hash.slice(1) || (Auth.can(user, 'department') ? 'news' : 'profile'));
  showDepartmentCloud(user.department);
}
