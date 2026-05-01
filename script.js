// --- 1. APIキー管理 ---
let savedToken = localStorage.getItem('mapbox_user_token');
let savedYahooId = localStorage.getItem('yahoo_app_id');

if (!savedToken || !savedYahooId || savedToken === 'YOUR_MAPBOX_TOKEN') {
    document.getElementById('api-config-modal').classList.remove('hidden');
} else {
    startApp(savedToken, savedYahooId);
}

document.getElementById('save-api-keys').onclick = () => {
    const mb = document.getElementById('mapbox-token-input').value.trim();
    const yh = document.getElementById('yahoo-id-input').value.trim();
    if (mb && yh) {
        localStorage.setItem('mapbox_user_token', mb);
        localStorage.setItem('yahoo_app_id', yh);
        location.reload();
    }
};

// --- 2. メインロジック ---
function startApp(token, yid) {
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [139.767, 35.681],
        zoom: 14,
        pitch: 0
    });

    let currentLocation = null;
    let currentMarker = null;
    let destMarker = null;
    let restMarkers = [];
    let currentRouteData = null;
    let finalDestination = null;
    let isFirstLocate = true;

    // A. 初期化とGPS
    map.on('load', () => {
        map.addSource('mapbox-traffic', { type: 'vector', url: 'mapbox://mapbox.mapbox-traffic-v1' });
        map.addLayer({
            'id': 'traffic', 'type': 'line', 'source': 'mapbox-traffic', 'source-layer': 'traffic',
            'paint': { 
                'line-width': 3, 
                'line-color': ['match', ['get', 'congestion'], 'low', '#4caf50', 'moderate', '#ffeb3b', 'heavy', '#f44336', 'severe', '#8b0000', '#4caf50'] 
            }
        });

        navigator.geolocation.watchPosition(p => {
            currentLocation = [p.coords.longitude, p.coords.latitude];
            if (!currentMarker) {
                currentMarker = new mapboxgl.Marker({ color: '#007aff' }).setLngLat(currentLocation).addTo(map);
            } else {
                currentMarker.setLngLat(currentLocation);
            }
            if (isFirstLocate) {
                map.easeTo({ center: currentLocation, zoom: 16, duration: 2000 });
                isFirstLocate = false;
            }
        }, err => console.error(err), { enableHighAccuracy: true });
    });

    // B. 高速/下道 切り替え
    document.getElementById('use-highways').onchange = function() {
        document.getElementById('route-type-label').textContent = this.checked ? "高速道路優先" : "一般道優先";
        if (finalDestination) {
            drawRoute(finalDestination.name, finalDestination.coords, token);
        }
    };

    // C. Yahoo! 検索
    const searchBox = document.getElementById('search-box');
    searchBox.oninput = (e) => {
        const q = e.target.value.trim();
        if (q.length < 2) return;
        const s = document.createElement('script');
        s.src = `https://map.yahooapis.jp/search/local/V1/localSearch?appid=${yid}&query=${encodeURIComponent(q)}&output=json&callback=handleResults`;
        document.body.appendChild(s);
        s.onload = () => s.remove();
    };

    window.handleResults = (data) => {
        const list = document.getElementById('suggestions');
        list.innerHTML = '';
        if (!data.Feature) return;
        document.getElementById('suggestions-container').classList.remove('hidden');
        data.Feature.forEach(f => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${f.Name}</strong><br><small>${f.Property.Address}</small>`;
            li.onclick = () => {
                document.getElementById('suggestions-container').classList.add('hidden');
                const coords = f.Geometry.Coordinates.split(',');
                finalDestination = { name: f.Name, coords: [parseFloat(coords[0]), parseFloat(coords[1])] };
                drawRoute(finalDestination.name, finalDestination.coords, token);
            };
            list.appendChild(li);
        });
    };

    // D. ルート描画 (経由地対応)
    async function drawRoute(name, destCoords, tk, waypoints = []) {
        if (!currentLocation) return;
        
        const useHighways = document.getElementById('use-highways').checked;
        const excludeParam = useHighways ? "" : "&exclude=motorway";

        let coordsChain = `${currentLocation[0]},${currentLocation[1]};`;
        waypoints.forEach(wp => { coordsChain += `${wp[0]},${wp[1]};`; });
        coordsChain += `${destCoords[0]},${destCoords[1]}`;

        const res = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordsChain}?geometries=geojson&overview=full&language=ja${excludeParam}&access_token=${tk}`);
        const data = await res.json();
        if (!data.routes || data.routes.length === 0) return;
        
        currentRouteData = data.routes[0];

        if (map.getSource('route')) { map.removeLayer('route'); map.removeSource('route'); }
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: currentRouteData.geometry } });
        map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#007aff', 'line-width': 6, 'line-opacity': 0.7 } });

        if (destMarker) destMarker.remove();
        destMarker = new mapboxgl.Marker({ color: '#ff3b30' }).setLngLat(destCoords).addTo(map);
        
        map.fitBounds(new mapboxgl.LngLatBounds().extend(currentLocation).extend(destCoords), { padding: 100 });
        updatePanelUI(name);
    }

    // E. 休憩地点検索 (高速ならSA/PA、下道なら道沿いコンビニ)
    async function planWithRestAreas(yid) {
        restMarkers.forEach(m => m.remove());
        restMarkers = [];
        const count = parseInt(document.getElementById('rest-count').value) || 0;
        if (count === 0) return [];

        const isHighways = document.getElementById('use-highways').checked;
        const searchQuery = isHighways ? "SA PA" : "コンビニ"; // 高速時はSA/PAを狙い撃ち
        const path = currentRouteData.geometry.coordinates;
        const foundWaypoints = [];

        for (let i = 1; i <= count; i++) {
            const splitIdx = Math.floor((path.length / (count + 1)) * i);
            const searchPt = path[splitIdx];

            const res = await new Promise(resolve => {
                const cb = `rest_cb_${i}_${Date.now()}`;
                window[cb] = (d) => resolve(d.Feature ? d.Feature[0].Geometry.Coordinates.split(',') : null);
                const s = document.createElement('script');
                // 検索距離を300m(0.3)に絞って道沿いを徹底
                s.src = `https://map.yahooapis.jp/search/local/V1/localSearch?appid=${yid}&lat=${searchPt[1]}&lon=${searchPt[0]}&dist=0.3&query=${encodeURIComponent(searchQuery)}&output=json&results=1&callback=${cb}`;
                document.body.appendChild(s);
            });

            if (res) {
                const pos = [parseFloat(res[0]), parseFloat(res[1])];
                foundWaypoints.push(pos);
                const m = new mapboxgl.Marker({ color: '#FFD700' }).setLngLat(pos).addTo(map);
                restMarkers.push(m);
            }
        }
        return foundWaypoints;
    }

    // F. UI更新 & 到着逆算
    function updatePanelUI(name) {
        document.getElementById('info-panel').classList.remove('hidden');
        document.getElementById('destination-name').textContent = name;
        document.getElementById('route-distance').textContent = `${(currentRouteData.distance / 1000).toFixed(1)}km`;
        document.getElementById('route-duration').textContent = `${Math.round(currentRouteData.duration / 60)}分`;

        const calc = () => {
            const arrT = document.getElementById('target-arrival-time').value;
            const rTime = parseInt(document.getElementById('rest-time').value) || 0;
            const rCnt = parseInt(document.getElementById('rest-count').value) || 0;
            if (!arrT) return;
            const t = new Date(); const [h, m] = arrT.split(':'); t.setHours(h, m, 0);
            const dep = new Date(t.getTime() - (currentRouteData.duration * 1000) - (rTime * rCnt * 60 * 1000));
            document.getElementById('calc-time').textContent = `${String(dep.getHours()).padStart(2,'0')}:${String(dep.getMinutes()).padStart(2,'0')}`;
            document.getElementById('departure-card').classList.remove('hidden');
        };
        document.querySelectorAll('.config-grid input, select').forEach(el => el.oninput = calc);
        calc();
    }

    // G. 案内開始・終了
    document.getElementById('start-nav').onclick = async () => {
        if (!currentRouteData) return;
        const wps = await planWithRestAreas(yid);
        await drawRoute(finalDestination.name, finalDestination.coords, token, wps);
        
        document.getElementById('pre-nav-content').classList.add('hidden');
        document.getElementById('nav-active-content').classList.remove('hidden');
        document.getElementById('nav-banner').classList.remove('hidden');
        
        const arr = new Date(Date.now() + (currentRouteData.duration * 1000));
        document.getElementById('banner-arrival').textContent = `${arr.getHours()}:${String(arr.getMinutes()).padStart(2,'0')}`;
        
        map.flyTo({ center: currentLocation, zoom: 17, pitch: 60, essential: true });
    };

    document.getElementById('stop-nav').onclick = () => location.reload();
    document.getElementById('close-panel').onclick = () => document.getElementById('info-panel').classList.add('hidden');
    document.getElementById('recenter-btn').onclick = () => map.flyTo({ center: currentLocation, zoom: 16 });
    document.getElementById('view-toggle-btn').onclick = function() {
        const is3D = map.getPitch() > 0;
        map.easeTo({ pitch: is3D ? 0 : 60 });
        this.innerHTML = is3D ? '3D' : '2D';
    };
}