// MapboxとYahooのIDはご自身のものを設定してください
const mapboxToken = 'YOUR_MAPBOX_TOKEN';
const yahooId = 'YOUR_YAHOO_ID';

mapboxgl.accessToken = mapboxToken;
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v11',
    center: [139.767, 35.681],
    zoom: 14
});

let currentLocation = null;
let currentMarker = null;
let destMarker = null;
let restMarkers = [];
let currentRouteData = null;

// 2D/3D切り替え
document.getElementById('view-toggle-btn').onclick = function() {
    const is3D = map.getPitch() > 0;
    map.easeTo({ pitch: is3D ? 0 : 60, duration: 500 });
    this.innerHTML = is3D ? '2D' : '3D';
};

// 現在地取得
navigator.geolocation.watchPosition(p => {
    currentLocation = [p.coords.longitude, p.coords.latitude];
    if (!currentMarker) currentMarker = new mapboxgl.Marker({ color: '#007aff' }).setLngLat(currentLocation).addTo(map);
    else currentMarker.setLngLat(currentLocation);
}, null, { enableHighAccuracy: true });

document.getElementById('recenter-btn').onclick = () => { if (currentLocation) map.flyTo({ center: currentLocation, zoom: 16 }); };

// 検索ロジック (Yahoo API)
const searchBox = document.getElementById('search-box');
searchBox.oninput = (e) => {
    const q = e.target.value.trim();
    if (q.length < 2) return;
    const s = document.createElement('script');
    s.src = `https://map.yahooapis.jp/search/local/V1/localSearch?appid=${yahooId}&query=${encodeURIComponent(q)}&output=json&callback=handleResults`;
    document.body.appendChild(s);
    s.onload = () => s.remove();
};

window.handleResults = (data) => {
    const list = document.getElementById('suggestions');
    list.innerHTML = '';
    if (!data.Feature) return;
    document.getElementById('suggestions-container').classList.remove('hidden');
    data.Feature.forEach(f => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${f.Name}</strong><br><small>${f.Property.Address}</small>`;
        li.onclick = () => {
            document.getElementById('suggestions-container').classList.add('hidden');
            const coords = f.Geometry.Coordinates.split(',');
            drawRoute(f.Name, [parseFloat(coords[0]), parseFloat(coords[1])]);
        };
        list.appendChild(li);
    });
};

async function drawRoute(name, destCoords) {
    if (!currentLocation) return;
    const res = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${currentLocation[0]},${currentLocation[1]};${destCoords[0]},${destCoords[1]}?geometries=geojson&overview=full&language=ja&access_token=${mapboxToken}`);
    const data = await res.json();
    currentRouteData = data.routes[0];

    if (map.getSource('route')) { map.removeLayer('route'); map.removeSource('route'); }
    map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: currentRouteData.geometry } });
    map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#007aff', 'line-width': 6, 'line-opacity': 0.7 } });

    if (destMarker) destMarker.remove();
    destMarker = new mapboxgl.Marker({ color: '#ff3b30' }).setLngLat(destCoords).addTo(map);
    map.fitBounds(new mapboxgl.LngLatBounds().extend(currentLocation).extend(destCoords), { padding: {top: 50, bottom: 400, left: 50, right: 50} });
    
    updatePanelUI(name);
}

// パネルUI更新と逆算
function updatePanelUI(name) {
    const panel = document.getElementById('info-panel');
    panel.classList.remove('hidden');
    document.getElementById('destination-name').textContent = name;
    document.getElementById('route-distance').textContent = `${(currentRouteData.distance / 1000).toFixed(1)}km`;
    document.getElementById('route-duration').textContent = `${Math.round(currentRouteData.duration / 60)}分`;

    const calculate = () => {
        const arrivalInput = document.getElementById('target-arrival-time').value;
        const restTime = parseInt(document.getElementById('rest-time').value) || 0;
        const restCount = parseInt(document.getElementById('rest-count').value) || 0;
        if (!arrivalInput) return;

        const target = new Date();
        const [h, m] = arrivalInput.split(':');
        target.setHours(h, m, 0);

        const totalRestMs = restTime * restCount * 60 * 1000;
        const depTime = new Date(target.getTime() - (currentRouteData.duration * 1000) - totalRestMs);
        
        document.getElementById('calc-time').textContent = `${String(depTime.getHours()).padStart(2,'0')}:${String(depTime.getMinutes()).padStart(2,'0')}`;
        document.getElementById('total-rest-info').textContent = `休憩合計: ${restTime * restCount}分 (${restCount}回)`;
        document.getElementById('departure-card').classList.remove('hidden');
    };

    document.querySelectorAll('.config-grid input').forEach(input => input.oninput = calculate);
    calculate();
}

// 案内開始！
document.getElementById('start-nav').onclick = () => {
    if (!currentRouteData) return;

    // UIの切り替え
    document.getElementById('pre-nav-content').classList.add('hidden');
    document.getElementById('nav-active-content').classList.remove('hidden');
    document.getElementById('search-container').style.transform = 'translateY(-120px)';
    
    // バナー表示とデータ反映
    const banner = document.getElementById('nav-banner');
    banner.classList.remove('hidden');

    const arrDate = new Date(Date.now() + (currentRouteData.duration * 1000));
    document.getElementById('banner-arrival').textContent = `${arrDate.getHours()}:${String(arrDate.getMinutes()).padStart(2,'0')}`;
    
    // 次の休憩までの目安（単純等分計算）
    const rCnt = parseInt(document.getElementById('rest-count').value) || 1;
    const nextRestMin = Math.round((currentRouteData.duration / 60) / (rCnt + 1));
    document.getElementById('banner-next-rest').textContent = `${nextRestMin}分`;

    document.getElementById('nav-remaining-time').textContent = `${Math.round(currentRouteData.duration / 60)}分`;

    // 3D視点でナビ開始
    map.flyTo({ center: currentLocation, zoom: 17, pitch: 60, essential: true });
    document.getElementById('view-toggle-btn').innerHTML = '3D';
};

// 終了処理
document.getElementById('stop-nav').onclick = () => {
    document.getElementById('nav-banner').classList.add('hidden');
    document.getElementById('search-container').style.transform = 'translateY(0)';
    document.getElementById('pre-nav-content').classList.remove('hidden');
    document.getElementById('nav-active-content').classList.add('hidden');
    map.easeTo({ pitch: 0 });
};

document.getElementById('close-panel').onclick = () => document.getElementById('info-panel').classList.add('hidden');