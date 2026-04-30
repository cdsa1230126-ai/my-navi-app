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

    // ★【機能追加】現在地のリアルタイム監視
    navigator.geolocation.watchPosition(p => {
        currentLocation = [p.coords.longitude, p.coords.latitude];
        
        // 初回取得時に地図を現在地へ飛ばす
        if (!currentMarker) {
            currentMarker = new mapboxgl.Marker({ color: '#007aff' }).setLngLat(currentLocation).addTo(map);
            map.flyTo({ center: currentLocation, zoom: 15 });
        } else {
            // 移動に合わせてピンを動かす
            currentMarker.setLngLat(currentLocation);
        }
    }, e => {
        console.error("位置情報が取得できませんでした", e);
    }, { enableHighAccuracy: true });

    // 現在地復帰ボタンの処理
    document.getElementById('recenter-btn').onclick = () => {
        if (currentLocation) map.flyTo({ center: currentLocation, zoom: 15 });
    };

    // Yahoo検索処理
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

        if (map.getSource('route')) { map.removeLayer('route'); map.removeSource('route'); }
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: route.geometry } });
        map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#007aff', 'line-width': 6 } });

        if (destMarker) destMarker.remove();
        destMarker = new mapboxgl.Marker({ color: '#ff3b30' }).setLngLat(destCoords).addTo(map);

        // ★2つのピンを画面に収める調整
        const bounds = new mapboxgl.LngLatBounds().extend(currentLocation).extend(destCoords);
        map.fitBounds(bounds, {
            padding: {top: 80, bottom: 420, left: 50, right: 50},
            duration: 1500
        });

        // 情報更新
        document.getElementById('info-panel').classList.remove('hidden');
        document.getElementById('destination-name').textContent = name;
        document.getElementById('route-distance').textContent = `${(route.distance / 1000).toFixed(1)} km`;
        document.getElementById('route-duration').textContent = `${Math.round(route.duration / 60)} 分`;

        // 逆算ロジック（休憩時間 × 回数）
        const updateCalc = () => {
            const arrTime = document.getElementById('target-arrival-time').value;
            const restPerOnce = parseInt(document.getElementById('rest-time').value) || 0;
            const restCount = parseInt(document.getElementById('rest-count').value) || 0;
            
            if (!arrTime) return;

            const [h, m] = arrTime.split(':');
            const target = new Date();
            target.setHours(h, m, 0);

            const totalRestMin = restPerOnce * restCount;
            const depMs = target.getTime() - (route.duration * 1000) - (totalRestMin * 60 * 1000);
            const d = new Date(depMs);
            
            document.getElementById('calc-time').textContent = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
            document.getElementById('total-rest-info').textContent = `休憩合計: ${totalRestMin}分 (${restCount}回)`;
            document.getElementById('departure-card').classList.remove('hidden');
        };

        document.getElementById('target-arrival-time').onchange = updateCalc;
        document.getElementById('rest-time').oninput = updateCalc;
        document.getElementById('rest-count').oninput = updateCalc;
        updateCalc();
    }

    document.getElementById('close-panel').onclick = () => document.getElementById('info-panel').classList.add('hidden');
}