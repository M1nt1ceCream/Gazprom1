const center = [71.5, 72.0];
const map = L.map('map', {zoomControl:false, preferCanvas:true}).setView(center, 6);
L.control.zoom({position:'bottomright'}).addTo(map);
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
const features = L.tileLayer.wms('/geoserver/obsbay/wms', {layers:'obsbay:map_features', format:'image/png', transparent:true, version:'1.1.1', tiled:true, attribution:'Объекты: © OpenStreetMap contributors'}).addTo(map);
document.getElementById('osm-toggle').addEventListener('change', e => e.target.checked ? osm.addTo(map) : map.removeLayer(osm));
document.getElementById('data-toggle').addEventListener('change', e => e.target.checked ? features.addTo(map) : map.removeLayer(features));
document.getElementById('home').addEventListener('click', () => map.setView(center, 6));
map.on('mousemove', e => document.getElementById('coords').innerHTML = `${e.latlng.lat.toFixed(2)}° N&nbsp;&nbsp; ${e.latlng.lng.toFixed(2)}° E`);
map.on('click', e => {
  const point = map.latLngToContainerPoint(e.latlng, map.getZoom());
  const size = map.getSize();
  const params = new URLSearchParams({service:'WMS',version:'1.1.1',request:'GetFeatureInfo',layers:'obsbay:map_features',query_layers:'obsbay:map_features',info_format:'application/json',feature_count:'8',srs:'EPSG:4326',bbox:map.getBounds().toBBoxString(),width:size.x,height:size.y,x:Math.round(point.x),y:Math.round(point.y)});
  fetch(`/geoserver/obsbay/wms?${params}`).then(r=>r.json()).then(data=>{
    const p=data.features?.[0]?.properties;
    if(p) L.popup().setLatLng(e.latlng).setContent(`<b>${p.name || p.category || 'Объект OSM'}</b><br>${p.category || ''}`).openOn(map);
  }).catch(()=>{});
});
const status = document.getElementById('status');
features.on('load', () => status.textContent = 'Слой подключён');
features.on('tileerror', () => status.textContent = 'Слой загружается');
function updateStats(){
  fetch('/api/status').then(r=>{if(!r.ok) throw new Error('status unavailable');return r.json()}).then(data=>{
    document.getElementById('feature-count').textContent=Number(data.feature_count).toLocaleString('ru-RU');
    if(data.last_success){
      const date=new Date(data.last_success);
      document.getElementById('updated').textContent=`обновлено ${date.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'})}`;
    } else document.getElementById('updated').textContent='ещё нет данных';
    status.textContent=data.last_error ? 'Ошибка последнего импорта' : (data.last_success ? 'Импорт работает' : 'Первый сбор данных');
  }).catch(()=>status.textContent='Сборщик недоступен');
}
document.getElementById('refresh').addEventListener('click',()=>{features.setParams({_:Date.now()});updateStats();});
updateStats();
