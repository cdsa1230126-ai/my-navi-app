const mapboxToken = localStorage.getItem('mapbox_user_token');
const yahooAppId = localStorage.getItem('yahoo_app_id');
const modal = document.getElementById('api-config-modal');

if (!mapboxToken || !yahooAppId) {
    modal.classList.remove('hidden');
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
        zoom: 13
    });

    const statusEl = document.getElementById('location-status');
    let currentLocation = null;
    let currentPosMarker = null;
    let destinationMarker = null;
    let isFirstLocation = true; // ★初回だけ中央に移動するためのフラグ

    // --- 現在地取得ロジック ---
    if (!navigator.geolocation) {
        statusEl.textContent = "❌ 位置情報非対応ブラウザです";
        statusEl.style.color = "red";
    } else {
        navigator.geolocation.watchPosition(
            p => {
                currentLocation = [p.coords.longitude, p.coords.latitude];
                statusEl.textContent = "✅ 現在地を取得済み";
                statusEl.style.color = "#007bff";
                
                // 現在地ピンの表示・更新
                if (!currentPosMarker) {
                    currentPosMarker = new mapboxgl.Marker({ color: '#007bff' })
                        .setLngLat(currentLocation)
                        .addTo(map);
                } else {
                    currentPosMarker.setLngLat(currentLocation);
                }

                // ★現在地を画面中央に表示する
                // 初回取得時、または移動した時に中央に寄せたい場合に使用
                if (isFirstLocation) {
                    map.flyTo({
                        center: currentLocation,
                        zoom: 15, // 現在地が見やすいように少しズーム
                        essential: true
                    });
                    isFirstLocation = false; // 2回目以降は自動で動かさない（ユーザーの操作を邪魔しないため）
                }
            },
            e => {
                let msg = "❌ 位置情報を取得できません";
                if (e.code === 1) msg = "❌ 位置情報の利用を許可してください";
                statusEl.textContent = msg;
                statusEl.style.color = "red";
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }

    // --- Yahoo検索 ---
    const searchBox = document.getElementById('search-box');
    const searchLoader = document.getElementById('search-loader');
    const suggestionsContainer = document.getElementById('suggestions-container');
    const suggestionsList = document.getElementById('suggestions');

    let timeout = null;
    searchBox.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(timeout);
        if (!query) {
            suggestionsContainer.classList.add('hidden');
            return;
        }

        timeout = setTimeout(() => {
            searchLoader.classList.remove('hidden');
            const yahooUrl = `https://map.yahooapis.jp/search/local/V1/localSearch?appid=${yhId}&query=${encodeURIComponent(query)}&output=json&callback=handleYahooResults`;
            const script = document.createElement('script');
            script.src = yahooUrl;
            document.body.appendChild(script);
            document.body.removeChild(script);
        }, 500);
    });

    window.handleYahooResults = (data) => {
        searchLoader.classList.add('hidden');
        suggestionsList.innerHTML = '';
        if (!data.Feature) return;

        suggestionsContainer.classList.remove('hidden');
        data.Feature.forEach(f => {
            const coords = f.Geometry.Coordinates.split(',');
            const lng = parseFloat(coords[0]);
            const lat = parseFloat(coords[1]);

            const li = document.createElement('li');
            li.innerHTML = `<strong>📍 ${f.Name}</strong><br><small>${f.Property.Address}</small>`;
            
            li.onclick = () => {
                searchBox.value = f.Name;
                suggestionsContainer.classList.add('hidden');
                drawRoute(f.Name, [lng, lat]);
            };
            suggestionsList.appendChild(li);
        });
    };

    // --- ルート描画・逆算 ---
    async function drawRoute(name, destCoords) {
        let startPoint = currentLocation || [map.getCenter().lng, map.getCenter().lat];

        const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${startPoint[0]},${startPoint[1]};${destCoords[0]},${destCoords[1]}?geometries=geojson&overview=full&language=ja&access_token=${mbToken}`;
        
        try {
            const res = await fetch(url);
            const data = await res.json();
            const route = data.routes[0];
            const travelTimeSec = route.duration;

            if (map.getSource('route')) {
                map.removeLayer('route');
                map.removeSource('route');
            }
            map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: route.geometry } });
            map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#007bff', 'line-width': 6 } });

            if (destinationMarker) destinationMarker.remove();
            destinationMarker = new mapboxgl.Marker({ color: 'red' }).setLngLat(destCoords).addTo(map);
            
            // ルート全体が見えるように調整（ここは中央寄せではなく全体表示）
            map.fitBounds(new mapboxgl.LngLatBounds(startPoint, destCoords), { padding: 80 });

            document.getElementById('info-panel').classList.remove('hidden');
            document.getElementById('destination-name').textContent = name;
            document.getElementById('route-distance').textContent = `${(route.distance / 1000).toFixed(1)} km`;
            document.getElementById('route-duration').textContent = `${Math.round(travelTimeSec / 60)} 分`;

            const updateDepartureTime = () => {
                const arrivalInput = document.getElementById('target-arrival-time').value;
                const restMin = parseInt(document.getElementById('rest-time').value) || 0;
                if (!arrivalInput) return;

                const [h, m] = arrivalInput.split(':');
                const arrivalDate = new Date();
                arrivalDate.setHours(h, m, 0);

                const depMs = arrivalDate.getTime() - (travelTimeSec * 1000) - (restMin * 60 * 1000);
                const d = new Date(depMs);
                document.getElementById('calc-time').textContent = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                document.getElementById('departure-result').style.display = 'block';
            };

            document.getElementById('target-arrival-time').onchange = updateDepartureTime;
            document.getElementById('rest-time').oninput = updateDepartureTime;
            updateDepartureTime();
        } catch (e) { console.error(e); }
    }

    document.getElementById('close-panel').onclick = () => document.getElementById('info-panel').classList.add('hidden');
}