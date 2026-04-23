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
        center: [139.767, 35.681], // 東京中心
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

    // 入力中の検索（候補出し）
    searchBox.addEventListener('input', async (e) => {
        const query = e.target.value;
        if (!query || query.length < 1) { suggestionsContainer.classList.add('hidden'); return; }

        // ★対策1: typesから 'place' と 'region' を消去。poiとlandmarkに全振り。
        let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=8&country=jp&types=poi,landmark,address&autocomplete=true&worldview=jp`;
        
        if (currentLocation) url += `&proximity=${currentLocation[0]},${currentLocation[1]}`;

        try {
            const res = await fetch(url);
            const data = await res.json();
            suggestionsList.innerHTML = '';
            
            if (data.features?.length > 0) {
                suggestionsContainer.classList.remove('hidden');
                data.features.forEach(f => {
                    const li = document.createElement('li');
                    // ★対策2: 日本語・英語両方のデータを統合表示
                    const name = f.text_ja || f.text; 
                    const address = f.place_name_ja || f.place_name;
                    li.innerHTML = `<strong>📍 ${name}</strong><br><small>${address}</small>`;
                    li.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        handleSelection(f, query);
                    });
                    suggestionsList.appendChild(li);
                });
            }
        } catch (err) { console.error(err); }
    });

    // ★対策3: Enter確定時に「地名」を完全に無視して再検索
    searchBox.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            const query = searchBox.value;
            if (!query) return;

            // 建物(poi)のみに絞って1件だけ取得
            let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=1&country=jp&types=poi,landmark,address`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.features?.length > 0) {
                handleSelection(data.features[0], query);
            } else {
                alert("建物が見つかりません。より具体的な名称を入れてください。");
            }
        }
    });

    async function handleSelection(feature, originalQuery) {
        if (!currentLocation) return;
        const dest = feature.geometry.coordinates;
        suggestionsContainer.classList.add('hidden');
        
        // 画面上の表示名を固定
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