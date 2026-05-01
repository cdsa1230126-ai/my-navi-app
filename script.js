// --- 1. APIキー管理システム ---
let savedToken = localStorage.getItem('mapbox_user_token');
let savedYahooId = localStorage.getItem('yahoo_app_id');

// キーがない、またはダミーの場合はモーダル表示
if (savedToken === 'YOUR_MAPBOX_TOKEN' || !savedToken || !savedYahooId) {
    document.getElementById('api-config-modal').classList.remove('hidden');
} else {
    startApp(savedToken, savedYahooId);
}

document.getElementById('save-api-keys').onclick = () => {
    const mb = document.getElementById('mapbox-token-input').value.trim();
    const yh = document.getElementById('yahoo-id-input').value.trim();
    if (mb && yh && mb !== 'YOUR_MAPBOX_TOKEN') {
        localStorage.setItem('mapbox_user_token', mb);
        localStorage.setItem('yahoo_app_id', yh);
        location.reload();
    } else {
        alert("正しいAPIキーを入力してください。");
    }
};

// --- 2. メインアプリ機能 ---
function startApp(token, yid) {
    mapboxgl.accessToken = token;
    
    const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [139.767, 35.681], // 初期値（東京駅）
        zoom: 14,
        pitch: 0 // 初期は2D
    });

    let currentLocation = null;
    let currentMarker = null;
    let destMarker = null;
    let restMarkers = [];
    let currentRouteData = null;
    let isFirstLocate = true; 
    let finalDestination = null;

    // 地図が読み込まれた際の処理
    map.on('load', () => {
        // 渋滞レイヤーの追加
        map.addSource('mapbox-traffic', { type: 'vector', url: 'mapbox://mapbox.mapbox-traffic-v1' });
        map.addLayer({
            'id': 'traffic', 'type': 'line', 'source': 'mapbox-traffic', 'source-layer': 'traffic',
            'paint': { 
                'line-width': 3, 
                'line-color': ['match', ['get', 'congestion'], 'low', '#4caf50', 'moderate', '#ffeb3b', 'heavy', '#f44336', 'severe', '#8b0000', '#4caf50'] 
            }
        });

        // 位置情報の監視と初回ジャンプ
        navigator.geolocation.watchPosition(p => {
            currentLocation = [p.coords.longitude, p.coords.latitude];
            
            // 現在地マーカー
            if (!currentMarker) {
                currentMarker = new mapboxgl.Marker({ color: '#007aff' }).setLngLat(currentLocation).addTo(map);
            } else {
                currentMarker.setLngLat(currentLocation);
            }

            // 初回のみスムーズに現在地へ移動
            if (isFirstLocate) {
                map.easeTo({
                    center: currentLocation,
                    zoom: 15,
                    duration: 2000,
                    essential: true
                });
                isFirstLocate = false;
            }
        }, err => console.error("GPS取得エラー:", err), { enableHighAccuracy: true });
    });

    // --- UI操作系（以前の白い丸型ボタンのデザインに対応） ---

    // 📍現在地に戻るボタン
    document.getElementById('recenter-btn').onclick = () => { 
        if (currentLocation) map.flyTo({ center: currentLocation, zoom: 16 }); 
    };

    // 2D/3D切り替え（修正：確実に切り替わるようにしました）
    document.getElementById('view-toggle-btn').onclick = function() {
        const currentPitch = map.getPitch();
        const isCurrently3D = currentPitch > 0;
        
        const targetPitch = isCurrently3D ? 0 : 60;
        const buttonText = isCurrently3D ? '3D' : '2D';
        
        map.easeTo({ pitch: targetPitch, duration: 500 });
        this.innerHTML = buttonText;
    };

    // 🆕 道路種別の切り替え（機能維持、UI戻しに対応）
    document.getElementById('use-highways').onchange = function() {
        document.getElementById('route-type-label').textContent = this.checked ? "高速道路優先" : "一般道優先";
        if (finalDestination) {
            drawRoute(finalDestination.name, finalDestination.coords, token);
        }
    };

    // Yahoo! 地名検索
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
                document.getElementById('route-options-container').classList.remove('hidden'); // スイッチを表示
                const coords = f.Geometry.Coordinates.split(',');
                finalDestination = { name: f.Name, coords: [parseFloat(coords[0]), parseFloat(coords[1])] };
                drawRoute(finalDestination.name, finalDestination.coords, token);
            };
            list.appendChild(li);
        });
    };

    // ルート描画（経由地 waypoint に対応、高速/下道対応）
    async function drawRoute(name, destCoords, tk, waypoints = []) {
        if (!currentLocation) return;
        
        const useHighways = document.getElementById('use-highways').checked;
        const excludeParam = useHighways ? "" : "&exclude=motorway"; // 下道優先なら exclude=motorway

        // Waypointsを含めた座標列を作成 (現在地 -> 休憩1 -> 目的地)
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
        map.fitBounds(new mapboxgl.LngLatBounds().extend(currentLocation).extend(destCoords), { padding: {top: 50, bottom: 250, left: 50, right: 50} });
        
        updatePanelUI(name);
    }

    // 🆕 休憩地点の検索と経由設定（機能維持、SA/PA vs コンビニ対応）
    async function planWithRestAreas(yid) {
        restMarkers.forEach(m => m.remove());
        restMarkers = [];
        
        // シンプルUIに戻したため、休憩設定は固定値（1回）で行います
        const count = 1;
        if (!currentRouteData) return [];

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

    // パネル更新ロジック（シンプルな以前のデザインに合わせました）
    function updatePanelUI(name) {
        document.getElementById('info-panel').classList.remove('hidden');
        document.getElementById('destination-name').textContent = name;
        document.getElementById('route-distance').textContent = `${(currentRouteData.distance / 1000).toFixed(1)}km`;
        document.getElementById('route-duration').textContent = `${Math.round(currentRouteData.duration / 60)}分`;
    }

    // 案内開始・終了（以前のロジックをベースに機能統合）
    document.getElementById('start-nav').onclick = async () => {
        if (!currentRouteData) return;
        
        // 休憩地点をルートに組み込む
        const waypoints = await planWithRestAreas(yid);
        await drawRoute(finalDestination.name, finalDestination.coords, token, waypoints);
        
        document.getElementById('pre-nav-content').classList.add('hidden');
        document.getElementById('nav-active-content').classList.remove('hidden');
        document.getElementById('search-container').style.transform = 'translateY(-120px)';
        document.getElementById('route-options-container').classList.add('hidden'); // スイッチを隠す
        
        const banner = document.getElementById('nav-banner');
        banner.classList.remove('hidden');
        const arr = new Date(Date.now() + (currentRouteData.duration * 1000));
        document.getElementById('banner-arrival').textContent = `${arr.getHours()}:${String(arr.getMinutes()).padStart(2,'0')}`;
        
        // 自動で3D視点へ（修正：view-toggle-btnの状態も更新）
        const viewToggleBtn = document.getElementById('view-toggle-btn');
        map.flyTo({ center: currentLocation, zoom: 17, pitch: 60, essential: true });
        viewToggleBtn.innerHTML = '2D';
    };

    document.getElementById('stop-nav').onclick = () => location.reload();

    document.getElementById('close-panel').onclick = () => document.getElementById('info-panel').classList.add('hidden');
}