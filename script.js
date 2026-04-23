// ブラウザの保存領域からキーを取得
const mapboxToken = localStorage.getItem('mapbox_user_token');
const yahooAppId = localStorage.getItem('yahoo_app_id');

const modal = document.getElementById('api-config-modal');

if (!mapboxToken || !yahooAppId) {
    modal.classList.remove('hidden');
} else {
    startApp(mapboxToken, yahooAppId);
}

// キーを保存する処理
document.getElementById('save-api-keys').addEventListener('click', () => {
    const mb = document.getElementById('mapbox-token-input').value.trim();
    const yh = document.getElementById('yahoo-id-input').value.trim();
    
    if (mb.startsWith('pk.') && yh.length > 10) {
        localStorage.setItem('mapbox_user_token', mb);
        localStorage.setItem('yahoo_app_id', yh);
        location.reload();
    } else {
        alert("正しいID/トークンを入力してください。");
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

    // 現在地取得
    navigator.geolocation.watchPosition(p => {
        currentLocation = [p.coords.longitude, p.coords.latitude];
    }, null, { enableHighAccuracy: true });

    let timeout = null;
    searchBox.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(timeout);
        if (!query) {
            searchLoader.classList.add('hidden');
            suggestionsContainer.classList.add('hidden');
            return;
        }

        timeout = setTimeout(() => {
            searchLoader.classList.remove('hidden');
            
            // ★Yahoo! APIで検索（JSONP方式）
            const yahooUrl = `https://map.yahooapis.jp/search/local/V1/localSearch?appid=${yhId}&query=${encodeURIComponent(query)}&output=json&callback=handleYahooResults`;
            const script = document.createElement('script');
            script.src = yahooUrl;
            document.body.appendChild(script);
            document.body.removeChild(script);
        }, 500);
    });

    // Yahoo!の検索結果を表示
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
                handleSelection(f.Name, [parseFloat(coords[0]), parseFloat(coords[1])]);
            };
            suggestionsList.appendChild(li);
        });
    };

    // ルート案内実行
    async function handleSelection(name, dest) {
        if (!currentLocation) return alert("現在地を取得中です...");
        suggestionsContainer.classList.add('hidden');
        searchBox.value = name;

        // Mapbox Directions APIで最短ルート計算
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${currentLocation[0]},${currentLocation[1]};${dest[0]},${dest[1]}?geometries=geojson&overview=full&language=ja&access_token=${mbToken}`;
        
        const res = await fetch(url);
        const data = await res.json();
        const route = data.routes[0];

        // 地図上にルートを描画
        if (map.getSource('route')) { map.removeLayer('route'); map.removeSource('route'); }
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: route.geometry } });
        map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#007bff', 'line-width': 5 } });

        // マーカー設置
        if (destinationMarker) destinationMarker.remove();
        destinationMarker = new mapboxgl.Marker({ color: 'red' }).setLngLat(dest).addTo(map);
        map.fitBounds(new mapboxgl.LngLatBounds(currentLocation, dest), { padding: 100 });

        // 情報パネル表示
        document.getElementById('destination-name').textContent = name;
        document.getElementById('route-distance').textContent = `${(route.distance / 1000).toFixed(1)} km`;
        document.getElementById('route-duration').textContent = `${Math.round(route.duration / 60)} 分`;
        document.getElementById('route-info-container').classList.remove('hidden');
    }
}