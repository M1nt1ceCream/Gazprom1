// Новости для КМНС. Демо без сервера, как auth.js: опубликованные новости хранятся в localStorage
// этого браузера, примеры с фото из assets/news заданы ниже. Другие отделы публикуют новости
// в своём кабинете, КМНС видит их плитками у себя.
(function () {
  const storeKey = 'gazprom1-news-v1';
  const audience = 'kmns';
  const maxImageSide = 1200;
  const imageQuality = .82;
  const tileDate = new Intl.DateTimeFormat('ru-RU', {day:'numeric', month:'long'});

  // Уровни важности — цвет кружка на плитке
  const levels = {
    important:{name:'Важная', color:'#f2c94c'},
    normal:{name:'Обычная', color:'#4cc38a'},
    info:{name:'К сведению', color:'#4aa8ff'}
  };

  // Фото примеров — Wikimedia Commons, автор и лицензия в credit (показываются на странице новости)
  const seedNews = [
    {
      id:'demo-reindeer', level:'important', department:'ecology', createdAt:'2026-10-27T09:30:00+05:00',
      title:'Маршруты каслания на зиму согласованы с оленеводами',
      text:'Отдел экологии вместе с общинами согласовал маршруты зимних перекочёвок. Переходы через трассы и площадки обустроят до 15 ноября.\n\nСхема маршрутов и места переходов будут доступны на карте геопортала.',
      image:'assets/news/reindeer.jpg',
      credit:{author:'Viktor Zagumyonnov', license:'CC BY-SA 4.0', url:'https://commons.wikimedia.org/wiki/File:Reindeer_herders_Yamal_1975.jpg'}
    },
    {
      id:'demo-icebreaker', level:'info', department:'engineering', createdAt:'2026-10-26T15:10:00+05:00',
      title:'Ледокольная проводка в Обской губе — график на ноябрь',
      text:'Инженерно-технический отдел опубликовал график ледокольной проводки на ноябрь. В период проводки выход на лёд вблизи фарватера запрещён.\n\nАктуальные окна проводки уточняются еженедельно.',
      image:'assets/news/icebreaker.jpg',
      credit:{author:'Brocken Inaglory, ред. AFBorchert', license:'CC BY 3.0', url:'https://commons.wikimedia.org/wiki/File:Icebreaker_Kapitan_Khlebnikov_in_Arctic.jpg'}
    },
    {
      id:'demo-camp', level:'normal', department:'finance', createdAt:'2026-10-24T11:00:00+05:00',
      title:'Приём заявок на поддержку стойбищ продлён до 30 ноября',
      text:'Финансово-экономический отдел продлил приём заявок на поддержку кочевых семей: топливо, генераторы и средства связи.\n\nЗаявку можно передать через представителя КМНС.',
      image:'assets/news/camp.jpg',
      credit:{author:'Sergey.vlad.popov', license:'CC BY-SA 4.0', url:'https://commons.wikimedia.org/wiki/File:%D0%A1%D1%82%D0%BE%D0%B9%D0%B1%D0%B8%D1%89%D0%B5_%D0%BD%D0%B5%D0%BD%D1%86%D0%B5%D0%B2.jpg'}
    },
    {
      id:'demo-sea-ice', level:'important', department:'engineering', createdAt:'2026-10-22T08:45:00+05:00',
      title:'Ледовая обстановка: припай формируется раньше обычного',
      text:'По данным наблюдений, припай в южной части губы формируется на неделю раньше средних сроков. Выход на лёд до официального открытия переправ небезопасен.',
      image:'assets/news/sea-ice.jpg',
      credit:{author:'Matti&Keti', license:'CC BY-SA 4.0', url:'https://commons.wikimedia.org/wiki/File:North_Pole,_Arctic_Ocean,_sea_ice_04.jpg'}
    },
    {
      id:'demo-archive', level:'info', department:'ecology', createdAt:'2026-10-20T13:20:00+05:00',
      title:'Фотоархив Ямала 1970–80-х оцифрован',
      text:'Снимки жизни тундры и стойбищ из архива переведены в цифровой вид. Подборка будет передана в школы и дома культуры района.',
      image:'assets/news/archive.jpg',
      credit:{author:'Viktor Zagumyonnov', license:'CC BY-SA 4.0', url:'https://commons.wikimedia.org/wiki/File:Nenets_host,_Yamal_1982.jpg'}
    },
    {
      id:'demo-iceberg', level:'normal', department:'ecology', createdAt:'2026-10-17T10:00:00+05:00',
      title:'Летний экологический мониторинг акватории завершён',
      text:'Отдел экологии завершил летний сезон наблюдений за состоянием воды и прибрежной зоны. Сводный отчёт будет представлен на встрече с общинами.',
      image:'assets/news/iceberg.jpg',
      credit:{author:'AWeith', license:'CC BY-SA 4.0', url:'https://commons.wikimedia.org/wiki/File:Iceberg_in_the_Arctic_with_its_underside_exposed.jpg'}
    },
    {
      id:'demo-ob-river', level:'info', department:'engineering', createdAt:'2026-10-15T16:30:00+05:00',
      title:'Зимник через Обь: сроки открытия',
      text:'Открытие зимней переправы запланировано после достижения расчётной толщины льда. О дате открытия сообщим отдельно.',
      image:'assets/news/ob-river.jpg',
      credit:{author:'Dmitry Karyshev', license:'CC BY 2.0', url:'https://commons.wikimedia.org/wiki/File:March_evening._The_sun_fell_across_the_Ob_river.jpg'}
    },
    {
      id:'demo-aurora', level:'normal', department:'finance', createdAt:'2026-10-14T12:00:00+05:00',
      title:'Конкурс фотографий «Северное сияние»',
      text:'Принимаются снимки жителей района: природа, быт, праздники. Лучшие работы войдут в календарь на следующий год.',
      image:'assets/news/aurora.jpg',
      credit:{author:'Pavel.shyshkouski', license:'CC BY-SA 4.0', url:'https://commons.wikimedia.org/wiki/File:Aurora_in_Abisko_near_Tornetr%C3%A4sk.jpg'}
    }
  ];

  function readStored() {
    try {
      const items = JSON.parse(localStorage.getItem(storeKey));
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  }

  function writeStored(items) {
    try {
      localStorage.setItem(storeKey, JSON.stringify(items));
      return true;
    } catch {
      return false;
    }
  }

  function cleanText(value) {
    return String(value || '').trim().replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  }

  // Фото уменьшается до maxImageSide и сохраняется как JPEG, чтобы влезть в localStorage
  function readImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, maxImageSide / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', imageQuality));
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Не удалось прочитать фото'));
      };
      image.src = url;
    });
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  const News = {
    levels,
    audience,

    // Пилюля важности: цвет уровня в --level
    levelPill(levelKey) {
      const level = levels[levelKey] || levels.info;
      const pill = node('i', 'level-dot');
      pill.style.setProperty('--level', level.color);
      return pill;
    },

    legend() {
      return Object.keys(levels).map(key => {
        const item = node('li');
        item.append(this.levelPill(key), levels[key].name);
        return item;
      });
    },

    // Плитка новости: фото под синим градиентом, дата, снизу заголовок и пилюля важности
    tile(item) {
      const level = levels[item.level] || levels.info;
      const link = node('a', 'news-tile');
      link.href = `news.html?id=${encodeURIComponent(item.id)}`;
      link.setAttribute('aria-label', `${item.title}. ${level.name}`);
      const image = node('img');
      image.src = item.image;
      image.alt = '';
      image.loading = 'lazy';
      const caption = node('span', 'news-tile-caption');
      const pill = this.levelPill(item.level);
      pill.title = level.name;
      caption.append(node('b', '', item.title), pill);
      link.append(image, node('span', 'news-tile-date', tileDate.format(new Date(item.createdAt))), caption);
      const cell = node('li');
      cell.append(link);
      return cell;
    },

    // Свежие — первыми
    list() {
      return [...readStored(), ...seedNews].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    get(id) {
      return this.list().find(item => item.id === id) || null;
    },

    async add({title, text, level, file}, author) {
      if (!file) return {ok:false, error:'Добавьте фото'};
      if (!/^image\//.test(file.type)) return {ok:false, error:'Нужен файл изображения — JPG, PNG или WebP'};
      if (!cleanText(title)) return {ok:false, error:'Укажите заголовок'};
      if (!cleanText(text)) return {ok:false, error:'Напишите текст объявления'};
      if (!levels[level]) return {ok:false, error:'Выберите важность'};
      if (!author || !author.department) return {ok:false, error:'Сессия истекла, войдите снова'};
      let image;
      try {
        image = await readImage(file);
      } catch (error) {
        return {ok:false, error:error.message};
      }
      const item = {
        id:'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title:cleanText(title),
        text:cleanText(text),
        level,
        department:author.department,
        author:author.name,
        image,
        createdAt:new Date().toISOString()
      };
      const items = readStored();
      items.unshift(item);
      if (!writeStored(items)) return {ok:false, error:'Не хватило места в браузере для фото — выберите снимок поменьше'};
      return {ok:true, news:item};
    }
  };

  window.News = News;
})();
