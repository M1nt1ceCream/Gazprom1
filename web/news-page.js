const user = Auth.currentUser();
const newsId = new URLSearchParams(location.search).get('id');
const item = newsId && News.get(newsId);
const dateFormat = new Intl.DateTimeFormat('ru-RU', {day:'numeric', month:'long', year:'numeric'});

function renderIdentity() {
  document.querySelectorAll('[data-user-initials]').forEach(node => { node.textContent = Auth.initials(user); });
  document.querySelectorAll('[data-user-name]').forEach(node => { node.textContent = Auth.fullName(user) || user.login; });
  document.querySelectorAll('[data-user-role]').forEach(node => { node.textContent = Auth.roles[user.role] ? Auth.roles[user.role].name : user.role; });
}

// Текст новости — абзацы по пустой строке
function renderNews() {
  const level = News.levels[item.level] || News.levels.info;
  const dept = Auth.departments[item.department];
  document.title = `Газпром 1 — ${item.title}`;
  document.getElementById('news-image').src = item.image;
  document.getElementById('news-title').textContent = item.title;
  document.getElementById('news-level').textContent = level.name;
  document.getElementById('news-level-dot').style.setProperty('--level', level.color);
  document.getElementById('news-meta').textContent = [dept ? dept.name : '', dateFormat.format(new Date(item.createdAt)), item.author].filter(Boolean).join(' · ');
  document.getElementById('news-text').replaceChildren(...item.text.split(/\n\s*\n/).map(paragraph => {
    const node = document.createElement('p');
    node.textContent = paragraph;
    return node;
  }));
  if (item.credit) {
    const credit = document.getElementById('news-credit');
    const link = document.createElement('a');
    link.href = item.credit.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Wikimedia Commons';
    credit.append(`Фото: ${item.credit.author}, ${item.credit.license}, `, link);
    credit.hidden = false;
  }
  document.getElementById('news-article').hidden = false;
}

// Без id — все новости плитками, назад — в кабинет КМНС
function renderAll() {
  const back = document.getElementById('news-back');
  back.href = 'account.html?dept=kmns#news';
  back.querySelector('span').textContent = 'В кабинет';
  document.title = 'Газпром 1 — новости КМНС';
  document.getElementById('news-legend').replaceChildren(...News.legend());
  document.getElementById('news-all-grid').replaceChildren(...News.list().map(entry => News.tile(entry)));
  document.getElementById('news-all').hidden = false;
}

document.getElementById('logout').addEventListener('click', event => {
  Auth.logout();
  PageTransition.go('login.html', {from:event.currentTarget, replace:true});
});

if (user) {
  renderIdentity();
  if (!newsId) renderAll();
  else if (item) renderNews();
  else document.getElementById('news-missing').hidden = false;
}
