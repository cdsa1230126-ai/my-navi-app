const mbToken = localStorage.getItem('mapbox_user_token');
const yhId = localStorage.getItem('yahoo_app_id');

if (!mbToken || !yhId) {
    document.getElementById('api-config-modal').classList.remove('hidden');
} else {
    startApp(mbToken, yhId);
}

document.getElementById('save-api-keys').addEventListener('click', () => {
    const mb = document.getElementById('mapbox-token-input').value.trim();
    const yh = document.getElementById('yahoo-id-input').value.trim();
    if (mb && yh) {
        localStorage.setItem('mapbox_user_token', mb);
        localStorage.setItem('yahoo_app_id', yh);
        location.reload();
    }
});

function startApp(mapboxToken, yahooId) {
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
    let isFirstLock = true;
    let displayMode = 'duration'; // 'duration' or 'arrival'
    let currentRouteData = null;

    // --- 渋滞レイヤーの追加 ---
    map.on('load', () => {
        map.addSource('mapbox-traffic', { type: 'vector', url: 'mapbox://mapbox.mapbox-traffic-v1' });
        map.addLayer({
            'id': 'traffic', 'type': 'line', 'source': 'mapbox-traffic', 'source-layer': 'traffic',
            'paint': {
                'line-width': 3,
                'line-color': ['match', ['get', 'congestion'], 'low', '#4caf50', 'moderate', '#ffeb3b', 'heavy', '#f44336', 'severe', '#8b0000', '#4caf50']
            }
        });
    });

    // --- 現在地取得 ---
    navigator.geolocation.watchPosition(p => {
        currentLocation = [p.coords.longitude, p.coords.latitude];
        if (!currentMarker) {
            currentMarker = new mapboxgl.Marker({ color: '#007aff' }).setLngLat(currentLocation).addTo(map);
        } else {
            currentMarker.setLngLat(currentLocation);
        }
        if (isFirstLock) {
            map.flyTo({ center: currentLocation, zoom: 15 });
            isFirstLock = false;
        }
    }, null, { enableHighAccuracy: true });

    document.getElementById('recenter-btn').onclick = () => {
        if (currentLocation) map.flyTo({ center: currentLocation, zoom: 16 });
    };

    // --- Yahoo検索 ---
    const searchBox = document.getElementById('search-box');
    searchBox.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) return;
        const url = `https://map.yahooapis.jp/search/local/V1/localSearch?appid=${yahooId}&query=${encodeURIComponent(query)}&output=json&callback=handleResults`;
        const script = document.createElement('script');
        script.src = url;
        document.body.appendChild(script);
        document.body.removeChild(script);
    });

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

    // --- ルート描画 & 休憩提案 ---
    async function drawRoute(name, destCoords) {
        if (!currentLocation) return;
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${currentLocation[0]},${currentLocation[1]};${destCoords[0]},${destCoords[1]}?geometries=geojson&overview=full&language=ja&access_token=${mapboxToken}`;
        const res = await fetch(url);
        const data = await res.json();
        currentRouteData = data.routes[0];

        if (map.getSource('route')) { map.removeLayer('route'); map.removeSource('route'); }
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: currentRouteData.geometry } });
        map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#007aff', 'line-width': 6, 'line-opacity': 0.6 } });

        if (destMarker) destMarker.remove();
        destMarker = new mapboxgl.Marker({ color: '#ff3b30' }).setLngLat(destCoords).addTo(map);

        map.fitBounds(new mapboxgl.LngLatBounds().extend(currentLocation).extend(destCoords), { padding: {top: 50, bottom: 450, left: 50, right: 50}, duration: 1000 });

        updatePanelUI(name);
        suggestRestAreas(currentRouteData);
    }

    // --- インテリジェント休憩提案 ---
    async function suggestRestAreas(route) {
        restMarkers.forEach(m => m.remove());
        restMarkers = [];
        const count = parseInt(document.getElementById('rest-count').value) || 0;
        if (count <= 0) return;

        const coords = route.geometry.coordinates;
        for (let i = 1; i <= count; i++) {
            const pt = coords[Math.floor((coords.length / (count + 1)) * i)];
            const url = `https://map.yahooapis.jp/search/local/V1/localSearch?appid=${yahooId}&lat=${pt[1]}&lon=${pt[0]}&dist=2&query=${encodeURIComponent('コンビニ サービスエリア')}&output=json&results=1&callback=restCb${i}`;
            
            window[`restCb${i}`] = (data) => {
                if (data.Feature) {
                    const spot = data.Feature[0];
                    const sc = spot.Geometry.Coordinates.split(',');
                    const el = document.createElement('div'); el.className = 'rest-marker';
                    const m = new mapboxgl.Marker(el).setLngLat([parseFloat(sc[0]), parseFloat(sc[1])]).setPopup(new mapboxgl.Popup().setHTML(spot.Name)).addTo(map);
                    restMarkers.push(m);
                }
            };
            const s = document.createElement('script'); s.src = url; document.body.appendChild(s);
        }
    }

    // --- UI更新 & 到着/所要時間トグル ---
    function updatePanelUI(name) {
        document.getElementById('info-panel').classList.remove('hidden');
        document.getElementById('destination-name').textContent = name;
        document.getElementById('route-distance').textContent = `${(currentRouteData.distance / 1000).toFixed(1)}km`;
        
        const durEl = document.getElementById('route-duration');
        const refreshTime = () => {
            if (displayMode === 'duration') {
                durEl.textContent = `${Math.round(currentRouteData.duration / 60)}分`;
            } else {
                const arr = new Date(Date.now() + (currentRouteData.duration * 1000));
                durEl.textContent = `${arr.getHours()}:${String(arr.getMinutes()).padStart(2,'0')}着`;
            }
        };
        durEl.onclick = () => { displayMode = (displayMode === 'duration') ? 'arrival' : 'duration'; refreshTime(); };
        refreshTime();

        const calc = () => {
            const arrT = document.getElementById('target-arrival-time').value;
            const rTime = parseInt(document.getElementById('rest-time').value) || 0;
            const rCnt = parseInt(document.getElementById('rest-count').value) || 0;
            if (!arrT) return;
            const t = new Date(); const [h, m] = arrT.split(':'); t.setHours(h, m, 0);
            const dep = new Date(t.getTime() - (currentRouteData.duration * 1000) - (rTime * rCnt * 60 * 1000));
            document.getElementById('calc-time').textContent = `${String(dep.getHours()).padStart(2,'0')}:${String(dep.getMinutes()).padStart(2,'0')}`;
            document.getElementById('total-rest-info').textContent = `休憩合計: ${rTime * rCnt}分 (${rCnt}回)`;
            document.getElementById('departure-card').classList.remove('hidden');
        };
        document.querySelectorAll('.config-grid input').forEach(i => i.oninput = () => { calc(); suggestRestAreas(currentRouteData); });
        calc();
    }
    document.getElementById('close-panel').onclick = () => document.getElementById('info-panel').classList.add('hidden');
}