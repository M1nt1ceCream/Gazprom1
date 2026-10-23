// Демо-авторизация без сервера: пользователи и сессия хранятся в localStorage этого браузера.
// Сайт статический (GitHub Pages), поэтому регистрации видны только в том браузере, где сделаны.
// Для общей базы пользователей заменить на сервер или облачную БД с тем же интерфейсом window.Auth.
(function () {
  const usersKey = 'gazprom1-users-v3';
  const sessionKey = 'gazprom1-session-v3';
  const minPassword = 4;
  const loginPattern = /^[a-z0-9._-]{3,32}$/;

  // access: map — карта, department — кабинет отдела, team — сотрудники отдела, users — управление пользователями
  const roles = {
    admin:{name:'Администратор', access:['map', 'department', 'team', 'users']},
    head:{name:'Руководитель отдела', access:['map', 'department', 'team']},
    employee:{name:'Сотрудник', access:['map', 'department']},
    pending:{name:'Ожидает подтверждения', access:[]}
  };

  // Отделы. Наполнение кабинетов уточняется: у отдела можно задать
  // lead — подзаголовок кабинета, widgets — карточки разделов [{title, text}],
  // cloud — картинка для облака точек справа в кабинете: {src, leftBoost — во сколько раз
  // поднять яркость у левого края, если объект на картинке слева темнее, exposure — общий
  // множитель яркости, contrast — сделать грани чётче, а светлые точки ярче}
  const departments = {
    engineering:{name:'Инженерно-технический', cloud:{src:'assets/departments/engineering.jpg', leftBoost:2.4}},
    kmns:{name:'КМНС', cloud:{src:'assets/departments/kmns.jpg'}},
    finance:{name:'Финансово-экономический', cloud:{src:'assets/departments/economy.jpg'}},
    ecology:{name:'Экология', cloud:{src:'assets/departments/ecology.jpg'}}
  };

  // Стартовый администратор: 1cem1nt / 1cem1nt
  const seedUsers = [
    {login:'1cem1nt', password:'plain:1cem1nt', lastName:'Администратор', firstName:'', role:'admin', department:'engineering', createdAt:'2026-10-23T00:00:00.000Z'}
  ];

  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function loadUsers() {
    const users = read(usersKey);
    if (Array.isArray(users) && users.length) return users;
    const seeded = seedUsers.map(user => ({...user}));
    write(usersKey, seeded);
    return seeded;
  }

  function saveUsers(users) {
    if (!write(usersKey, users)) throw new Error('Не удалось сохранить данные в браузере');
  }

  function normalizeLogin(login) {
    return String(login || '').trim().toLowerCase();
  }

  function cleanName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function publicUser(user) {
    const {password, ...rest} = user;
    return {...rest, access:(roles[user.role] || roles.pending).access};
  }

  async function hashPassword(login, password) {
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`gazprom1:${login}:${password}`));
      return 'sha256:' + [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    return 'plain:' + password;
  }

  async function passwordMatches(user, password) {
    if (user.password.startsWith('plain:')) return user.password === 'plain:' + password;
    return user.password === await hashPassword(user.login, password);
  }

  function passwordError(password) {
    return String(password || '').length < minPassword ? `Пароль должен быть не короче ${minPassword} символов` : '';
  }

  function newUserError(data, users) {
    if (!loginPattern.test(normalizeLogin(data.login))) return 'Логин: 3–32 символа — латиница, цифры, точка, дефис или подчёркивание';
    if (users.some(item => item.login === normalizeLogin(data.login))) return 'Такой логин уже занят';
    if (!cleanName(data.lastName) || !cleanName(data.firstName)) return 'Укажите фамилию и имя';
    return passwordError(data.password) || (departments[data.department] ? '' : 'Выберите отдел');
  }

  function sessionLogin() {
    const session = read(sessionKey);
    return session && session.login;
  }

  function startSession(login) {
    write(sessionKey, {login, at:Date.now()});
  }

  function adminError() {
    const actor = loadUsers().find(user => user.login === sessionLogin());
    return actor && actor.role === 'admin' ? '' : 'Действие доступно только администратору';
  }

  function adminCount(users) {
    return users.filter(user => user.role === 'admin').length;
  }

  function currentPage() {
    return (location.pathname.split('/').pop() || 'index.html') + location.search + location.hash;
  }

  const Auth = {
    roles,
    departments,
    minPassword,

    currentUser() {
      const login = sessionLogin();
      const user = login && loadUsers().find(item => item.login === login);
      return user ? publicUser(user) : null;
    },

    // Без входа — на страницу входа, без нужного доступа — в личный кабинет
    requireUser(access) {
      const user = this.currentUser();
      if (!user) location.replace('login.html?next=' + encodeURIComponent(currentPage()));
      else if (access && !this.can(user, access)) location.replace('account.html');
      return user;
    },

    can(user, access) {
      return Boolean(user) && user.access.includes(access);
    },

    findUser(login) {
      const user = loadUsers().find(item => item.login === normalizeLogin(login));
      return user ? publicUser(user) : null;
    },

    async login(login, password) {
      const users = loadUsers();
      const user = users.find(item => item.login === normalizeLogin(login));
      if (!user || !(await passwordMatches(user, password))) return {ok:false, error:'Неверный логин или пароль'};
      if (user.password.startsWith('plain:')) {
        user.password = await hashPassword(user.login, password);
        saveUsers(users);
      }
      startSession(user.login);
      return {ok:true, user:publicUser(user)};
    },

    // Новые пользователи ждут, пока администратор назначит роль
    async register(data) {
      const users = loadUsers();
      const error = newUserError(data, users);
      if (error) return {ok:false, error};
      const login = normalizeLogin(data.login);
      const user = {
        login,
        password:await hashPassword(login, data.password),
        lastName:cleanName(data.lastName),
        firstName:cleanName(data.firstName),
        role:'pending',
        department:data.department,
        createdAt:new Date().toISOString()
      };
      users.push(user);
      saveUsers(users);
      startSession(login);
      return {ok:true, user:publicUser(user)};
    },

    logout() {
      try {
        localStorage.removeItem(sessionKey);
      } catch {}
    },

    // Демо-сброс: письмо не отправляется, пароль меняется сразу по существующему логину
    async resetPassword(login, password) {
      const error = passwordError(password);
      if (error) return {ok:false, error};
      const users = loadUsers();
      const user = users.find(item => item.login === normalizeLogin(login));
      if (!user) return {ok:false, error:'Пользователь с таким логином не найден'};
      user.password = await hashPassword(user.login, password);
      saveUsers(users);
      return {ok:true};
    },

    async changePassword(current, password) {
      const users = loadUsers();
      const user = users.find(item => item.login === sessionLogin());
      if (!user) return {ok:false, error:'Сессия истекла, войдите снова'};
      if (!(await passwordMatches(user, current))) return {ok:false, error:'Текущий пароль указан неверно'};
      const error = passwordError(password);
      if (error) return {ok:false, error};
      user.password = await hashPassword(user.login, password);
      saveUsers(users);
      return {ok:true};
    },

    updateProfile({lastName, firstName}) {
      const users = loadUsers();
      const user = users.find(item => item.login === sessionLogin());
      if (!user) return {ok:false, error:'Сессия истекла, войдите снова'};
      if (!cleanName(lastName) || !cleanName(firstName)) return {ok:false, error:'Укажите фамилию и имя'};
      user.lastName = cleanName(lastName);
      user.firstName = cleanName(firstName);
      saveUsers(users);
      return {ok:true, user:publicUser(user)};
    },

    // Сотрудники отдела без заявок на подтверждение
    team(department) {
      return loadUsers()
        .filter(user => user.department === department && user.role !== 'pending')
        .map(publicUser)
        .sort((a, b) => this.fullName(a).localeCompare(this.fullName(b), 'ru'));
    },

    // Заявки на подтверждение — первыми
    listUsers() {
      return loadUsers()
        .map(publicUser)
        .sort((a, b) => (a.role !== 'pending') - (b.role !== 'pending') || this.fullName(a).localeCompare(this.fullName(b), 'ru'));
    },

    updateUser(login, changes) {
      const denied = adminError();
      if (denied) return {ok:false, error:denied};
      const users = loadUsers();
      const user = users.find(item => item.login === normalizeLogin(login));
      if (!user) return {ok:false, error:'Пользователь не найден'};
      if (changes.role && !roles[changes.role]) return {ok:false, error:'Неизвестная роль'};
      if (changes.department && !departments[changes.department]) return {ok:false, error:'Неизвестный отдел'};
      if (user.role === 'admin' && changes.role && changes.role !== 'admin' && adminCount(users) === 1) {
        return {ok:false, error:'Должен остаться хотя бы один администратор'};
      }
      if (changes.role) user.role = changes.role;
      if (changes.department) user.department = changes.department;
      saveUsers(users);
      return {ok:true, user:publicUser(user)};
    },

    async createUser(data) {
      const denied = adminError();
      if (denied) return {ok:false, error:denied};
      const users = loadUsers();
      const error = newUserError(data, users) || (roles[data.role] ? '' : 'Выберите роль');
      if (error) return {ok:false, error};
      const login = normalizeLogin(data.login);
      const user = {
        login,
        password:await hashPassword(login, data.password),
        lastName:cleanName(data.lastName),
        firstName:cleanName(data.firstName),
        role:data.role,
        department:data.department,
        createdAt:new Date().toISOString()
      };
      users.push(user);
      saveUsers(users);
      return {ok:true, user:publicUser(user)};
    },

    deleteUser(login) {
      const denied = adminError();
      if (denied) return {ok:false, error:denied};
      const users = loadUsers();
      const index = users.findIndex(item => item.login === normalizeLogin(login));
      if (index === -1) return {ok:false, error:'Пользователь не найден'};
      if (users[index].login === sessionLogin()) return {ok:false, error:'Нельзя удалить свою учётную запись'};
      if (users[index].role === 'admin' && adminCount(users) === 1) return {ok:false, error:'Должен остаться хотя бы один администратор'};
      users.splice(index, 1);
      saveUsers(users);
      return {ok:true};
    },

    fullName(user) {
      return [user.lastName, user.firstName].filter(Boolean).join(' ');
    },

    initials(user) {
      return ((user.firstName || '').charAt(0) + (user.lastName || '').charAt(0)).toUpperCase() || '?';
    },

    // Возврат после входа — только на свои страницы
    safeNext(next) {
      return /^(index|account)\.html(#[\w-]*)?$/.test(next || '') ? next : 'index.html';
    }
  };

  window.Auth = Auth;
})();
