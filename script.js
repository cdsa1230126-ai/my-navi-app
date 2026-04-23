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

    // 現在地の取得
    navigator.geolocation.watchPosition(p => {
        currentLocation = [p.coords.longitude, p.coords.latitude];
    }, null, { enableHighAccuracy: true });

    // Yahoo! API 検索実行
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
            // JSONPでYahoo!検索を叩く
            const yahooUrl = `https://map.yahooapis.jp/search/local/V1/localSearch?appid=${yhId}&query=${encodeURIComponent(query)}&output=json&callback=handleYahooResults`;
            const script = document.createElement('script');
            script.src = yahooUrl;
            document.body.appendChild(script);
            document.body.removeChild(script);
        }, 500);
    });

    // Yahoo!の結果をリスト化し、クリックイベントを付与
    window.handleYahooResults = (data) => {
        searchLoader.classList.add('hidden');
        suggestionsList.innerHTML = '';
        if (!data.Feature) return;

        suggestionsContainer.classList.remove('hidden');
        data.Feature.forEach(f => {
            // Yahoo!の座標は "経度,緯度" の文字列
            const coords = f.Geometry.Coordinates.split(',');
            const lng = parseFloat(coords[0]);
            const lat = parseFloat(coords[1]);

            const li = document.createElement('li');
            li.innerHTML = `<strong>📍 ${f.Name}</strong><br><small>${f.Property.Address}</small>`;
            
            // ★ここが「建物名で目的地を設定」する核心部分
            li.onclick = () => {
                searchBox.value = f.Name; // 入力欄を建物名に書き換え
                suggestionsContainer.classList.add('hidden'); // リストを閉じる
                handleSelection(f.Name, [lng, lat]); // Mapboxに座標を渡してルート作成
            };
            suggestionsList.appendChild(li);
        });
    };

    // Mapbox Directions APIでルートを描画
    async function handleSelection(name, destCoords) {
        if (!currentLocation) {
            alert("現在地を取得中です。GPSをオンにして少しお待ちください。");
            return;
        }

        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${currentLocation[0]},${currentLocation[1]};${destCoords[0]},${destCoords[1]}?geometries=geojson&overview=full&language=ja&access_token=${mbToken}`;
        
        try {
            const res = await fetch(url);
            const routeData = await res.json();
            const route = routeData.routes[0];

            // 以前のルートを消して新しく描画
            if (map.getSource('route')) {
                map.removeLayer('route');
                map.removeSource('route');
            }

            map.addSource('route', {
                type: 'geojson',
                data: { type: 'Feature', geometry: route.geometry }
            });

            map.addLayer({
                id: 'route',
                type: 'line',
                source: 'route',
                paint: { 'line-color': '#007bff', 'line-width': 6 }
            });

            // 目的地にマーカーを立てる
            if (destinationMarker) destinationMarker.remove();
            destinationMarker = new mapboxgl.Marker({ color: 'red' })
                .setLngLat(destCoords)
                .addTo(map);

            // ルート全体が見えるようにズーム調整
            const bounds = new mapboxgl.LngLatBounds()
                .extend(currentLocation)
                .extend(destCoords);
            map.fitBounds(bounds, { padding: 80 });

            // 下部パネルに情報を表示
            document.getElementById('destination-name').textContent = name;
            document.getElementById('route-distance').textContent = `距離: ${(route.distance / 1000).toFixed(1)} km`;
            document.getElementById('route-duration').textContent = `時間: ${Math.round(route.duration / 60)} 分`;
            document.getElementById('route-info-container').classList.remove('hidden');

        } catch (error) {
            console.error("Route error:", error);
            alert("ルートが計算できませんでした。");
        }
    }
}