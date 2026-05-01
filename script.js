// --- 1. APIキー管理システム ---
let savedToken = localStorage.getItem('mapbox_user_token');
let savedYahooId = localStorage.getItem('yahoo_app_id');

// もしダミー文字列が入っていたらリセット
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
        style: 'mapbox://styles/mapbox/streets-v11', // ダミー文字列は一切含めない
        center: [139.767, 35.681],
        zoom: 14,
        pitch: 0
    });

    let currentLocation = null;
    let currentMarker = null;
    let destMarker = null;
    let restMarkers = [];
    let currentRouteData = null;

    // 渋滞表示機能
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

    // 2D/3D切り替え
    document.getElementById('view-toggle-btn').onclick = function() {
        const is3D = map.getPitch() > 0;
        map.easeTo({ pitch: is3D ? 0 : 60, duration: 500 });
        this.innerHTML = is3D ? '2D' : '3D';
    };

   // 現在地取得と自動追従（初回のみ）
    let isFirstLocate = true; // 初回判定用フラグ

    navigator.geolocation.watchPosition(p => {
        currentLocation = [p.coords.longitude, p.coords.latitude];
        
        // マーカーの更新
        if (!currentMarker) {
            currentMarker = new mapboxgl.Marker({ color: '#007aff' }).setLngLat(currentLocation).addTo(map);
        } else {
            currentMarker.setLngLat(currentLocation);
        }

        // 【追加】アプリ起動後、最初に見つかった現在地へ自動でジャンプ
        if (isFirstLocate) {
            map.flyTo({
                center: currentLocation,
                zoom: 15,
                speed: 1.5,
                essential: true
            });
            isFirstLocate = false; // 二回目以降は自動で飛ばないようにする
        }
    }, (err) => {
        console.error("位置情報の取得に失敗しました:", err);
    }, { enableHighAccuracy: true });

    document.getElementById('recenter-btn').onclick = () => { 
        if (currentLocation) map.flyTo({ center: currentLocation, zoom: 16 }); 
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
                const coords = f.Geometry.Coordinates.split(',');
                drawRoute(f.Name, [parseFloat(coords[0]), parseFloat(coords[1])], token, yid);
            };
            list.appendChild(li);
        });
    };

    // ルート描画
    async function drawRoute(name, destCoords, tk, yid) {
        if (!currentLocation) return;
        const res = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${currentLocation[0]},${currentLocation[1]};${destCoords[0]},${destCoords[1]}?geometries=geojson&overview=full&language=ja&access_token=${tk}`);
        const data = await res.json();
        currentRouteData = data.routes[0];

        if (map.getSource('route')) { map.removeLayer('route'); map.removeSource('route'); }
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: currentRouteData.geometry } });
        map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#007aff', 'line-width': 6, 'line-opacity': 0.7 } });

        if (destMarker) destMarker.remove();
        destMarker = new mapboxgl.Marker({ color: '#ff3b30' }).setLngLat(destCoords).addTo(map);
        map.fitBounds(new mapboxgl.LngLatBounds().extend(currentLocation).extend(destCoords), { padding: {top: 50, bottom: 400, left: 50, right: 50} });
        
        updatePanelUI(name, yid);
    }

    // 休憩地点のピン表示
    async function showRestAreas(yid) {
        restMarkers.forEach(m => m.remove());
        restMarkers = [];
        const count = parseInt(document.getElementById('rest-count').value) || 0;
        const coords = currentRouteData.geometry.coordinates;
        for (let i = 1; i <= count; i++) {
            const pt = coords[Math.floor((coords.length / (count + 1)) * i)];
            const cbName = `rest_cb_${i}_${Date.now()}`;
            window[cbName] = (d) => {
                if (d.Feature) {
                    const sc = d.Feature[0].Geometry.Coordinates.split(',');
                    const m = new mapboxgl.Marker({ color: '#FFD700' }).setLngLat([parseFloat(sc[0]), parseFloat(sc[1])]).addTo(map);
                    restMarkers.push(m);
                }
            };
            const s = document.createElement('script');
            s.src = `https://map.yahooapis.jp/search/local/V1/localSearch?appid=${yid}&lat=${pt[1]}&lon=${pt[0]}&dist=2&query=コンビニ&output=json&results=1&callback=${cbName}`;
            document.body.appendChild(s);
        }
    }

    // パネル情報の更新と到着逆算
    function updatePanelUI(name, yid) {
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
            document.getElementById('total-rest-info').textContent = `休憩合計: ${rTime * rCnt}分 (${rCnt}回)`;
            document.getElementById('departure-card').classList.remove('hidden');
        };
        document.querySelectorAll('.config-grid input').forEach(el => el.oninput = calc);
        calc();
    }

    // 案内開始！
    document.getElementById('start-nav').onclick = () => {
        if (!currentRouteData) return;
        showRestAreas(yid);
        document.getElementById('pre-nav-content').classList.add('hidden');
        document.getElementById('nav-active-content').classList.remove('hidden');
        document.getElementById('search-container').style.transform = 'translateY(-120px)';
        
        // バナー表示
        const banner = document.getElementById('nav-banner');
        banner.classList.remove('hidden');
        const arr = new Date(Date.now() + (currentRouteData.duration * 1000));
        document.getElementById('banner-arrival').textContent = `${arr.getHours()}:${String(arr.getMinutes()).padStart(2,'0')}`;
        
        const rCnt = parseInt(document.getElementById('rest-count').value) || 1;
        const nextRest = Math.round((currentRouteData.duration / 60) / (rCnt + 1));
        document.getElementById('banner-next-rest').textContent = `${nextRest}分`;

        document.getElementById('nav-remaining-time').textContent = `${Math.round(currentRouteData.duration / 60)}分`;
        map.flyTo({ center: currentLocation, zoom: 17, pitch: 0, essential: true });
    };

    // 案内終了
    document.getElementById('stop-nav').onclick = () => {
        document.getElementById('nav-banner').classList.add('hidden');
        document.getElementById('search-container').style.transform = 'translateY(0)';
        document.getElementById('pre-nav-content').classList.remove('hidden');
        document.getElementById('nav-active-content').classList.add('hidden');
        restMarkers.forEach(m => m.remove());
        map.easeTo({ pitch: 0 });
    };

    document.getElementById('close-panel').onclick = () => document.getElementById('info-panel').classList.add('hidden');
}