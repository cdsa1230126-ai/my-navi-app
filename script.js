const mapboxToken = localStorage.getItem('mapbox_user_token');
const yahooAppId = localStorage.getItem('yahoo_app_id');

if (!mapboxToken || !yahooAppId) {
    document.getElementById('api-config-modal').classList.remove('hidden');
} else {
    startApp(mapboxToken, yahooAppId);
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

function startApp(mbToken, yhId) {
    mapboxgl.accessToken = mbToken;
    const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [139.767, 35.681],
        zoom: 14
    });

    let currentLocation = null;
    let currentMarker = null;
    let destMarker = null;

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
    searchBox.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (!query) return;
        const url = `https://map.yahooapis.jp/search/local/V1/localSearch?appid=${yhId}&query=${encodeURIComponent(query)}&output=json&callback=handleResults`;
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
            li.innerHTML = `<b>${f.Name}</b><br><small style="color:#888">${f.Property.Address}</small>`;
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
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${currentLocation[0]},${currentLocation[1]};${destCoords[0]},${destCoords[1]}?geometries=geojson&overview=full&language=ja&access_token=${mbToken}`;
        const res = await fetch(url);
        const data = await res.json();
        const route = data.routes[0];

        if (map.getSource('route')) { map.removeLayer('route'); map.removeSource('route'); }
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: route.geometry } });
        map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#007aff', 'line-width': 6 } });

        if (destMarker) destMarker.remove();
        destMarker = new mapboxgl.Marker({ color: 'red' }).setLngLat(destCoords).addTo(map);

        // ★2つのピンを最適に収める（パディングを下側のパネル分確保）
        const bounds = new mapboxgl.LngLatBounds().extend(currentLocation).extend(destCoords);
        map.fitBounds(bounds, {
            padding: {top: 80, bottom: 400, left: 50, right: 50},
            duration: 1500
        });

        // パネル表示
        document.getElementById('info-panel').classList.remove('hidden');
        document.getElementById('destination-name').textContent = name;
        document.getElementById('route-distance').textContent = `${(route.distance / 1000).toFixed(1)}km`;
        document.getElementById('route-duration').textContent = `${Math.round(route.duration / 60)}分`;

        // 逆算計算ロジック
        const updateCalc = () => {
            const arr = document.getElementById('target-arrival-time').value;
            const restMin = parseInt(document.getElementById('rest-time').value) || 0;
            const restCount = parseInt(document.getElementById('rest-count').value) || 0;
            
            if (!arr) return;

            const [h, m] = arr.split(':');
            const target = new Date();
            target.setHours(h, m, 0);

            // 合計休憩時間 ＝ 入力された分 × 回数（または合計として扱うロジック）
            // ここではシンプルに「入力分 ＋ (回数に応じた追加)」などのカスタムも可能です
            const totalRestMs = restMin * 60 * 1000; 

            const depMs = target.getTime() - (route.duration * 1000) - totalRestMs;
            const d = new Date(depMs);
            
            document.getElementById('calc-time').textContent = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
            document.getElementById('departure-card').classList.remove('hidden');
        };

        document.getElementById('target-arrival-time').onchange = updateCalc;
        document.getElementById('rest-time').oninput = updateCalc;
        document.getElementById('rest-count').oninput = updateCalc;
    }

    document.getElementById('close-panel').onclick = () => document.getElementById('info-panel').classList.add('hidden');
}