let userVideo;
let videoCanvas;
let displaySize;
let isGameStarted = false;
let isCounting = false;
let isGameOver = false;
let mouthOpenStartTime = null;
// mode: 'menu' | 'cheers' | 'world' | 'battle'
let mode = 'menu';

// Battle game state
// playerHP: HP of the player (displayed in the UI). enemyHP: HP of the enemy.
let playerHP = 100;
let enemyHP = 100;
let drinkInterval = null; // legacy interval (kept for safety)
let drinkRafId = null; // requestAnimationFrame id for smooth drain
let drinkLastTime = null;
let isDrinking = false;
let iceCooldown = 0;
const DRINK_HP_PER_SEC = 6; // HP drained per second while drinking (adjustable)

// ゲーム開始時のメッセージとカウントダウン
const startMessage = "今日もお疲れ様！せーので祝杯をあげよう！";
const countdownTime = 3;

// DOM要素
let messageEl;
let countdownEl;
let startButton;
let restartButton;
let resultEl;

// 音声ファイル
let winSound;

// DOM要素の初期化
function initializeElements() {
    messageEl = document.getElementById('message');
    countdownEl = document.getElementById('countdown');
    startButton = document.getElementById('startButton');
    restartButton = document.getElementById('restartButton');
    resultEl = document.getElementById('result');

    // menu and other elements
    document.getElementById('btnCheer').addEventListener('click', () => showView('cheers'));
    document.getElementById('btnWorld').addEventListener('click', () => showView('world'));
    document.getElementById('btnBattle').addEventListener('click', () => showView('battle'));
    document.getElementById('backFromCheers').addEventListener('click', () => showView('menu'));
    document.getElementById('backFromWorld').addEventListener('click', () => showView('menu'));
    document.getElementById('backFromBattle').addEventListener('click', () => showView('menu'));

    // world elements
    document.getElementById('worldStartButton').addEventListener('click', startWorldGame);
    document.getElementById('worldRestartButton').addEventListener('click', restartWorldGame);

    // battle elements
    document.getElementById('drinkButton').addEventListener('click', startDrinking);
    document.getElementById('battleRestartButton').addEventListener('click', restartBattleGame);

    // 音声ファイルの初期化
    winSound = new Audio('assets/winsound.mp3');

    // initialize HP bars if present
    const pFill = document.getElementById('playerHPFill');
    if (pFill) pFill.style.width = playerHP + '%';
    const eFill = document.getElementById('enemyHPFill');
    if (eFill) eFill.style.width = enemyHP + '%';

    // イベントリスナーの設定
    startButton.addEventListener('click', startGame);
    restartButton.addEventListener('click', restartGame);
}

// 口の開き具合の閾値
const MOUTH_OPEN_THRESHOLD = 30;

// 2点間の距離を計算
function dist(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

// 口が開いているかどうかを判定
function isMouthOpen(mouth) {
    // mouth can be either landmarks.getMouth() (array of 20 mouth points)
    // or full landmarks.positions (array of 68 points). Normalize accordingly.
    let top, bottom;
    if (mouth && mouth.length === 68) {
        top = mouth[13];
        bottom = mouth[19];
    } else if (mouth && mouth.length >= 20) {
        // mouth array from getMouth()
        top = mouth[13];
        bottom = mouth[19];
    } else {
        return false;
    }
    const d = dist(top.x, top.y, bottom.x, bottom.y);
    return d > MOUTH_OPEN_THRESHOLD;
}

async function loadFaceAPI() {
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri('models/tiny_face_detector');
        await faceapi.nets.faceLandmark68Net.loadFromUri('models/face_landmark_68');
        await startVideo();
        startButton.disabled = false;
        messageEl.textContent = "準備が完了したら、スタートボタンを押してください。";
    } catch (err) {
        console.error("顔認識モデルの読み込みに失敗しました:", err);
        messageEl.textContent = "顔認識モデルの読み込みに失敗しました。";
    }
}

