// keyboard.js の import は不要になったので削除

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

settingsBtn.addEventListener('click', () => {
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
    const instructionBanner = document.getElementById('instruction-banner');
    const nextStepText = document.getElementById('next-step-text');

    let currentLocation = null;
    let userMarker = null;
    let destinationMarker = null;
    let isFollowing = true;
    let currentRouteSteps = [];

    // 音声
    function speak(text) {
        window.speechSynthesis.cancel();
        const uttr = new SpeechSynthesisUtterance(text);
        uttr.lang = 'ja-JP';
        window.speechSynthesis.speak(uttr);
    }

    // 位置情報
    navigator.geolocation.watchPosition(p => {
        currentLocation = [p.coords.longitude, p.coords.latitude];
        if (!userMarker) {
            userMarker = new mapboxgl.Marker({ color: 'green' }).setLngLat(currentLocation).addTo(map);
        } else {
            userMarker.setLngLat(currentLocation);
        }
        if (isFollowing) map.easeTo({ center: currentLocation });
    }, null, { enableHighAccuracy: true });

    followButton.addEventListener('click', () => {
        isFollowing = !isFollowing;
        followButton.classList.toggle('active', isFollowing);
    });

    // 検索窓での入力イベント
    searchBox.addEventListener('input', async (e) => {
        const query = e.target.value;
        if (!query) { suggestionsContainer.classList.add('hidden'); return; }

        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=5&language=ja`;
        const res = await fetch(url);
        const data = await res.json();
        
        suggestionsList.innerHTML = '';
        if (data.features?.length > 0) {
            suggestionsContainer.classList.remove('hidden');
            data.features.forEach(f => {
                const li = document.createElement('li');
                li.textContent = f.text + (f.context ? ` (${f.context[0].text})` : '');
                li.onclick = () => handleSelection(f);
                suggestionsList.appendChild(li);
            });
        }
    });

    // 候補を選択したとき
    async function handleSelection(feature) {
        const dest = feature.geometry.coordinates;
        suggestionsContainer.classList.add('hidden');
        searchBox.value = feature.text;
        searchBox.blur(); // キーボードを閉じる

        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${currentLocation[0]},${currentLocation[1]};${dest[0]},${dest[1]}?geometries=geojson&overview=full&steps=true&language=ja&access_token=${token}`;
        const res = await fetch(url);
        const data = await res.json();
        const route = data.routes[0];
        currentRouteSteps = route.legs[0].steps;
        
        if (map.getSource('route')) { map.removeLayer('route'); map.removeSource('route'); }
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: route.geometry } });
        map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#007bff', 'line-width': 6 } });
        
        if (destinationMarker) destinationMarker.remove();
        destinationMarker = new mapboxgl.Marker({ color: 'red' }).setLngLat(dest).addTo(map);

        document.getElementById('destination-name').textContent = `目的地: ${feature.text}`;
        document.getElementById('route-distance').textContent = `距離: ${(route.distance / 1000).toFixed(1)}km`;
        document.getElementById('route-duration').textContent = `時間: ${Math.round(route.duration / 60)}分`;
        routeInfoContainer.classList.remove('hidden');
        startRouteButton.classList.remove('hidden');
    }

    startRouteButton.addEventListener('click', () => {
        instructionBanner.classList.remove('hidden');
        routeInfoContainer.classList.add('hidden');
        const first = currentRouteSteps[0].maneuver.instruction;
        nextStepText.textContent = first;
        speak(first);
    });
}