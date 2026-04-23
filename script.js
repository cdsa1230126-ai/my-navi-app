import { initKeyboard } from './keyboard.js';

const modal = document.getElementById('api-config-modal');
const apiKeyInput = document.getElementById('api-key-input');
const saveBtn = document.getElementById('save-api-key');
const settingsBtn = document.getElementById('settings-button');

// 保存されたトークンを確認
let savedToken = localStorage.getItem('mapbox_user_token');

if (!savedToken) {
    modal.classList.remove('hidden');
} else {
    startApp(savedToken);
}

// 保存ボタン
saveBtn.addEventListener('click', () => {
    const token = apiKeyInput.value.trim();
    if (token.startsWith('pk.')) {
        localStorage.setItem('mapbox_user_token', token);
        location.reload();
    } else {
        alert("有効なMapboxトークンを入力してください");
    }
});

// 再設定ボタン
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
    let lastSpokenInstruction = "";

    function speak(text) {
        if (!text || text === lastSpokenInstruction) return;
        lastSpokenInstruction = text;
        window.speechSynthesis.cancel();
        const uttr = new SpeechSynthesisUtterance(text);
        uttr.lang = 'ja-JP';
        window.speechSynthesis.speak(uttr);
    }

    function showGuidance(msg) {
        const div = document.getElementById('guidance-message');
        div.textContent = msg;
        div.classList.remove('guidance-hidden');
        setTimeout(() => div.classList.add('guidance-hidden'), 3000);
    }

    function getDistance(c1, c2) {
        const R = 6371e3;
        const lat1 = c1[1] * Math.PI / 180;
        const lat2 = c2[1] * Math.PI / 180;
        const dLat = (c2[1] - c1[1]) * Math.PI / 180;
        const dLon = (c2[0] - c1[0]) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    initKeyboard(searchBox, showGuidance);

    navigator.geolocation.watchPosition(p => {
        currentLocation = [p.coords.longitude, p.coords.latitude];
        if (!userMarker) {
            userMarker = new mapboxgl.Marker({ color: 'green' }).setLngLat(currentLocation).addTo(map);
        } else {
            userMarker.setLngLat(currentLocation);
        }
        if (isFollowing) map.easeTo({ center: currentLocation });
        if (currentRouteSteps.length > 0 && !instructionBanner.classList.contains('hidden')) {
            updateInstruction(currentLocation);
        }
    }, null, { enableHighAccuracy: true });

    followButton.addEventListener('click', () => {
        isFollowing = !isFollowing;
        followButton.classList.toggle('active', isFollowing);
    });

    searchBox.addEventListener('click', () => document.body.classList.add('keyboard-active'));

    let searchTimeout;
    searchBox.addEventListener('input', (e) => {
        const query = e.target.value;
        clearTimeout(searchTimeout);
        if (!query) { suggestionsContainer.classList.add('hidden'); return; }
        searchTimeout = setTimeout(async () => {
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
        }, 300);
    });

    async function handleSelection(feature) {
        const dest = feature.geometry.coordinates;
        suggestionsContainer.classList.add('hidden');
        searchBox.value = feature.text;
        document.body.classList.remove('keyboard-active');

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
        isFollowing = true;
        instructionBanner.classList.remove('hidden');
        routeInfoContainer.classList.add('hidden');
        const first = currentRouteSteps[0].maneuver.instruction;
        nextStepText.textContent = first;
        speak(first);
    });

    function updateInstruction(loc) {
        if (currentRouteSteps.length === 0) return;
        if (getDistance(loc, currentRouteSteps[0].maneuver.location) < 30) {
            currentRouteSteps.shift();
            const msg = currentRouteSteps.length > 0 ? currentRouteSteps[0].maneuver.instruction : "到着しました";
            nextStepText.textContent = msg;
            speak(msg);
        }
    }
}