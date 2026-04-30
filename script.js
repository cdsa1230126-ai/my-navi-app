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
        zoom: 15
    });

    let currentLocation = null;
    let currentMarker = null;
    let destMarker = null;
    let isFirstLock = true; // 初回追従フラグ

    // ★現在地の取得と自動追従機能
    navigator.geolocation.watchPosition(p => {
        currentLocation = [p.coords.longitude, p.coords.latitude];
        
        if (!currentMarker) {
            // 最初のピンを刺す
            currentMarker = new mapboxgl.Marker({ color: '#007aff' }).setLngLat(currentLocation).addTo(map);
        } else {
            // ピンの位置を更新
            currentMarker.setLngLat(currentLocation);
        }

        // 初回、あるいは「案内中」などの状況に合わせて自動で画面を動かす
        if (isFirstLock) {
            map.flyTo({
                center: currentLocation,
                zoom: 16,
                essential: true
            });
            isFirstLock = false; // 一度追従したら、勝手に動き回らないようにする
        }
    }, e => {
        console.error("位置情報エラー:", e);
    }, { enableHighAccuracy: true });

    // 現在地ボタンを押した時に強制的に戻る
    document.getElementById('recenter-btn').onclick = () => {
        if (currentLocation) {
            map.flyTo({ center: currentLocation, zoom: 16, curve: 1 });
        } else {
            alert("現在地を特定できませんでした。");
        }
    };

    // Yahoo検索
    const searchBox = document.getElementById('search-box');
    searchBox.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (!query) return;
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
            li.innerHTML = `<b>${f.Name}</b><br><small>${f.Property.Address}</small>`;
            li.onclick = () => {
                document.getElementById('suggestions-container').classList.add('hidden');
                const coords = f.Geometry.Coordinates.split(',');
                drawRoute(f.Name, [parseFloat(coords[0]), parseFloat(coords[1])]);
            };
            list.appendChild(li);
        });
    };

    async function drawRoute(name, destCoords) {
        if (!currentLocation) return;
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${currentLocation[0]},${currentLocation[1]};${destCoords[0]},${destCoords[1]}?geometries=geojson&overview=full&language=ja&access_token=${mapboxToken}`;
        const res = await fetch(url);
        const data = await res.json();
        const route = data.routes[0];

        if (map.getSource('route')) { map.removeLayer('route'); map.removeSource('route'); }
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: route.geometry } });
        map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#007aff', 'line-width': 6 } });

        if (destMarker) destMarker.remove();
        destMarker = new mapboxgl.Marker({ color: '#ff3b30' }).setLngLat(destCoords).addTo(map);

        // ルート全体を見せる（パディング調整でピンが隠れないようにする）
        const bounds = new mapboxgl.LngLatBounds().extend(currentLocation).extend(destCoords);
        map.fitBounds(bounds, {
            padding: {top: 80, bottom: 420, left: 50, right: 50},
            duration: 1500
        });

        document.getElementById('info-panel').classList.remove('hidden');
        document.getElementById('destination-name').textContent = name;
        document.getElementById('route-distance').textContent = `${(route.distance / 1000).toFixed(1)} km`;
        document.getElementById('route-duration').textContent = `${Math.round(route.duration / 60)} 分`;

        const updateCalc = () => {
            const arr = document.getElementById('target-arrival-time').value;
            const rTime = parseInt(document.getElementById('rest-time').value) || 0;
            const rCount = parseInt(document.getElementById('rest-count').value) || 0;
            if (!arr) return;
            const [h, m] = arr.split(':');
            const target = new Date();
            target.setHours(h, m, 0);
     // --- 1. APIキーの管理と永続化 ---
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
    
    // --- 2. 地図の初期化 ---
    const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v11', // 明るい道路地図
        center: [139.767, 35.681], // 初期値：東京駅
        zoom: 14
    });

    let currentLocation = null;
    let currentMarker = null;
    let destMarker = null;
    let isFirstLock = true;

    // --- 3. リアルタイム現在地取得と追従 ---
    navigator.geolocation.watchPosition(p => {
        currentLocation = [p.coords.longitude, p.coords.latitude];
        
        if (!currentMarker) {
            // 現在地の青いピン（モビリンク風）
            currentMarker = new mapboxgl.Marker({ color: '#007aff', scale: 0.8 }).setLngLat(currentLocation).addTo(map);
        } else {
            currentMarker.setLngLat(currentLocation);
        }

        if (isFirstLock) {
            map.flyTo({ center: currentLocation, zoom: 15, essential: true });
            isFirstLock = false;
        }
    }, e => console.error("位置情報取得エラー", e), { enableHighAccuracy: true });

    // リセンターボタン
    document.getElementById('recenter-btn').onclick = () => {
        if (currentLocation) map.flyTo({ center: currentLocation, zoom: 16 });
    };

    // --- 4. Yahoo!検索エンジン（施設名検索） ---
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
            li.innerHTML = `<strong>${f.Name}</strong><br><small style="color:#8e8e93">${f.Property.Address}</small>`;
            li.onclick = () => {
                document.getElementById('suggestions-container').classList.add('hidden');
                const coords = f.Geometry.Coordinates.split(',');
                drawRoute(f.Name, [parseFloat(coords[0]), parseFloat(coords[1])]);
            };
            list.appendChild(li);
        });
    };

    // --- 5. ルート描画と2ピン表示ズーム ---
    async function drawRoute(destName, destCoords) {
        if (!currentLocation) return alert("現在地を取得中です。少々お待ちください。");

        const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${currentLocation[0]},${currentLocation[1]};${destCoords[0]},${destCoords[1]}?geometries=geojson&overview=full&language=ja&access_token=${mapboxToken}`;
        
        const res = await fetch(url);
        const data = await res.json();
        const route = data.routes[0];

        // 既存のルートを消去
        if (map.getSource('route')) { map.removeLayer('route'); map.removeSource('route'); }
        
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: route.geometry } });
        map.addLayer({
            id: 'route', type: 'line', source: 'route',
            paint: { 'line-color': '#007aff', 'line-width': 6, 'line-opacity': 0.75 }
        });

        // 目的地の赤いピン
        if (destMarker) destMarker.remove();
        destMarker = new mapboxgl.Marker({ color: '#ff3b30' }).setLngLat(destCoords).addTo(map);

        // ★2つのピンがパネルに隠れないように自動画角調整（インテリジェント・ズーム）
        const bounds = new mapboxgl.LngLatBounds().extend(currentLocation).extend(destCoords);
        map.fitBounds(bounds, {
            padding: {top: 100, bottom: 450, left: 60, right: 60}, // 下部パネル分を大きく確保
            duration: 1500
        });

        // パネル表示とデータ更新
        updatePanelUI(destName, route);
    }

    // --- 6. 【新規性】休憩回数と到着希望の逆算ロジック ---
    function updatePanelUI(name, route) {
        const panel = document.getElementById('info-panel');
        panel.classList.remove('hidden');
        document.getElementById('destination-name').textContent = name;
        document.getElementById('route-distance').textContent = `${(route.distance / 1000).toFixed(1)}km`;
        document.getElementById('route-duration').textContent = `${Math.round(route.duration / 60)}分`;

        // 前回の設定を復元（あれば）
        const savedRestTime = localStorage.getItem('user_rest_time');
        const savedRestCount = localStorage.getItem('user_rest_count');
        if(savedRestTime) document.getElementById('rest-time').value = savedRestTime;
        if(savedRestCount) document.getElementById('rest-count').value = savedRestCount;

        const updateCalc = () => {
            const arrInput = document.getElementById('target-arrival-time').value;
            const rTime = parseInt(document.getElementById('rest-time').value) || 0;
            const rCount = parseInt(document.getElementById('rest-count').value) || 0;

            // 設定を保存
            localStorage.setItem('user_rest_time', rTime);
            localStorage.setItem('user_rest_count', rCount);

            if (!arrInput) return;

            const [h, m] = arrInput.split(':');
            const target = new Date();
            target.setHours(h, m, 0);

            // 休憩合計（分）
            const totalRestMin = rTime * rCount;
            // 推奨出発時刻 = 到着希望 - 走行時間(秒) - 休憩時間(秒)
            const depMs = target.getTime() - (route.duration * 1000) - (totalRestMin * 60 * 1000);
            const depDate = new Date(depMs);
            
            document.getElementById('calc-time').textContent = 
                `${String(depDate.getHours()).padStart(2,'0')}:${String(depDate.getMinutes()).padStart(2,'0')}`;
            document.getElementById('total-rest-info').textContent = `休憩合計: ${totalRestMin}分 (${rCount}回)`;
            document.getElementById('departure-card').classList.remove('hidden');
        };

        // 入力監視
        document.getElementById('target-arrival-time').onchange = updateCalc;
        document.getElementById('rest-time').oninput = updateCalc;
        document.getElementById('rest-count').oninput = updateCalc;
        updateCalc();
    }

    document.getElementById('close-panel').onclick = () => {
        document.getElementById('info-panel').classList.add('hidden');
    };
}       const totalRest = rTime * rCount;
            const depMs = target.getTime() - (route.duration * 1000) - (totalRest * 60 * 1000);
            const d = new Date(depMs);
            document.getElementById('calc-time').textContent = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
            document.getElementById('total-rest-info').textContent = `休憩合計: ${totalRest}分 (${rCount}回)`;
            document.getElementById('departure-card').classList.remove('hidden');
        };
        document.getElementById('target-arrival-time').onchange = updateCalc;
        document.getElementById('rest-time').oninput = updateCalc;
        document.getElementById('rest-count').oninput = updateCalc;
        updateCalc();
    }
    document.getElementById('close-panel').onclick = () => document.getElementById('info-panel').classList.add('hidden');
}