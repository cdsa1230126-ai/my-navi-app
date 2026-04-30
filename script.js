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

    const searchBox = document.getElementById('search-box');
    const searchLoader = document.getElementById('search-loader');
    const suggestionsContainer = document.getElementById('suggestions-container');
    const suggestionsList = document.getElementById('suggestions');

    let currentLocation = null;
    let currentPosMarker = null; // 現在地ピン
    let destinationMarker = null; // 目的地ピン

    // 現在地を監視してピンを立てる
    navigator.geolocation.watchPosition(p => {
        currentLocation = [p.coords.longitude, p.coords.latitude];
        if (!currentPosMarker) {
            currentPosMarker = new mapboxgl.Marker({ color: '#007bff' }).setLngLat(currentLocation).addTo(map);
        } else {
            currentPosMarker.setLngLat(currentLocation);
        }
    }, null, { enableHighAccuracy: true });

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

    async function drawRoute(name, destCoords) {
        if (!currentLocation) return alert("現在地を取得中です...");

        const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${currentLocation[0]},${currentLocation[1]};${destCoords[0]},${destCoords[1]}?geometries=geojson&overview=full&language=ja&access_token=${mbToken}`;
        
        const res = await fetch(url);
        const data = await res.json();
        const route = data.routes[0];
        const durationSec = route.duration;

        if (map.getSource('route')) {
            map.removeLayer('route');
            map.removeSource('route');
        }
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: route.geometry } });
        map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#007bff', 'line-width': 6 } });

        if (destinationMarker) destinationMarker.remove();
        destinationMarker = new mapboxgl.Marker({ color: 'red' }).setLngLat(destCoords).addTo(map);
        
        // ★ここが解決策！パディングの下側を大きく（350px）空ける
        const bounds = new mapboxgl.LngLatBounds()
            .extend(currentLocation)
            .extend(destCoords);

        map.fitBounds(bounds, {
            padding: {top: 100, bottom: 350, left: 60, right: 60},
            duration: 1500 // 1.5秒かけてスムーズにズーム
        });

        // 情報更新
        document.getElementById('destination-name').textContent = name;
        document.getElementById('route-distance').textContent = `${(route.distance / 1000).toFixed(1)} km`;
        document.getElementById('route-duration').textContent = `${Math.round(durationSec / 60)} 分`;
        document.getElementById('route-info-container').classList.remove('hidden');

        // 逆算タイマーロジック
        const updateCalc = () => {
            const arrivalTime = document.getElementById('target-arrival-time').value;
            const restMin = parseInt(document.getElementById('rest-time').value) || 0;
            if (!arrivalTime) return;

            const [h, m] = arrivalTime.split(':');
            const arrivalDate = new Date();
            arrivalDate.setHours(h, m, 0);

            // 出発時間 = 到着時間 - 移動時間 - 休憩
            const depMs = arrivalDate.getTime() - (durationSec * 1000) - (restMin * 60 * 1000);
            const d = new Date(depMs);
            
            document.getElementById('calc-time').textContent = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
            document.getElementById('departure-result').classList.remove('hidden');
        };

        document.getElementById('target-arrival-time').onchange = updateCalc;
        document.getElementById('rest-time').oninput = updateCalc;
        updateCalc();
    }

    document.getElementById('close-btn').onclick = () => {
        document.getElementById('route-info-container').classList.add('hidden');
    };
}