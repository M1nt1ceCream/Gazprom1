const center = [71.5, 72.0];
const bbox = [68.0, 66.0, 74.5, 74.0];
const cacheKey = 'obskaya-guba-osm-features-v1';
const cacheMaxAge = 3 * 60 * 60 * 1000;
const categoryLabels = {
  settlements:'Населённый пункт',
  harbours:'Порт или гавань',
  piers:'Причал',
  ferries:'Паромная переправа'
};
const categoryStyles = {
  settlements:{color:'#386f7a',fillColor:'#67a4ae',radius:5},
  harbours:{color:'#365e7b',fillColor:'#588eb2',radius:6},
  piers:{color:'#786941',fillColor:'#c2a85d',radius:5},
  ferries:{color:'#8a5b30',fillColor:'#d3914f',radius:6}
};
const map = L.map('map', {zoomControl:false, preferCanvas:true}).setView(center, 6);
L.control.zoom({position:'bottomright'}).addTo(map);

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom:19,
  attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);
const layers = Object.fromEntries(Object.keys(categoryLabels).map(key => [key,L.featureGroup().addTo(map)]));
const markers = [];

document.getElementById('osm-toggle').addEventListener('change', e => e.target.checked ? osm.addTo(map) : map.removeLayer(osm));
document.querySelectorAll('.object-toggle').forEach(input => {
  input.addEventListener('change', () => input.checked ? layers[input.dataset.layer].addTo(map) : map.removeLayer(layers[input.dataset.layer]));
});
document.getElementById('home').addEventListener('click', () => map.setView(center, 6));

function formatCoordinate(value, positive, negative) {
  return `${Math.abs(value).toFixed(2)}° ${value >= 0 ? positive : negative}`;
}
function updateMapReadout() {
  const centerPoint = map.getCenter();
  document.getElementById('coords').textContent = `${formatCoordinate(centerPoint.lat,'с. ш.','ю. ш.')}  ${formatCoordinate(centerPoint.lng,'в. д.','з. д.')}`;
  const metersPerPixel = 156543.03392 * Math.cos(centerPoint.lat * Math.PI / 180) / (2 ** map.getZoom());
  const scale = Math.round((metersPerPixel * 3779.53) / 1000) * 1000;
  document.getElementById('map-scale').textContent = `Масштаб 1:${scale.toLocaleString('ru-RU')}`;
}
map.on('moveend zoomend', updateMapReadout);
map.on('mousemove', e => {
  document.getElementById('coords').textContent = `${formatCoordinate(e.latlng.lat,'с. ш.','ю. ш.')}  ${formatCoordinate(e.latlng.lng,'в. д.','з. д.')}`;
});
updateMapReadout();

const status = document.getElementById('status');
const statusDot = document.querySelector('.status-dot');
const count = document.getElementById('feature-count');
const updated = document.getElementById('updated');
const refreshButton = document.getElementById('refresh');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('map-search');
const datalist = document.getElementById('feature-options');
const sidebarToggle = document.getElementById('layers-toggle');
const sidebar = document.getElementById('map-layers');
const userChip = document.getElementById('user-chip');
const currentUser = Auth.currentUser();

// Карта открыта всем: без входа вместо аватара — кнопка «Войти»
if (currentUser) {
  userChip.querySelector('.avatar').textContent = Auth.initials(currentUser);
  userChip.title = `${Auth.fullName(currentUser)} — личный кабинет`;
  userChip.hidden = false;
} else {
  document.getElementById('login-link').hidden = false;
  // Без входа «Кабинет» уводит на страницу входа — тоже с переходом
  document.querySelector('.topnav a[href="account.html"]').dataset.transition = '';
}

sidebarToggle.addEventListener('click', () => {
  const open = !sidebar.classList.contains('is-open');
  sidebar.classList.toggle('is-open', open);
  sidebarToggle.setAttribute('aria-expanded', String(open));
  sidebarToggle.querySelector('span').textContent = open ? 'Закрыть' : 'Слои';
});

function setStatus(message, kind = '') {
  status.textContent = message;
  statusDot.className = `status-dot${kind ? ` ${kind}` : ''}`;
}

function featurePosition(element) {
  if (Number.isFinite(element.lat) && Number.isFinite(element.lon)) return [element.lat, element.lon];
  if (element.center && Number.isFinite(element.center.lat) && Number.isFinite(element.center.lon)) return [element.center.lat, element.center.lon];
  return null;
}

function featureTitle(tags) {
  if (tags.name) return tags.name;
  const label = tags.place || tags.man_made || tags.harbour || tags.waterway || tags['seamark:type'];
  return label ? label.replaceAll('_', ' ') : 'Объект OSM';
}

