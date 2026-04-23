const modal = document.getElementById('api-config-modal');
const apiKeyInput = document.getElementById('api-key-input');
const saveBtn = document.getElementById('save-api-key');
const settingsBtn = document.getElementById('settings-button');

let savedToken = localStorage.getItem('mapbox_user_token');
if (!savedToken) { modal.classList.remove('hidden'); } else { startApp(savedToken); }

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
    let topSuggestion = null;

    // 現在地監視
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(p => {
            currentLocation = [p.coords.longitude, p.coords.latitude];
            if (!userMarker) {
                userMarker = new mapboxgl.Marker({ color: '#007bff' }).setLngLat(currentLocation).addTo(map);
            } else { userMarker.setLngLat(currentLocation); }
            if (isFollowing) map.easeTo({ center: currentLocation });
        }, null, { enableHighAccuracy: true });
    }

    followButton.addEventListener('click', () => {
        isFollowing = !isFollowing;
        followButton.classList.toggle('active', isFollowing);
    });

    // 施設名検索強化ロジック
    searchBox.addEventListener('input', async (e) => {
        const query = e.target.value;
        if (!query || query.length < 1) { 
            suggestionsContainer.classList.add('hidden'); 
            return; 
        }

        // 施設(poi)とランドマーク(landmark)を最優先。fuzzyMatchで入力ミスもカバー。
        let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=10&language=ja&country=jp&types=poi,landmark,place,address&autocomplete=true&fuzzyMatch=true`;
        
        if (currentLocation) {
            url += `&proximity=${currentLocation[0]},${currentLocation[1]}`;
        }

        try {
            const res = await fetch(url);
            const data = await res.json();
            suggestionsList.innerHTML = '';
            
            if (data.features?.length > 0) {
                topSuggestion = data.features[0];
                suggestionsContainer.classList.remove('hidden');

                data.features.forEach(f => {
                    const li = document.createElement('li');
                    const displayName = f.text_ja || f.text;
                    const address = f.place_name_ja || f.place_name;
                    
                    li.innerHTML = `<strong>📍 ${displayName}</strong><br><small>${address}</small>`;
                    
                    li.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        handleSelection(f);
                    });
                    suggestionsList.appendChild(li);
                });
            }
        } catch (err) { console.error(err); }
    });

    // キーボードのEnterで自動決定
    searchBox.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && topSuggestion) {
            handleSelection(topSuggestion);
        }
    });

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

        const bounds = new mapboxgl.LngLatBounds(currentLocation, dest);
        map.fitBounds(bounds, { padding: 80 });

        document.getElementById('destination-name').textContent = `目的地: ${feature.text_ja || feature.text}`;
        document.getElementById('route-distance').textContent = `距離: ${(route.distance / 1000).toFixed(1)}km`;
        document.getElementById('route-duration').textContent = `時間: ${Math.round(route.duration / 60)}分`;
        routeInfoContainer.classList.remove('hidden');
    }
}