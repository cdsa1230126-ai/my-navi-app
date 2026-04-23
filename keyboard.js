const DAKU_MAP = { 'か':'が','き':'ぎ','く':'ぐ','け':'げ','こ':'ご','さ':'ざ','し':'じ','す':'ず','せ':'ぜ','そ':'ぞ','た':'だ','ち':'ぢ','つ':'づ','て':'で','と':'ど','は':'ば','ひ':'び','ふ':'ぶ','へ':'べ','ほ':'ぼ' };
const SMALL_MAP = { 'あ':'ぁ','い':'ぃ','う':'ぅ','え':'ぇ','お':'ぉ','つ':'っ','や':'ゃ','ゆ':'ゅ','よ':'ょ','わ':'ゎ' };

export function initKeyboard(searchBox, notify) {
    const area = document.getElementById('keyboard-area');
    const kanaLayout = document.getElementById('keyboard-kana');
    const romajiLayout = document.getElementById('keyboard-romaji');
    
    area.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const key = btn.getAttribute('data-key');

        if (key === 'toggle') {
            const isKana = !kanaLayout.classList.contains('hidden');
            kanaLayout.classList.toggle('hidden', isKana);
            romajiLayout.classList.toggle('hidden', !isKana);
            btn.textContent = isKana ? 'ABC / あ' : 'あ / ABC';
            return;
        }

        if (key === 'search') {
            document.body.classList.remove('keyboard-active');
        } else if (key === 'del') {
            searchBox.value = searchBox.value.slice(0, -1);
        } else if (key === 'daku') {
            const last = searchBox.value.slice(-1);
            if (DAKU_MAP[last]) searchBox.value = searchBox.value.slice(0,-1) + DAKU_MAP[last];
        } else if (key === 'small') {
            const last = searchBox.value.slice(-1);
            if (SMALL_MAP[last]) searchBox.value = searchBox.value.slice(0,-1) + SMALL_MAP[last];
        } else if (key) {
            searchBox.value += key;
        }
        searchBox.dispatchEvent(new Event('input'));
    });
}