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
        pitchWithRotate: false
    });

    const searchBox = document.getElementById('search-box');
    const searchLoader = document.getElementById('search-loader');
    const suggestionsContainer = document.getElementById('suggestions-container');
    const suggestionsList = document.getElementById('suggestions');
    const routeInfoContainer = document.getElementById('route-info-container');

    let currentLocation = null;
    let userMarker = null;
    let destinationMarker = null;

    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(p => {
            // ★422エラー対策: 座標の精度を小数点6桁に固定して不正な文字列混入を防ぐ
            currentLocation = [
                parseFloat(p.coords.longitude.toFixed(6)),
                parseFloat(p.coords.latitude.toFixed(6))
            ];
            if (!userMarker) {
                userMarker = new mapboxgl.Marker({ color: '#007bff' }).setLngLat(currentLocation).addTo(map);
            } else { userMarker.setLngLat(currentLocation); }
        }, err => console.error("位置情報取得失敗:", err), { enableHighAccuracy: true });
    }

    // 多言語バリエーション生成（以前のアイデアを実装）
    function getSearchVariants(query) {
        const variants = [query];
        const dict = {
            "東京タワー": ["Tokyo Tower"],
            "スカイツリー": ["Tokyo Skytree"],
            "羽田空港": ["Haneda Airport"],
            "成田空港": ["Narita Airport"]
        };
        if (dict[query]) variants.push(...dict[query]);
        return [...new Set(variants)];
    }

    let searchTimeout = null;
    searchBox.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(searchTimeout);

        if (!query) {
            suggestionsContainer.classList.add('hidden');
            searchLoader.classList.add('hidden');
            return;
        }

        searchTimeout = setTimeout(async () => {
            // ★演出：探していますを表示
            searchLoader.classList.remove('hidden');
            suggestionsContainer.classList.add('hidden');

            const variants = getSearchVariants(query);
            const promises = variants.map(v => {
                // ★422エラー対策: proximityの値をクリーンに構築
                let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(v)}.json?access_token=${token}&limit=5&country=jp&types=poi,landmark,address&worldview=jp`;
                if (currentLocation) {
                    url += `&proximity=${currentLocation[0]},${currentLocation[1]}`;
                }
                return fetch(url).then(r => r.ok ? r.json() : null);
            });

            try {
                const results = await Promise.all(promises);
                let allFeatures = results.filter(r => r).flatMap(data => data.features || []);

                // 重複排除とPOI優先
                const seen = new Set();
                allFeatures = allFeatures.filter(f => {
                    const coord = f.geometry.coordinates.join(',');
                    return seen.has(coord) ? false : seen.add(coord);
                }).sort((a, b) => {
                    const prio = { 'poi': 1, 'landmark': 2, 'address': 3 };
                    return (prio[a.place_type[0]] || 4) - (prio[b.place_type[0]] || 4);
                });

                renderSuggestions(allFeatures);
            } catch (err) {
                console.error("検索エラー:", err);
            } finally {
                searchLoader.classList.add('hidden');
            }
        }, 600); // 少し長めに待ってから検索（通信節約）
    });

    function renderSuggestions(features) {
        suggestionsList.innerHTML = '';
        if (features.length > 0) {
            suggestionsContainer.classList.remove('hidden');
            features.forEach(f => {
                const li = document.createElement('li');
                li.innerHTML = `<strong>📍 ${f.text_ja || f.text}</strong><br><small>${f.place_name_ja || f.place_name}</small>`;
                li.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    handleSelection(f);
                });
                suggestionsList.appendChild(li);
            });
        }
    }

    async function handleSelection(feature) {
        if (!currentLocation) return;
        const dest = feature.geometry.coordinates;
        suggestionsContainer.classList.add('hidden');
        searchBox.value = feature.text_ja || feature.text;

        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${currentLocation[0]},${currentLocation[1]};${dest[0]},${dest[1]}?geometries=geojson&overview=full&steps=true&language=ja&access_token=${token}`;
        
        try {
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
        } catch (e) { console.error("ルート取得エラー:", e); }
    }
}