async function startVideo() {
    userVideo = document.getElementById('video');
    videoCanvas = document.getElementById('canvas');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        userVideo.srcObject = stream;
        displaySize = { width: userVideo.width, height: userVideo.height };
        faceapi.matchDimensions(videoCanvas, displaySize);
    } catch (err) {
        console.error("カメラの起動に失敗しました:", err);
        messageEl.textContent = "カメラの起動に失敗しました。";
    }
}

async function detectExpressions() {
    if (!isGameStarted || isGameOver) return;

    const detections = await faceapi
        .detectAllFaces(userVideo, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

    if (detections.length > 0) {
        const landmarks = detections[0].landmarks;
        const mouth = landmarks.getMouth();

        if (isMouthOpen(mouth)) {
            if (!mouthOpenStartTime) {
                mouthOpenStartTime = Date.now();
            } else if (Date.now() - mouthOpenStartTime > 500) { // 0.5秒以上
                winGame();
                return;
            }
        } else {
            mouthOpenStartTime = null;
        }
    } else {
        mouthOpenStartTime = null;
    }

    if (!isGameOver) {
        requestAnimationFrame(detectExpressions);
    }
}

// View switching
// View switching
function showView(v) {
    mode = v;
    // hide all views
    document.querySelectorAll('.view').forEach(el => el.style.display = 'none');

    const videoEl = document.getElementById('video');
    const canvasEl = document.getElementById('canvas');

    // helper: move shared media into the target view right before its .button-container
    function moveMediaIntoView(viewId) {
        const viewEl = document.getElementById(viewId);
        if (!viewEl || !videoEl) return;

        // find insertion point
        const btnContainer = viewEl.querySelector('.button-container');
        if (btnContainer && btnContainer.parentNode) {
            // insert video and canvas right before the button container
            btnContainer.parentNode.insertBefore(videoEl, btnContainer);
            if (canvasEl) btnContainer.parentNode.insertBefore(canvasEl, btnContainer);
        } else {
            // fallback: append to the view
            viewEl.appendChild(videoEl);
            if (canvasEl) viewEl.appendChild(canvasEl);
        }

        // make visible
        videoEl.style.display = 'block';
        if (canvasEl) canvasEl.style.display = 'none';
    }

    if (v === 'menu') {
        document.getElementById('mainMenu').style.display = 'block';
        // hide shared media on menu
        if (videoEl) videoEl.style.display = 'none';
        if (canvasEl) canvasEl.style.display = 'none';
    } else if (v === 'cheers') {
        document.getElementById('cheersView').style.display = 'block';
        moveMediaIntoView('cheersView');
    } else if (v === 'world') {
        document.getElementById('worldView').style.display = 'block';
        moveMediaIntoView('worldView');
    } else if (v === 'battle') {
        document.getElementById('battleView').style.display = 'block';
        moveMediaIntoView('battleView');
    }
}

// World game (reuse mouth detection logic)
let worldMessageEl, worldCountdownEl, worldResultEl, bossImage;
function startWorldGame() {
    // initialize world elements
    worldMessageEl = document.getElementById('worldMessage');
    worldCountdownEl = document.getElementById('worldCountdown');
    worldResultEl = document.getElementById('worldResult');
    bossImage = document.getElementById('bossImage');

    showView('world');
    // reset UI/state for a fresh run
    if (worldResultEl) {
        worldResultEl.style.display = 'none';
        worldResultEl.classList.remove('fade-in');
    }
    const restartBtn = document.getElementById('worldRestartButton');
    if (restartBtn) restartBtn.style.display = 'none';
    mouthOpenStartTime = null;

    worldMessageEl.textContent = "手元にある毒薬を飲まなければ世界は救われない...さぁ飲むんだ！";
    setTimeout(() => {
        worldStartCountdown();
    }, 1000);
}

function worldStartCountdown() {
    let count = countdownTime;
    worldCountdownEl.style.display = 'block';
    worldCountdownEl.textContent = count;
    const id = setInterval(() => {
        count--;
        worldCountdownEl.textContent = count;
        if (count === 0) {
            clearInterval(id);
            worldCountdownEl.style.display = 'none';
            worldMessageEl.textContent = 'ゴゴゴゴゴ...';
            // start detection loop for world
            // reset mouth-open timer and begin detection
            mouthOpenStartTime = null;
            isGameStarted = true;
            detectWorld();
        }
    }, 1000);
}

async function detectWorld() {
    if (!isGameStarted) return;
    const detections = await faceapi
        .detectAllFaces(userVideo, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

    if (detections.length > 0) {
        const landmarks = detections[0].landmarks;
        const mouth = landmarks.getMouth();
        if (isMouthOpen(mouth)) {
            if (!mouthOpenStartTime) {
                mouthOpenStartTime = Date.now();
            } else if (Date.now() - mouthOpenStartTime > 500) {
                // win world game
                isGameStarted = false;
                worldResultEl.style.display = 'block';
                // add fade-in animation class
                worldResultEl.classList.add('fade-in');
                worldMessageEl.style.display = 'none';
                document.getElementById('worldRestartButton').style.display = 'block';
                if (bossImage) bossImage.src = 'assets/lastboss2.png';
                // play the same win sound as the cheers game
                if (winSound) {
                    try { winSound.currentTime = 0; } catch (e) { }
                    winSound.play();
                }
                return;
            }
        } else {
            mouthOpenStartTime = null;
        }
    } else {
        mouthOpenStartTime = null;
    }

    requestAnimationFrame(detectWorld);
}

function restartWorldGame() {
    isGameStarted = false;
    mouthOpenStartTime = null;
    worldResultEl.style.display = 'none';
    worldResultEl.classList.remove('fade-in');
    worldMessageEl.style.display = 'block';
    document.getElementById('worldRestartButton').style.display = 'none';
    if (bossImage) bossImage.src = 'assets/lastboss.png';
}

// Battle game logic
function startDrinking() {
    if (isDrinking) return;
    isDrinking = true;
    document.getElementById('drinkButton').style.display = 'none';
    // start smooth HP drain using requestAnimationFrame
    drinkLastTime = performance.now();
    function drainLoop(now) {
        if (!isDrinking) return;
        const delta = (now - drinkLastTime) / 1000; // seconds
        drinkLastTime = now;
        playerHP = Math.max(0, playerHP - DRINK_HP_PER_SEC * delta);
        updatePlayerHP();
        if (playerHP <= 0) {
            // player dead: stop RAF
            isDrinking = false;
            if (drinkRafId) { cancelAnimationFrame(drinkRafId); drinkRafId = null; }
            return;
        }
        drinkRafId = requestAnimationFrame(drainLoop);
    }
    drinkRafId = requestAnimationFrame(drainLoop);
    // start mouth detection to allow ice attacks
    isGameStarted = true;
    detectBattle();
}

function stopDrinking() {
    // stop drinking (not used if stop button removed)
    isDrinking = false;
    if (drinkInterval) { clearInterval(drinkInterval); drinkInterval = null; }
    if (drinkRafId) { cancelAnimationFrame(drinkRafId); drinkRafId = null; }
    isGameStarted = false;
}

function updatePlayerHP() {
    const pct = Math.max(0, playerHP) + '%';
    // player HP fill reusing bossHPFill element visually
    const fillEl = document.getElementById('playerHPFill');
    if (fillEl) fillEl.style.width = (playerHP) + '%';
    if (playerHP <= 0) {
        // player lost
        document.getElementById('battleMessage').textContent = 'あなたは倒された...';
        // stop drinking and show restart
        isDrinking = false;
        if (drinkInterval) { clearInterval(drinkInterval); drinkInterval = null; }
        const restartBtn = document.getElementById('battleRestartButton');
        if (restartBtn) restartBtn.style.display = 'inline-block';
    }
}

function restartBattleGame() {
    // stop any ongoing drinking interval
    if (drinkInterval) {
        clearInterval(drinkInterval);
        drinkInterval = null;
    }
    isDrinking = false;
    isGameStarted = false;
    mouthOpenStartTime = null;
    playerHP = 100;
    enemyHP = 100;
    updatePlayerHP();
    updateEnemyHP();
    // reset UI
    const bossEl = document.getElementById('battleBoss');
    if (bossEl) bossEl.src = 'assets/boss.png';
    const battleMsgEl = document.getElementById('battleMessage');
    if (battleMsgEl) battleMsgEl.textContent = '薬を飲むとHPが減ります。口を開けると氷攻撃！';
    const restartBtn = document.getElementById('battleRestartButton');
    if (restartBtn) restartBtn.style.display = 'none';
    document.getElementById('drinkButton').style.display = 'inline-block';
}

function updateEnemyHP() {
    const fillEl = document.getElementById('enemyHPFill');
    if (fillEl) fillEl.style.width = (enemyHP) + '%';
}

async function detectBattle() {
    if (!isGameStarted || !isDrinking) return;
    const detections = await faceapi
        .detectAllFaces(userVideo, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

    if (detections.length > 0) {
        const landmarks = detections[0].landmarks;
        const mouth = landmarks.getMouth();
        if (isMouthOpen(mouth)) {
            if (!mouthOpenStartTime) {
                mouthOpenStartTime = Date.now();
            } else if (Date.now() - mouthOpenStartTime > 500) {
                // fire ice attack
                mouthOpenStartTime = null;
                // enemy takes a fatal hit
                enemyHP = 0;
                updateEnemyHP();
                // visual: enemy death and play win sound
                const battleMsgEl = document.getElementById('battleMessage');
                const bossEl = document.getElementById('battleBoss');
                if (battleMsgEl) battleMsgEl.textContent = 'クリティカル！敵を倒した！';
                if (bossEl) bossEl.src = 'assets/boss2.png';
                if (winSound) {
                    try { winSound.currentTime = 0; } catch (e) { }
                    winSound.play();
                }
                // show restart button and stop drinking
                isDrinking = false;
                isGameStarted = false;
                if (drinkInterval) { clearInterval(drinkInterval); drinkInterval = null; }
                const restartBtn = document.getElementById('battleRestartButton');
                if (restartBtn) restartBtn.style.display = 'inline-block';
            }
        } else {
            mouthOpenStartTime = null;
        }
    } else {
        mouthOpenStartTime = null;
    }

    // continue detection while drinking and enemy still alive
    if (isDrinking && enemyHP > 0) requestAnimationFrame(detectBattle);
}

function startGame() {
    startButton.style.display = 'none';
    messageEl.textContent = startMessage;

    setTimeout(() => {
        startCountdown();
    }, 2000);
}

function startCountdown() {
    isCounting = true;
    countdownEl.style.display = 'block';
    let count = countdownTime;

    const countInterval = setInterval(() => {
        count--;
        countdownEl.textContent = count;

        if (count === 0) {
            clearInterval(countInterval);
            countdownEl.style.display = 'none';
            messageEl.textContent = "笑顔で乾杯！";
            isGameStarted = true;
            detectExpressions();
        }
    }, 1000);
}

function winGame() {
    isGameOver = true;
    winSound.play();
    messageEl.style.display = 'none';
    resultEl.style.display = 'block';
    restartButton.style.display = 'block';
}

function restartGame() {
    isGameStarted = false;
    isGameOver = false;
    mouthOpenStartTime = null;
    resultEl.style.display = 'none';
    messageEl.style.display = 'block';
    restartButton.style.display = 'none';
    startButton.style.display = 'block';
    messageEl.textContent = "準備が完了したら、スタートボタンを押してください。";
}

// DOMContentLoaded イベントリスナー
document.addEventListener('DOMContentLoaded', () => {
    initializeElements();
    startButton.disabled = true;
    messageEl.textContent = "顔認識モデルを読み込み中...";
    loadFaceAPI();
    // show main menu
    showView('menu');
});
