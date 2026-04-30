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
    let destinationMarker = null;
    let currentPosMarker = null; // ★現在地ピン用の変数

    // 現在地取得とピンの表示
    navigator.geolocation.watchPosition(
        p => {
            currentLocation = [p.coords.longitude, p.coords.latitude];
            console.log("現在地を取得しました:", currentLocation);

            // ★現在地に青いピンを指す（すでにある場合は位置を更新）
            if (!currentPosMarker) {
                currentPosMarker = new mapboxgl.Marker({ color: '#007bff' }) // 青色のピン
                    .setLngLat(currentLocation)
                    .setPopup(new mapboxgl.Popup().setHTML("現在地"))
                    .addTo(map);
            } else {
                currentPosMarker.setLngLat(currentLocation);
            }
        },
        e => {
            console.warn("位置情報の取得に失敗しました:", e.message);
        },
        { enableHighAccuracy: true }
    );

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
        let startPoint = currentLocation;
        if (!startPoint) {
            const center = map.getCenter();
            startPoint = [center.lng, center.lat];
        }

        const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${startPoint[0]},${startPoint[1]};${destCoords[0]},${destCoords[1]}?geometries=geojson&overview=full&language=ja&access_token=${mbToken}`;
        
        try {
            const res = await fetch(url);
            const data = await res.json();
            
            if (!data.routes || data.routes.length === 0) {
                alert("ルートが見つかりませんでした。");
                return;
            }

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
            
            map.fitBounds(new mapboxgl.LngLatBounds(startPoint, destCoords), { padding: 80 });

            const infoPanel = document.getElementById('info-panel');
            infoPanel.classList.remove('hidden');

            document.getElementById('destination-name').textContent = name;
            document.getElementById('route-distance').textContent = `${(route.distance / 1000).toFixed(1)} km`;
            document.getElementById('route-duration').textContent = `${Math.round(travelTimeSec / 60)} 分`;

            const updateDepartureTime = () => {
                const arrivalInput = document.getElementById('target-arrival-time').value;
                const restMin = parseInt(document.getElementById('rest-time').value) || 0;
                const resultBox = document.getElementById('departure-result');
                const calcDisplay = document.getElementById('calc-time');

                if (!arrivalInput) return;

                const [hours, minutes] = arrivalInput.split(':');
                const arrivalDate = new Date();
                arrivalDate.setHours(hours, minutes, 0);

                const departureTimeMs = arrivalDate.getTime() - (travelTimeSec * 1000) - (restMin * 60 * 1000);
                const departureDate = new Date(departureTimeMs);

                const depH = String(departureDate.getHours()).padStart(2, '0');
                const depM = String(departureDate.getMinutes()).padStart(2, '0');

                calcDisplay.textContent = `${depH}:${depM}`;
                resultBox.style.display = 'block';
            };

            document.getElementById('target-arrival-time').onchange = updateDepartureTime;
            document.getElementById('rest-time').oninput = updateDepartureTime;
            updateDepartureTime();

        } catch (error) {
            console.error("ルート取得エラー:", error);
        }
    }

    document.getElementById('close-panel').onclick = () => {
        document.getElementById('info-panel').classList.add('hidden');
    };
}