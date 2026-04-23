const modal = document.getElementById('api-config-modal');
const apiKeyInput = document.getElementById('api-key-input');
const saveBtn = document.getElementById('save-api-key');

let savedToken = localStorage.getItem('mapbox_user_token');
if (!savedToken) { modal.classList.remove('hidden'); } else { startApp(savedToken); }

saveBtn.addEventListener('click', () => {
    const token = apiKeyInput.value.trim();
    if (token.startsWith('pk.')) {
        localStorage.setItem('mapbox_user_token', token);
        location.reload();
    }
});

function startApp(token) {
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [139.767, 35.681],
        zoom: 14
    });

    const searchBox = document.getElementById('search-box');
    const suggestionsContainer = document.getElementById('suggestions-container');
    const suggestionsList = document.getElementById('suggestions');
    const routeInfoContainer = document.getElementById('route-info-container');

    let currentLocation = null;
    let userMarker = null;
    let destinationMarker = null;

    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(p => {
            currentLocation = [p.coords.longitude, p.coords.latitude];
            if (!userMarker) {
                userMarker = new mapboxgl.Marker({ color: '#007bff' }).setLngLat(currentLocation).addTo(map);
            } else { userMarker.setLngLat(currentLocation); }
        }, null, { enableHighAccuracy: true });
    }

    // ★今回の核心：入力された文字を多言語・多表記に広げる
    function getSearchVariants(query) {
        const variants = [query];
        // 有名スポットの翻訳辞書（ここを強化するとさらに賢くなります）
        const dictionary = {
            "東京タワー": ["Tokyo Tower", "Minato Shibakoen"],
            "スカイツリー": ["Tokyo Skytree"],
            "富士山": ["Mt. Fuji"],
            "浅草寺": ["Senso-ji Temple"]
        };
        if (dictionary[query]) variants.push(...dictionary[query]);
        
        // 簡易変換：駅名などの対応
        if (query.endsWith("駅")) variants.push(query.replace("駅", " Station"));
        return [...new Set(variants)];
    }

    searchBox.addEventListener('input', async (e) => {
        const query = e.target.value;
        if (!query || query.length < 2) { suggestionsContainer.classList.add('hidden'); return; }

        const variants = getSearchVariants(query);
        
        // ★複数の言語・キーワードで一斉に検索
        const fetchPromises = variants.map(v => 
            fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(v)}.json?access_token=${token}&limit=5&country=jp&types=poi,landmark,address&worldview=jp`)
            .then(r => r.json())
        );

        try {
            const results = await Promise.all(fetchPromises);
            let allFeatures = results.flatMap(data => data.features || []);

            // 重複排除（座標が同じものを消す）
            const seenCoords = new Set();
            allFeatures = allFeatures.filter(f => {
                const coord = f.geometry.coordinates.join(',');
                if (seenCoords.has(coord)) return false;
                seenCoords.add(coord);
                return true;
            });

            // POI（施設）を最優先にするソート
            allFeatures.sort((a, b) => {
                const priority = { 'poi': 1, 'landmark': 2, 'address': 3 };
                return (priority[a.place_type[0]] || 4) - (priority[b.place_type[0]] || 4);
            });

            renderSuggestions(allFeatures);
        } catch (err) { console.error("検索エラー:", err); }
    });

    function renderSuggestions(features) {
        suggestionsList.innerHTML = '';
        if (features.length > 0) {
            suggestionsContainer.classList.remove('hidden');
            features.forEach(f => {
                const li = document.createElement('li');
                // 地図が英語でも日本語名があれば優先表示
                const displayName = f.text_ja || f.text;
                li.innerHTML = `<strong>📍 ${displayName}</strong><br><small>${f.place_name}</small>`;
                li.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    handleSelection(f);
                });
                suggestionsList.appendChild(li);
            });
        } else {
            suggestionsContainer.classList.add('hidden');
        }
    }

    async function handleSelection(feature) {
        if (!currentLocation) return;
        const dest = feature.geometry.coordinates;
        suggestionsContainer.classList.add('hidden');
        searchBox.value = feature.text_ja || feature.text;
        searchBox.blur();

        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${currentLocation[0]},${currentLocation[1]};${dest[0]},${dest[1]}?geometries=geojson&overview=full&steps=true&language=ja&access_token=${token}`;
        
        const res = await fetch(url);
        const data = await res.json();
        if (!data.routes?.length) return;
        const route = data.routes[0];
        
        if (map.getSource('route')) { map.removeLayer('route'); map.removeSource('route'); }
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: route.geometry } });
        map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#007bff', 'line-width': 6 } });
        
        if (destinationMarker) destinationMarker.remove();
        destinationMarker = new mapboxgl.Marker({ color: 'red' }).setLngLat(dest).addTo(map);

        map.fitBounds(new mapboxgl.LngLatBounds(currentLocation, dest), { padding: 80 });

        document.getElementById('destination-name').textContent = `目的地: ${searchBox.value}`;
        document.getElementById('route-distance').textContent = `距離: ${(route.distance / 1000).toFixed(1)}km`;
        document.getElementById('route-duration').textContent = `時間: ${Math.round(route.duration / 60)}分`;
        routeInfoContainer.classList.remove('hidden');
    }
}