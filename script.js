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
        zoom: 13
    });

    let currentLocation = null;
    let currentPosMarker = null;
    let destinationMarker = null;
    let isFirstLocation = true;

    const statusEl = document.getElementById('location-status');

    // 現在地監視
    navigator.geolocation.watchPosition(p => {
        currentLocation = [p.coords.longitude, p.coords.latitude];
        if (statusEl) statusEl.style.display = 'none';

        if (!currentPosMarker) {
            currentPosMarker = new mapboxgl.Marker({ color: '#007bff' }).setLngLat(currentLocation).addTo(map);
        } else {
            currentPosMarker.setLngLat(currentLocation);
        }

        if (isFirstLocation) {
            map.flyTo({ center: currentLocation, zoom: 14, essential: true });
            isFirstLocation = false;
        }
    }, e => {
        if (!currentLocation && statusEl) {
            statusEl.style.display = 'block';
            statusEl.textContent = "📍 現在地を取得できません。位置情報を許可してください。";
        }
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });

    // Yahoo!検索
    const searchBox = document.getElementById('search-box');
    const searchLoader = document.getElementById('search-loader');
    const suggestionsContainer = document.getElementById('suggestions-container');
    const suggestionsList = document.getElementById('suggestions');

    let searchTimeout = null;
    searchBox.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(searchTimeout);
        if (!query) {
            suggestionsContainer.classList.add('hidden');
            return;
        }

        searchTimeout = setTimeout(() => {
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
            const li = document.createElement('li');
            li.innerHTML = `<strong>📍 ${f.Name}</strong><br><small>${f.Property.Address}</small>`;
            li.onclick = () => {
                searchBox.value = f.Name;
                suggestionsContainer.classList.add('hidden');
                drawRoute(f.Name, [parseFloat(coords[0]), parseFloat(coords[1])]);
            };
            suggestionsList.appendChild(li);
        });
    };

    async function drawRoute(name, destCoords) {
        if (!currentLocation) return alert("現在地を取得中です。");

        const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${currentLocation[0]},${currentLocation[1]};${destCoords[0]},${destCoords[1]}?geometries=geojson&overview=full&language=ja&access_token=${mbToken}`;
        
        try {
            const res = await fetch(url);
            const data = await res.json();
            const route = data.routes[0];
            const travelTimeSec = route.duration;

            // ルート描画
            if (map.getSource('route')) {
                map.removeLayer('route');
                map.removeSource('route');
            }
            map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: route.geometry } });
            map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#007bff', 'line-width': 6 } });

            // 目的地マーカー
            if (destinationMarker) destinationMarker.remove();
            destinationMarker = new mapboxgl.Marker({ color: 'red' }).setLngLat(destCoords).addTo(map);

            // ★重要：出発地(青)と目的地(赤)が両方収まるように調整
            const bounds = new mapboxgl.LngLatBounds()
                .extend(currentLocation)
                .extend(destCoords);

            map.fitBounds(bounds, {
                padding: {top: 80, bottom: 350, left: 60, right: 60}, // パネルが被る下側の余白を大きく確保
                duration: 1200
            });

            // パネル表示と計算
            document.getElementById('info-panel').classList.remove('hidden');
            document.getElementById('destination-name').textContent = name;
            document.getElementById('route-distance').textContent = `${(route.distance / 1000).toFixed(1)} km`;
            document.getElementById('route-duration').textContent = `${Math.round(travelTimeSec / 60)} 分`;

            const updateCalc = () => {
                const arrival = document.getElementById('target-arrival-time').value;
                const rest = parseInt(document.getElementById('rest-time').value) || 0;
                if (!arrival) return;

                const [h, m] = arrival.split(':');
                const arrivalDate = new Date();
                arrivalDate.setHours(h, m, 0);

                // 出発時間 = 到着時間 - 走行時間 - 休憩時間
                const depMs = arrivalDate.getTime() - (travelTimeSec * 1000) - (rest * 60 * 1000);
                const d = new Date(depMs);
                document.getElementById('calc-time').textContent = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                document.getElementById('departure-result').style.display = 'block';
            };

            document.getElementById('target-arrival-time').onchange = updateCalc;
            document.getElementById('rest-time').oninput = updateCalc;
            updateCalc();

        } catch (e) { console.error(e); }
    }

    document.getElementById('close-panel').onclick = () => document.getElementById('info-panel').classList.add('hidden');
}