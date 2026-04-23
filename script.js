const modal = document.getElementById('api-config-modal');
const apiKeyInput = document.getElementById('api-key-input');
const saveBtn = document.getElementById('save-api-key');
const settingsBtn = document.getElementById('settings-button');

let savedToken = localStorage.getItem('mapbox_user_token');

if (!savedToken) {
    modal.classList.remove('hidden');
} else {
    startApp(savedToken);
}

saveBtn.addEventListener('click', () => {
    const token = apiKeyInput.value.trim();
    if (token.startsWith('pk.')) {
        localStorage.setItem('mapbox_user_token', token);
        location.reload();
    }
});

settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm("APIキーを再設定しますか？")) {
        localStorage.removeItem('mapbox_user_token');
        location.reload();
    }
});

function startApp(token) {
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [139.667, 35.281],
        zoom: 14,
        pitchWithRotate: false,
        dragRotate: false
    });

    const searchBox = document.getElementById('search-box');
    const suggestionsContainer = document.getElementById('suggestions-container');
    const suggestionsList = document.getElementById('suggestions');
    const routeInfoContainer = document.getElementById('route-info-container');
    const startRouteButton = document.getElementById('start-route-button');
    const followButton = document.getElementById('follow-button');

    let currentLocation = null;
    let userMarker = null;
    let destinationMarker = null;
    let isFollowing = true;

    // 現在地取得
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(p => {
            currentLocation = [p.coords.longitude, p.coords.latitude];
            if (!userMarker) {
                userMarker = new mapboxgl.Marker({ color: '#007bff' }).setLngLat(currentLocation).addTo(map);
            } else {
                userMarker.setLngLat(currentLocation);
            }
            if (isFollowing) map.easeTo({ center: currentLocation });
        }, null, { enableHighAccuracy: true });
    }

    followButton.addEventListener('click', () => {
        isFollowing = !isFollowing;
        followButton.classList.toggle('active', isFollowing);
    });

    // 検索入力（日本限定 + 現在地優先）
    searchBox.addEventListener('input', async (e) => {
        const query = e.target.value;
        if (!query) { suggestionsContainer.classList.add('hidden'); return; }

        // 日本国内(jp)に限定し、現在地(proximity)を優先
        let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=5&language=ja&country=jp`;
        if (currentLocation) {
            url += `&proximity=${currentLocation[0]},${currentLocation[1]}`;
        }

        const res = await fetch(url);
        const data = await res.json();
        
        suggestionsList.innerHTML = '';
        if (data.features?.length > 0) {
            suggestionsContainer.classList.remove('hidden');
            data.features.forEach(f => {
                const li = document.createElement('li');
                li.textContent = f.place_name;
                // スマホで反応しやすくするためmousedownを使用
                li.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    handleSelection(f);
                });
                suggestionsList.appendChild(li);
            });
        }
    });

    // 検索窓でEnterを押した時に一番上の候補を自動選択
    searchBox.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const first = suggestionsList.querySelector('li');
            if (first) first.dispatchEvent(new Event('mousedown'));
        }
    });

    async function handleSelection(feature) {
        if (!currentLocation) return;
        const dest = feature.geometry.coordinates;
        suggestionsContainer.classList.add('hidden');
        searchBox.value = feature.text;
        searchBox.blur();

        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${currentLocation[0]},${currentLocation[1]};${dest[0]},${dest[1]}?geometries=geojson&overview=full&steps=true&language=ja&access_token=${token}`;
        const res = await fetch(url);
        const data = await res.json();
        const route = data.routes[0];
        
        if (map.getSource('route')) { map.removeLayer('route'); map.removeSource('route'); }
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: route.geometry } });
        map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#007bff', 'line-width': 6 } });
        
        if (destinationMarker) destinationMarker.remove();
        destinationMarker = new mapboxgl.Marker({ color: 'red' }).setLngLat(dest).addTo(map);

        // 現在地と目的地が両方入るようにズーム調整
        const bounds = new mapboxgl.LngLatBounds(currentLocation, dest);
        map.fitBounds(bounds, { padding: 100 });

        document.getElementById('destination-name').textContent = `目的地: ${feature.text}`;
        document.getElementById('route-distance').textContent = `距離: ${(route.distance / 1000).toFixed(1)}km`;
        document.getElementById('route-duration').textContent = `時間: ${Math.round(route.duration / 60)}分`;
        routeInfoContainer.classList.remove('hidden');
        startRouteButton.classList.remove('hidden');
    }
}