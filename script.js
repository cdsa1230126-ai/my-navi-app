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
        style: 'mapbox://styles/mapbox/streets-v11', // モビリンク風の明るい地図
        center: [139.767, 35.681],
        zoom: 14
    });

    let currentLocation = null;
    let currentMarker = null;
    let destMarker = null;

    // 現在地の取得
    navigator.geolocation.watchPosition(p => {
        currentLocation = [p.coords.longitude, p.coords.latitude];
        if (!currentMarker) {
            currentMarker = new mapboxgl.Marker({ color: '#007aff' }).setLngLat(currentLocation).addTo(map);
        } else {
            currentMarker.setLngLat(currentLocation);
        }
    }, null, { enableHighAccuracy: true });

    // Yahoo検索API連携
    const searchBox = document.getElementById('search-box');
    searchBox.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (!query) return;
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
            li.innerHTML = `<div style="font-weight:bold; color:#1c1c1e">${f.Name}</div><div style="font-size:12px; color:#8e8e93">${f.Property.Address}</div>`;
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
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${currentLocation[0]},${currentLocation[1]};${destCoords[0]},${destCoords[1]}?geometries=geojson&overview=full&language=ja&access_token=${mapboxToken}`;
        
        const res = await fetch(url);
        const data = await res.json();
        const route = data.routes[0];

        // ルートの描画
        if (map.getSource('route')) { map.removeLayer('route'); map.removeSource('route'); }
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: route.geometry } });
        map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#007aff', 'line-width': 6, 'line-opacity': 0.8 } });

        // 目的地のピン
        if (destMarker) destMarker.remove();
        destMarker = new mapboxgl.Marker({ color: '#ff3b30' }).setLngLat(destCoords).addTo(map);

        // 2つのピンを画面に収める（パディングを下側に大きく確保）
        const bounds = new mapboxgl.LngLatBounds().extend(currentLocation).extend(destCoords);
        map.fitBounds(bounds, {
            padding: {top: 80, bottom: 420, left: 60, right: 60},
            duration: 1500
        });

        // パネル情報の更新
        document.getElementById('info-panel').classList.remove('hidden');
        document.getElementById('destination-name').textContent = name;
        document.getElementById('route-distance').textContent = `${(route.distance / 1000).toFixed(1)} km`;
        document.getElementById('route-duration').textContent = `${Math.round(route.duration / 60)} 分`;

        // 逆算計算ロジック
        const updateCalc = () => {
            const arrTime = document.getElementById('target-arrival-time').value;
            const restMin = parseInt(document.getElementById('rest-time').value) || 0;
            const restCount = parseInt(document.getElementById('rest-count').value) || 0; // 今回追加した休憩回数
            
            if (!arrTime) return;

            const [h, m] = arrTime.split(':');
            const targetDate = new Date();
            targetDate.setHours(h, m, 0);

            // 休憩合計（合計分として計算）
            const totalRestMs = restMin * 60 * 1000; 

            // 推奨出発時間 = 到着希望 - 移動時間 - 休憩時間
            const depMs = targetDate.getTime() - (route.duration * 1000) - totalRestMs;
            const d = new Date(depMs);
            
            document.getElementById('calc-time').textContent = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
            document.getElementById('departure-card').classList.remove('hidden');
        };

        // イベント登録
        document.getElementById('target-arrival-time').onchange = updateCalc;
        document.getElementById('rest-time').oninput = updateCalc;
        document.getElementById('rest-count').oninput = updateCalc;
    }

    document.getElementById('close-panel').onclick = () => document.getElementById('info-panel').classList.add('hidden');
}