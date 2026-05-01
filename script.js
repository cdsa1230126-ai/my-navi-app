let savedToken = localStorage.getItem('mapbox_user_token');
let savedYahooId = localStorage.getItem('yahoo_app_id');

if (!savedToken || !savedYahooId) {
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

function startApp(token, yid) {
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [139.767, 35.681],
        zoom: 14
    });

    let currentLocation = null, currentMarker = null, destMarker = null, restMarkers = [];
    let currentRouteData = null, finalDestination = null, isFirstLocate = true;

    map.on('load', () => {
        navigator.geolocation.watchPosition(p => {
            currentLocation = [p.coords.longitude, p.coords.latitude];
            if (!currentMarker) currentMarker = new mapboxgl.Marker({ color: '#007aff' }).setLngLat(currentLocation).addTo(map);
            else currentMarker.setLngLat(currentLocation);
            if (isFirstLocate) { map.easeTo({ center: currentLocation, zoom: 15 }); isFirstLocate = false; }
        }, null, { enableHighAccuracy: true });
    });

    // 2D/3D 切り替え (修正版)
    document.getElementById('view-toggle-btn').onclick = function() {
        const is3D = map.getPitch() > 0;
        map.easeTo({ pitch: is3D ? 0 : 60, duration: 500 });
        this.innerHTML = is3D ? '3D' : '2D';
    };

    document.getElementById('use-highways').onchange = function() {
        document.getElementById('route-type-label').textContent = this.checked ? "高速道路優先" : "一般道優先";
        if (finalDestination) drawRoute(finalDestination.name, finalDestination.coords, token);
    };

    const searchBox = document.getElementById('search-box');
    searchBox.oninput = (e) => {
        const q = e.target.value.trim();
        if (q.length < 2) return;
        const s = document.createElement('script');
        s.src = `https://map.yahooapis.jp/search/local/V1/localSearch?appid=${yid}&query=${encodeURIComponent(q)}&output=json&callback=handleResults`;
        document.body.appendChild(s);
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
                document.getElementById('route-options-container').classList.remove('hidden');
                const c = f.Geometry.Coordinates.split(',');
                finalDestination = { name: f.Name, coords: [parseFloat(c[0]), parseFloat(c[1])] };
                drawRoute(finalDestination.name, finalDestination.coords, token);
            };
            list.appendChild(li);
        });
    };

    async function drawRoute(name, destCoords, tk, waypoints = []) {
        const useHigh = document.getElementById('use-highways').checked;
        const exclude = useHigh ? "" : "&exclude=motorway";
        let chain = `${currentLocation[0]},${currentLocation[1]};`;
        waypoints.forEach(w => chain += `${w[0]},${w[1]};`);
        chain += `${destCoords[0]},${destCoords[1]}`;

        const res = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${chain}?geometries=geojson&overview=full&language=ja${exclude}&access_token=${tk}`);
        const data = await res.json();
        if (!data.routes) return;
        currentRouteData = data.routes[0];

        if (map.getSource('route')) { map.removeLayer('route'); map.removeSource('route'); }
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: currentRouteData.geometry } });
        map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#007aff', 'line-width': 6, 'line-opacity': 0.7 } });

        if (destMarker) destMarker.remove();
        destMarker = new mapboxgl.Marker({ color: '#ff3b30' }).setLngLat(destCoords).addTo(map);
        updatePanelUI(name);
    }

    async function planWithRestAreas(yid) {
        restMarkers.forEach(m => m.remove()); restMarkers = [];
        const count = parseInt(document.getElementById('rest-count').value);
        if (count === 0) return [];

        const isHigh = document.getElementById('use-highways').checked;
        const query = isHigh ? "SA PA" : "コンビニ";
        const path = currentRouteData.geometry.coordinates;
        const wps = [];

        for (let i = 1; i <= count; i++) {
            const pt = path[Math.floor((path.length / (count + 1)) * i)];
            const res = await new Promise(resolve => {
                const cb = `cb_${Date.now()}_${i}`;
                window[cb] = (d) => resolve(d.Feature ? d.Feature[0].Geometry.Coordinates.split(',') : null);
                const s = document.createElement('script');
                s.src = `https://map.yahooapis.jp/search/local/V1/localSearch?appid=${yid}&lat=${pt[1]}&lon=${pt[0]}&dist=0.3&query=${encodeURIComponent(query)}&output=json&results=1&callback=${cb}`;
                document.body.appendChild(s);
            });
            if (res) {
                const pos = [parseFloat(res[0]), parseFloat(res[1])];
                wps.push(pos);
                restMarkers.push(new mapboxgl.Marker({ color: '#FFD700' }).setLngLat(pos).addTo(map));
            }
        }
        return wps;
    }

    function updatePanelUI(name) {
        document.getElementById('info-panel').classList.remove('hidden');
        document.getElementById('destination-name').textContent = name;
        document.getElementById('route-distance').textContent = `${(currentRouteData.distance / 1000).toFixed(1)}km`;
        document.getElementById('route-duration').textContent = `${Math.round(currentRouteData.duration / 60)}分`;

        const calc = () => {
            const arrT = document.getElementById('target-arrival-time').value;
            const rTime = parseInt(document.getElementById('rest-time').value);
            const rCnt = parseInt(document.getElementById('rest-count').value);
            if (!arrT) return;
            const t = new Date(); const [h, m] = arrT.split(':'); t.setHours(h, m, 0);
            const dep = new Date(t.getTime() - (currentRouteData.duration * 1000) - (rTime * rCnt * 60000));
            document.getElementById('calc-time').textContent = `${String(dep.getHours()).padStart(2,'0')}:${String(dep.getMinutes()).padStart(2,'0')}`;
            document.getElementById('departure-card').classList.remove('hidden');
        };
        document.querySelectorAll('.config-grid select, .config-grid input').forEach(el => el.onchange = calc);
        calc();
    }

    document.getElementById('start-nav').onclick = async () => {
        const wps = await planWithRestAreas(yid);
        await drawRoute(finalDestination.name, finalDestination.coords, token, wps);
        document.getElementById('pre-nav-content').classList.add('hidden');
        document.getElementById('nav-active-content').classList.remove('hidden');
        document.getElementById('nav-banner').classList.remove('hidden');
        map.flyTo({ center: currentLocation, zoom: 17, pitch: 60 });
        document.getElementById('view-toggle-btn').innerHTML = '2D';
    };

    document.getElementById('stop-nav').onclick = () => location.reload();
    document.getElementById('recenter-btn').onclick = () => map.flyTo({ center: currentLocation, zoom: 16 });
}