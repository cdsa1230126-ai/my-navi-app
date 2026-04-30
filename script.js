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
        zoom: 15
    });

    let currentLocation = null;
    let currentMarker = null;
    let destMarker = null;

    // 現在地取得（青いピン）
    navigator.geolocation.watchPosition(p => {
        currentLocation = [p.coords.longitude, p.coords.latitude];
        if (!currentMarker) {
            currentMarker = new mapboxgl.Marker({ color: '#007aff' }).setLngLat(currentLocation).addTo(map);
        } else {
            currentMarker.setLngLat(currentLocation);
        }
    }, null, { enableHighAccuracy: true });

    // Yahoo検索
    const searchBox = document.getElementById('search-box');
    const searchLoader = document.getElementById('search-loader');
    searchBox.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (!query) return;
        searchLoader.classList.remove('hidden');
        const url = `https://map.yahooapis.jp/search/local/V1/localSearch?appid=${yahooId}&query=${encodeURIComponent(query)}&output=json&callback=handleResults`;
        const script = document.createElement('script');
        script.src = url;
        document.body.appendChild(script);
        document.body.removeChild(script);
    });

    window.handleResults = (data) => {
        searchLoader.classList.add('hidden');
        const list = document.getElementById('suggestions');
        list.innerHTML = '';
        if (!data.Feature) return;
        document.getElementById('suggestions-container').classList.remove('hidden');
        data.Feature.forEach(f => {
            const li = document.createElement('li');
            li.innerHTML = `<b>${f.Name}</b><br><small>${f.Property.Address}</small>`;
            li.onclick = () => {
                document.getElementById('suggestions-container').classList.add('hidden');
                const coords = f.Geometry.Coordinates.split(',');
                drawRoute(f.Name, [parseFloat(coords[0]), parseFloat(coords[1])]);
            };
            list.appendChild(li);
        });
    };

    async function drawRoute(name, destCoords) {
        if (!currentLocation) return alert("現在地を取得中です");

        const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${currentLocation[0]},${currentLocation[1]};${destCoords[0]},${destCoords[1]}?geometries=geojson&overview=full&language=ja&access_token=${mapboxToken}`;
        const res = await fetch(url);
        const data = await res.json();
        const route = data.routes[0];

        // ルート描画
        if (map.getSource('route')) { map.removeLayer('route'); map.removeSource('route'); }
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: route.geometry } });
        map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#007aff', 'line-width': 6 } });

        // 赤いピン（目的地）
        if (destMarker) destMarker.remove();
        destMarker = new mapboxgl.Marker({ color: '#ff3b30' }).setLngLat(destCoords).addTo(map);

        // ★2つのピンを収める（下側パディングを420px確保）
        const bounds = new mapboxgl.LngLatBounds().extend(currentLocation).extend(destCoords);
        map.fitBounds(bounds, {
            padding: {top: 80, bottom: 420, left: 50, right: 50},
            duration: 1500
        });

        // パネル更新
        document.getElementById('info-panel').classList.remove('hidden');
        document.getElementById('destination-name').textContent = name;
        document.getElementById('route-distance').textContent = `${(route.distance / 1000).toFixed(1)} km`;
        document.getElementById('route-duration').textContent = `${Math.round(route.duration / 60)} 分`;

        // 逆算ロジック
        const updateCalc = () => {
            const arrTime = document.getElementById('target-arrival-time').value;
            const restTimePerOnce = parseInt(document.getElementById('rest-time').value) || 0;
            const restCount = parseInt(document.getElementById('rest-count').value) || 0;
            
            if (!arrTime) return;

            const [h, m] = arrTime.split(':');
            const target = new Date();
            target.setHours(h, m, 0);

            // 合計休憩 = 1回あたりの時間 × 回数
            const totalRestMin = restTimePerOnce * restCount;
            const totalRestMs = totalRestMin * 60 * 1000;

            // 推奨出発 = 到着希望 - 移動時間 - 休憩合計
            const depMs = target.getTime() - (route.duration * 1000) - totalRestMs;
            const d = new Date(depMs);
            
            document.getElementById('calc-time').textContent = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
            document.getElementById('total-rest-info').textContent = `休憩合計: ${totalRestMin}分 (${restCount}回)`;
            document.getElementById('departure-card').classList.remove('hidden');
        };

        // イベント監視
        document.getElementById('target-arrival-time').onchange = updateCalc;
        document.getElementById('rest-time').oninput = updateCalc;
        document.getElementById('rest-count').oninput = updateCalc;
        updateCalc();
    }

    document.getElementById('close-panel').onclick = () => document.getElementById('info-panel').classList.add('hidden');
}