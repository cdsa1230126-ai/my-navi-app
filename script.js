const mbToken = localStorage.getItem('mapbox_user_token');
const yhId = localStorage.getItem('yahoo_app_id');

if (!mbToken || !yhId) {
    document.getElementById('api-config-modal').classList.remove('hidden');
} else {
    startApp(mbToken, yhId);
}

document.getElementById('save-api-keys').addEventListener('click', () => {
    const mb = document.getElementById('mapbox-token-input').value.trim();
    const yh = document.getElementById('yahoo-id-input').value.trim();
    if (mb && yh) {
        localStorage.setItem('mapbox_user_token', mb);
        localStorage.setItem('yahoo_app_id', yh);
        location.reload();
    }
});

function startApp(mapboxToken, yahooId) {
    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [139.767, 35.681],
        zoom: 14
    });

    let currentLocation = null;
    let currentMarker = null;
    let destMarker = null;
    let restMarkers = []; // 黄色のピンを管理
    let isFirstLock = true;
    let displayMode = 'duration';
    let currentRouteData = null;

    // 渋滞レイヤー
    map.on('load', () => {
        map.addSource('mapbox-traffic', { type: 'vector', url: 'mapbox://mapbox.mapbox-traffic-v1' });
        map.addLayer({
            'id': 'traffic', 'type': 'line', 'source': 'mapbox-traffic', 'source-layer': 'traffic',
            'paint': {
                'line-width': 3,
                'line-color': ['match', ['get', 'congestion'], 'low', '#4caf50', 'moderate', '#ffeb3b', 'heavy', '#f44336', 'severe', '#8b0000', '#4caf50']
            }
        });
    });

    // 現在地追従
    navigator.geolocation.watchPosition(p => {
        currentLocation = [p.coords.longitude, p.coords.latitude];
        if (!currentMarker) {
            currentMarker = new mapboxgl.Marker({ color: '#007aff' }).setLngLat(currentLocation).addTo(map);
        } else {
            currentMarker.setLngLat(currentLocation);
        }
        if (isFirstLock) {
            map.flyTo({ center: currentLocation, zoom: 15 });
            isFirstLock = false;
        }
    }, null, { enableHighAccuracy: true });

    document.getElementById('recenter-btn').onclick = () => {
        if (currentLocation) map.flyTo({ center: currentLocation, zoom: 16 });
    };

    // Yahoo検索
    const searchBox = document.getElementById('search-box');
    searchBox.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) return;
        const url = `https://map.yahooapis.jp/search/local/V1/localSearch?appid=${yahooId}&query=${encodeURIComponent(query)}&output=json&callback=handleResults`;
        const script = document.createElement('script');
        script.src = url;
        document.body.appendChild(script);
        document.body.removeChild(script);
    });

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
                drawRoute(f.Name, [parseFloat(coords[0]), parseFloat(coords[1])]);
            };
            list.appendChild(li);
        });
    };

    // ルート描画
    async function drawRoute(name, destCoords) {
        if (!currentLocation) return;
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${currentLocation[0]},${currentLocation[1]};${destCoords[0]},${destCoords[1]}?geometries=geojson&overview=full&language=ja&access_token=${mapboxToken}`;
        const res = await fetch(url);
        const data = await res.json();
        currentRouteData = data.routes[0];

        if (map.getSource('route')) { map.removeLayer('route'); map.removeSource('route'); }
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: currentRouteData.geometry } });
        map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#007aff', 'line-width': 6, 'line-opacity': 0.6 } });

        if (destMarker) destMarker.remove();
        destMarker = new mapboxgl.Marker({ color: '#ff3b30' }).setLngLat(destCoords).addTo(map);

        map.fitBounds(new mapboxgl.LngLatBounds().extend(currentLocation).extend(destCoords), { padding: {top: 50, bottom: 450, left: 50, right: 50}, duration: 1000 });

        updatePanelUI(name);
        
        // ★修正点：ここ（目的地決定時）ではピン表示を呼び出さない
        // suggestRestAreas(currentRouteData); 
    }

    // --- インテリジェント休憩提案（黄色いピンを表示） ---
    async function suggestRestAreas(route) {
        // 古い休憩ピンを削除
        restMarkers.forEach(m => m.remove());
        restMarkers = [];

        const count = parseInt(document.getElementById('rest-count').value) || 0;
        if (count <= 0 || !route) return;

        const coords = route.geometry.coordinates;
        for (let i = 1; i <= count; i++) {
            const pt = coords[Math.floor((coords.length / (count + 1)) * i)];
            const url = `https://map.yahooapis.jp/search/local/V1/localSearch?appid=${yahooId}&lat=${pt[1]}&lon=${pt[0]}&dist=2&query=${encodeURIComponent('コンビニ サービスエリア 道の駅')}&output=json&results=1&callback=restCb${i}`;
            
            window[`restCb${i}`] = (data) => {
                if (data.Feature) {
                    const spot = data.Feature[0];
                    const sc = spot.Geometry.Coordinates.split(',');
                    
                    // 休憩地点に黄色のピンを立てる
                    const m = new mapboxgl.Marker({ color: '#FFD700' }) // イエロー/ゴールド
                        .setLngLat([parseFloat(sc[0]), parseFloat(sc[1])])
                        .setPopup(new mapboxgl.Popup().setHTML(`<b>休憩候補 ${i}</b><br>${spot.Name}`))
                        .addTo(map);
                    
                    restMarkers.push(m);
                }
            };
            const s = document.createElement('script'); s.src = url; document.body.appendChild(s);
        }
    }

    // UI更新 & トグル
    function updatePanelUI(name) {
        document.getElementById('info-panel').classList.remove('hidden');
        document.getElementById('destination-name').textContent = name;
        document.getElementById('route-distance').textContent = `${(currentRouteData.distance / 1000).toFixed(1)}km`;
        
        const durEl = document.getElementById('route-duration');
        const refreshTime = () => {
            if (displayMode === 'duration') {
                durEl.textContent = `${Math.round(currentRouteData.duration / 60)}分`;
            } else {
                const arr = new Date(Date.now() + (currentRouteData.duration * 1000));
                durEl.textContent = `${arr.getHours()}:${String(arr.getMinutes()).padStart(2,'0')}着`;
            }
        };
        durEl.onclick = () => { displayMode = (displayMode === 'duration') ? 'arrival' : 'duration'; refreshTime(); };
        refreshTime();

        // 逆算計算ロジック
        const calc = () => {
            const arrT = document.getElementById('target-arrival-time').value;
            const rTime = parseInt(document.getElementById('rest-time').value) || 0;
            const rCnt = parseInt(document.getElementById('rest-count').value) || 0;
            if (!arrT) return;
            const t = new Date(); const [h, m] = arrT.split(':'); t.setHours(h, m, 0);
            const dep = new Date(t.getTime() - (currentRouteData.duration * 1000) - (rTime * rCnt * 60 * 1000));
            document.getElementById('calc-time').textContent = `${String(dep.getHours()).padStart(2,'0')}:${String(dep.getMinutes()).padStart(2,'0')}`;
            document.getElementById('total-rest-info').textContent = `休憩合計: ${rTime * rCnt}分 (${rCnt}回)`;
            document.getElementById('departure-card').classList.remove('hidden');
        };
        // 設定変更時は逆算のみ更新
        document.querySelectorAll('.config-grid input').forEach(i => i.oninput = () => { calc(); });
        calc();

        // ★修正点：案内開始ボタンが押された時の処理を追加
        document.getElementById('start-nav').onclick = () => {
            alert('案内を開始します。休憩地点を表示します。');
            suggestRestAreas(currentRouteData); // ここで黄色いピンを表示
            
            // 将来的にナビゲーションモードへの切り替え（視点変更など）をここに書く
            map.flyTo({
                center: currentLocation,
                zoom: 18,
                pitch: 60, // 3D視点に
                bearing: map.getBearing(), // 現在の方角を維持
                essential: true
            });
        };
    }
    document.getElementById('close-panel').onclick = () => document.getElementById('info-panel').classList.add('hidden');
}