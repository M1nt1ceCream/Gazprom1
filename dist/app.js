const center = [71.5, 72.0];
const bbox = [68.0, 66.0, 74.5, 74.0];
const cacheKey = 'obskaya-guba-osm-features-v1';
const cacheMaxAge = 3 * 60 * 60 * 1000;
const map = L.map('map', {zoomControl:false, preferCanvas:true}).setView(center, 6);
L.control.zoom({position:'bottomright'}).addTo(map);

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom:19,
  attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);
const objects = L.featureGroup().addTo(map);

document.getElementById('osm-toggle').addEventListener('change', e => e.target.checked ? osm.addTo(map) : map.removeLayer(osm));
document.getElementById('data-toggle').addEventListener('change', e => e.target.checked ? objects.addTo(map) : map.removeLayer(objects));
document.getElementById('home').addEventListener('click', () => map.setView(center, 6));
map.on('mousemove', e => {
  document.getElementById('coords').textContent = `${e.latlng.lat.toFixed(2)}° N  ${e.latlng.lng.toFixed(2)}° E`;
});

const status = document.getElementById('status');
const count = document.getElementById('feature-count');
const updated = document.getElementById('updated');
const refreshButton = document.getElementById('refresh');

function isMarine(tags) {
  return tags.harbour === 'yes' || tags['seamark:type'] === 'harbour' ||
    tags.man_made === 'pier' || tags.man_made === 'harbour' || tags.route === 'ferry' ||
    tags.waterway === 'ferry';
}

function featurePosition(element) {
  if (Number.isFinite(element.lat) && Number.isFinite(element.lon)) return [element.lat, element.lon];
  if (element.center && Number.isFinite(element.center.lat) && Number.isFinite(element.center.lon)) {
    return [element.center.lat, element.center.lon];
  }
  return null;
}

function featureTitle(tags) {
  if (tags.name) return tags.name;
  const label = tags.place || tags.man_made || tags.harbour || tags.waterway || tags['seamark:type'];
  return label ? label.replaceAll('_', ' ') : 'Объект OSM';
}

function addFeatures(elements) {
  objects.clearLayers();
  for (const element of elements) {
    const tags = element.tags || {};
    const position = featurePosition(element);
    if (!position) continue;
    const marine = isMarine(tags);
    const marker = L.circleMarker(position, {
      radius: marine ? 6 : 5,
      color: marine ? '#7b5031' : '#225f5d',
      fillColor: marine ? '#e0a25d' : '#73bbb0',
      fillOpacity: 0.94,
      weight: 1.5
    });
    const popup = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = featureTitle(tags);
    const category = document.createElement('div');
    category.className = 'popup-category';
    category.textContent = marine ? 'Морская инфраструктура' : `Населённый пункт: ${tags.place || 'место'}`;
    popup.append(title, category);
    if (tags.wikipedia) {
      const wiki = document.createElement('div');
      wiki.textContent = tags.wikipedia;
      popup.append(wiki);
    }
    marker.bindPopup(popup);
    marker.addTo(objects);
  }
  count.textContent = objects.getLayers().length.toLocaleString('ru-RU');
}

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
  updated.textContent = date ? `OSM · ${new Intl.DateTimeFormat('ru-RU', {
    day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', timeZone:'Europe/Moscow'
  }).format(date)}` : '';
}

async function loadObjects(force = false) {
  refreshButton.disabled = true;
  status.textContent = 'Загрузка объектов';
  try {
    const cached = localStorage.getItem(cacheKey);
    if (!force && cached) {
      const item = JSON.parse(cached);
      if (Date.now() - item.savedAt < cacheMaxAge) {
        addFeatures(item.elements);
        setUpdated(new Date(item.savedAt));
        status.textContent = 'Данные OSM загружены';
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
    localStorage.setItem(cacheKey, JSON.stringify({savedAt, elements}));
    setUpdated(new Date(savedAt));
    status.textContent = 'Данные OSM загружены';
  } catch (error) {
    console.warn('Не удалось обновить объекты OpenStreetMap:', error);
    status.textContent = objects.getLayers().length ? 'Показан последний сохранённый слой' : 'Объекты временно недоступны';
    if (!objects.getLayers().length) count.textContent = '—';
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener('click', () => loadObjects(true));
loadObjects();
