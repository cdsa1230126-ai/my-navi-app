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
        zoom: 14,
        pitchWithRotate: false,
        dragRotate: false
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

    // ★多言語・表記ゆれ生成関数
    function generateSearchQueries(input) {
        const queries = [input];
        // よくある有名施設の英語名を強制追加（Mapboxの多言語データ 対策）
        if (input.includes("東京タワー")) queries.push("Tokyo Tower");
        if (input.includes("スカイツリー")) queries.push("Skytree");
        if (input.includes("駅")) queries.push(input.replace("駅", " Station"));
        return [...new Set(queries)];
    }

    searchBox.addEventListener('input', async (e) => {
        const query = e.target.value;
        if (!query) { suggestionsContainer.classList.add('hidden'); return; }

        const searchTerms = generateSearchQueries(query);
        
        // 全てのクエリで並列検索を実行
        const promises = searchTerms.map(term => 
            fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(term)}.json?access_token=${token}&limit=5&country=jp&types=poi,landmark,address&fuzzyMatch=true&worldview=jp`)
            .then(res => res.json())
        );

        try {
            const results = await Promise.all(promises);
            let allFeatures = results.flatMap(data => data.features || []);

            // 重複排除（同じ座標の地点をまとめる）
            const seen = new Set();
            allFeatures = allFeatures.filter(f => {
                const coord = f.geometry.coordinates.join(',');
                return seen.has(coord) ? false : seen.add(coord);
            });

            // ★優先度ソート（POI/建物を最優先にし、地名を下げる）
            allFeatures.sort((a, b) => {
                const typePriority = { 'poi': 1, 'landmark': 2, 'address': 3 };
                return (typePriority[a.place_type[0]] || 4) - (typePriority[b.place_type[0]] || 4);
            });

            renderSuggestions(allFeatures);
        } catch (err) { console.error(err); }
    });

    function renderSuggestions(features) {
        suggestionsList.innerHTML = '';
        if (features.length > 0) {
            suggestionsContainer.classList.remove('hidden');
            features.forEach(f => {
                const li = document.createElement('li');
                const name = f.text_ja || f.text;
                const address = f.place_name_ja || f.place_name;
                li.innerHTML = `<strong>📍 ${name}</strong><br><small>${address}</small>`;
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