function featureCategory(tags) {
  if (tags.place) return 'settlements';
  if (tags.route === 'ferry' || tags.waterway === 'ferry') return 'ferries';
  if (tags.man_made === 'pier') return 'piers';
  if (tags.harbour === 'yes' || tags['seamark:type'] === 'harbour' || tags.man_made === 'harbour') return 'harbours';
  return 'harbours';
}

function addFeatures(elements) {
  Object.values(layers).forEach(layer => layer.clearLayers());
  markers.splice(0, markers.length);
  const names = new Set();
  for (const element of elements) {
    const tags = element.tags || {};
    const position = featurePosition(element);
    if (!position) continue;
    const category = featureCategory(tags);
    const style = categoryStyles[category];
    const marker = L.circleMarker(position, {
      radius:style.radius,
      color:style.color,
      fillColor:style.fillColor,
      fillOpacity:0.95,
      weight:1.4
    });
    const popup = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = featureTitle(tags);
    const categoryLine = document.createElement('div');
    categoryLine.className = 'popup-category';
    categoryLine.textContent = categoryLabels[category];
    popup.append(title, categoryLine);
    if (tags.wikipedia) {
      const wiki = document.createElement('div');
      wiki.className = 'popup-category';
      wiki.textContent = tags.wikipedia;
      popup.append(wiki);
    }
    marker.bindPopup(popup);
    marker.addTo(layers[category]);
    const name = featureTitle(tags);
    markers.push({name,marker,position});
    if (tags.name) names.add(tags.name);
  }
  count.textContent = markers.length.toLocaleString('ru-RU');
  datalist.replaceChildren(...[...names].sort((a,b) => a.localeCompare(b,'ru')).map(name => {
    const option = document.createElement('option');
    option.value = name;
    return option;
  }));
}

function searchFeatures() {
  const term = searchInput.value.trim().toLocaleLowerCase('ru');
  if (!term) return;
  const matches = markers.filter(item => item.name.toLocaleLowerCase('ru').includes(term));
  if (!matches.length) {
    searchInput.setCustomValidity('Объект не найден в загруженном наборе данных');
    searchInput.reportValidity();
    searchInput.addEventListener('input', () => searchInput.setCustomValidity(''), {once:true});
    return;
  }
  if (matches.length === 1) {
    const match = matches[0];
    map.setView(match.position, Math.max(map.getZoom(), 9));
    match.marker.openPopup();
  } else {
    const bounds = L.latLngBounds(matches.map(item => item.position));
    map.fitBounds(bounds.pad(0.25), {maxZoom:10});
  }
}
searchForm.addEventListener('submit', e => {e.preventDefault();searchFeatures();});

function overpassQuery() {
  const [south, west, north, east] = bbox;
  const area = `(${south},${west},${north},${east})`;
  return `[out:json][timeout:90];(
    nwr["place"~"^(town|village|hamlet)$"]${area};
    nwr["harbour"="yes"]${area};
    nwr["seamark:type"="harbour"]${area};
    nwr["man_made"~"^(pier|harbour)$"]${area};
    nwr["route"="ferry"]${area};
    nwr["waterway"="ferry"]${area};
  );out center tags;`;
}

function setUpdated(date) {
  updated.textContent = date ? new Intl.DateTimeFormat('ru-RU', {
    day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', timeZone:'Europe/Moscow'
  }).format(date) : '—';
}

async function loadObjects(force = false) {
  refreshButton.disabled = true;
  setStatus('Загрузка объектов','loading');
  try {
    const cached = localStorage.getItem(cacheKey);
    if (!force && cached) {
      const item = JSON.parse(cached);
      if (Date.now() - item.savedAt < cacheMaxAge) {
        addFeatures(item.elements);
        setUpdated(new Date(item.savedAt));
        setStatus('Данные загружены');
        return;
      }
    }
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body:new URLSearchParams({data:overpassQuery()})
    });
    if (!response.ok) throw new Error(`Overpass API: ${response.status}`);
    const result = await response.json();
    const elements = result.elements || [];
    addFeatures(elements);
    const savedAt = Date.now();
    localStorage.setItem(cacheKey, JSON.stringify({savedAt,elements}));
    setUpdated(new Date(savedAt));
    setStatus('Данные загружены');
  } catch (error) {
    console.warn('Не удалось обновить объекты OpenStreetMap:', error);
    setStatus(markers.length ? 'Показаны ранее загруженные данные' : 'Объекты временно недоступны', 'error');
    if (!markers.length) count.textContent = '—';
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener('click', () => loadObjects(true));
loadObjects();
