document.addEventListener('DOMContentLoaded', () => {
    // --- 定数とグローバル変数 ---
    const GAME_CONFIG = {
        MOUTH_OPEN_THRESHOLD: 20,
        COUNTDOWN_SECONDS: 3,
        MOUTH_OPEN_DURATION_MS: 500,
        MESSAGES: {
            cheers: {
                initial: "あなたは会社員です。憧れの先輩から飲みに誘われました！\n準備ができたらスタートを押してね！",
                action: "今だ！飲んで！笑顔で乾杯！"
            },
            world: {
                initial: "お前は世界の平和を託されたただ一人の勇者。手元の毒薬を飲んで自害しなければこの世界は救われない。準備ができたらスタートボタンを押せ。",
                action: "今だ！毒薬を飲め！！"
            },
            battle: {
                initial: "薬を飲めたら口を開けて氷攻撃を仕掛けよう！",
                action: "口を開けて攻撃！"
            }
        }
    };

    // --- DOM要素 ---
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const mediaContainer = document.getElementById('mediaContainer');
    const winSound = new Audio('assets/winsound.mp3');
    const loseSound = new Audio('assets/losesound.mp3');

    // --- ゲーム状態管理 ---
    let currentView = 'menu';
    let detectionInterval;
    let gameState = {};

    // --- 顔認識関連 ---
    async function loadModels() {
        try {
            await faceapi.nets.tinyFaceDetector.loadFromUri('models/tiny_face_detector');
            await faceapi.nets.faceLandmark68Net.loadFromUri('models/face_landmark_68');
            console.log("モデルの読み込み完了");
            document.querySelectorAll('button').forEach(b => b.disabled = false);
            updateMessage('cheers', "準備が完了したら、スタートボタンを押してください。");
        } catch (err) {
            console.error("顔認識モデルの読み込みに失敗しました:", err);
            updateMessage('cheers', "モデルの読み込みに失敗しました。");
        }
    }

    async function startVideo() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = stream;
            const displaySize = { width: video.width, height: video.height };
            faceapi.matchDimensions(canvas, displaySize);
        } catch (err) {
            console.error("カメラの起動に失敗しました:", err);
            updateMessage('cheers', "カメラの起動に失敗しました。");
        }
    }

    // --- UI更新関数 ---
    function showView(viewId) {
        currentView = viewId;
        document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
        const activeView = document.getElementById(`${viewId}View`);
        activeView.style.display = 'block';

        if (viewId === 'menu') {
            mediaContainer.style.display = 'none';
            stopDetection();
        } else {
            const placeholder = activeView.querySelector('.media-placeholder');
            if (placeholder) {
                placeholder.appendChild(mediaContainer);
            }
            mediaContainer.style.display = 'block';
        }
        resetGame(viewId); // ビューが変更されたらゲームをリセット
    }

    function updateMessage(view, text) {
        const el = document.getElementById(`${view}Message`);
        if (el) el.textContent = text;
    }

    function updateCountdown(view, text) {
        const el = document.getElementById(`${view}Countdown`);
        if (el) {
            el.textContent = text;
            el.style.display = text ? 'block' : 'none';
        }
    }

    function showResult(view, isVisible) {
        const el = document.getElementById(`${view}Result`);
        if (el) el.style.display = isVisible ? 'block' : 'none';
    }

    function toggleButtons(view, showStart) {
        document.getElementById(`${view}StartButton`).style.display = showStart ? 'inline-block' : 'none';
        document.getElementById(`${view}RestartButton`).style.display = showStart ? 'none' : 'inline-block';
    }

    // --- ゲームロジック ---
    function resetGame(view) {
        if (view === 'menu') return;

        gameState = {
            isStarted: false,
            isOver: false,
            mouthOpenTime: null,
        };

        if (view === 'cheers') {
            const izakayaVideo = document.getElementById('izakayaVideo');
            const characterContainer = document.querySelector('#cheersView .character-container');
            izakayaVideo.style.display = 'none';
            characterContainer.style.display = 'flex';
        }

        if (view === 'battle') {
            gameState.playerHP = 100;
            gameState.enemyHP = 100;
            updateHP('player', 100);
            updateHP('enemy', 100);
            document.getElementById('battleBoss').src = 'assets/boss.png';
        }
        if (view === 'world') {
            document.getElementById('bossImage').src = 'assets/lastboss.png';
        }

        updateMessage(view, getMessage(view, 'initial'));
        updateCountdown(view, '');
        showResult(view, false);
        toggleButtons(view, true);
        stopDetection();
    }

    function getMessage(view, type) {
        return GAME_CONFIG.MESSAGES[view]?.[type] || "";
    }

    function startCheersGame() {
        const izakayaVideo = document.getElementById('izakayaVideo');
        const characterContainer = document.querySelector('#cheersView .character-container');
        const mediaPlaceholder = document.querySelector('#cheersView .media-placeholder');
        const startButton = document.getElementById('cheersStartButton');

        // Hide character and media placeholder, show and play video
        characterContainer.style.display = 'none';
        mediaPlaceholder.style.display = 'none';
        startButton.style.display = 'none';
        izakayaVideo.style.display = 'block';
        izakayaVideo.play();

        // When video ends, start the game
        izakayaVideo.onended = () => {
            izakayaVideo.style.display = 'none';
            characterContainer.style.display = 'flex'; // or 'block' depending on original style
            mediaPlaceholder.style.display = 'block';
            startGame('cheers');
        };
    }

    function startWorldGame() {
        const introVideo = document.getElementById('intro-video');
        const worldTop = document.querySelector('#worldView .world-top');
        const mediaPlaceholder = document.querySelector('#worldView .media-placeholder');
        const startButton = document.getElementById('worldStartButton');

        // Hide elements, show and play video
        worldTop.style.display = 'none';
        mediaPlaceholder.style.display = 'none';
        startButton.style.display = 'none';
        introVideo.style.display = 'block';
        introVideo.play();

        // When video ends, start the game
        introVideo.onended = () => {
            introVideo.style.display = 'none';
            worldTop.style.display = 'flex';
            mediaPlaceholder.style.display = 'block';
            startGame('world');
        };
    }

    function startGame(view) {
        resetGame(view);
        toggleButtons(view, false);
        updateMessage(view, "せーので...");

        let count = GAME_CONFIG.COUNTDOWN_SECONDS;
        updateCountdown(view, count);

        const countdownInterval = setInterval(() => {
            count--;
            updateCountdown(view, count);
            if (count === 0) {
                clearInterval(countdownInterval);
                updateCountdown(view, '');
                gameState.isStarted = true;
                updateMessage(view, getMessage(view, 'action'));
                startDetection();
            }
        }, 1000);
    }

    function getActionMessage(view) {
        switch (view) {
            case 'cheers': return "今だ！飲んで！笑顔で乾杯！";
            case 'world': return "今だ！毒薬を飲め！！";
            case 'battle': return "口を開けて攻撃！";
            default: return "";
        }
    }

    function startDetection() {
        if (detectionInterval) return;
        detectionInterval = setInterval(async () => {
            if (!gameState.isStarted || gameState.isOver) return;

            const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();
            const isMouthCurrentlyOpen = detections.length > 0 && isMouthOpen(detections[0].landmarks.getMouth());

            handleDetection(isMouthCurrentlyOpen);
        }, 100);
    }

    function stopDetection() {
        clearInterval(detectionInterval);
        detectionInterval = null;
    }

    function isMouthOpen(mouth) {
        const topLip = mouth[13];
        const bottomLip = mouth[19];
        const distance = Math.hypot(topLip.x - bottomLip.x, topLip.y - bottomLip.y);
        return distance > GAME_CONFIG.MOUTH_OPEN_THRESHOLD;
    }

    function handleDetection(isMouthOpen) {
        if (isMouthOpen) {
            if (!gameState.mouthOpenTime) {
                gameState.mouthOpenTime = Date.now();
            } else if (Date.now() - gameState.mouthOpenTime > GAME_CONFIG.MOUTH_OPEN_DURATION_MS) {
                currentView === 'battle' ? attackInBattle() : winGame(currentView);
            }
        } else {
            gameState.mouthOpenTime = null;
        }

        if (currentView === 'battle' && gameState.isStarted && !gameState.isOver) {
            updateBattleState();
        }
    }

    function winGame(view) {
        if (gameState.isOver) return;
        gameState.isOver = true;
        stopDetection();
        winSound.play();
        showResult(view, true);
        updateMessage(view, '');
        if (view === 'world') {
            document.getElementById('bossImage').src = 'assets/lastboss2.png';
        }
    }

    function loseGame(view) {
        if (gameState.isOver) return;
        gameState.isOver = true;
        stopDetection();
        loseSound.play();
        updateMessage(view, "ゲームオーバー...");
    }

    // --- バトルゲーム専用ロジック ---
    function attackInBattle() {
        if (gameState.isOver) return;
        gameState.enemyHP = 0;
        updateHP('enemy', 0);
        document.getElementById('battleBoss').src = 'assets/boss2.png';
        updateMessage('battle', 'クリティカル！敵を倒した！');
        winGame('battle');
    }

    function updateBattleState() {
        gameState.playerHP -= 0.5; // 継続ダメージ
        updateHP('player', gameState.playerHP);
        if (gameState.playerHP <= 0) {
            loseGame('battle');
        }
    }

    function updateHP(target, hp) {
        const fill = document.getElementById(`${target}HPFill`);
        if (fill) fill.style.width = `${Math.max(0, hp)}%`;
    }

    // --- イベントリスナー設定 ---
    function setupEventListeners() {
        document.getElementById('btnCheer').addEventListener('click', () => showView('cheers'));
        document.getElementById('btnWorld').addEventListener('click', () => showView('world'));
        document.getElementById('btnBattle').addEventListener('click', () => showView('battle'));

        document.querySelectorAll('.backToMenu').forEach(btn => {
            btn.addEventListener('click', () => showView('menu'));
        });

        document.getElementById('cheersStartButton').addEventListener('click', () => startCheersGame());
        document.getElementById('worldStartButton').addEventListener('click', () => startWorldGame());
        document.getElementById('battleStartButton').addEventListener('click', () => startGame('battle'));

        document.getElementById('cheersRestartButton').addEventListener('click', () => resetGame('cheers'));
        document.getElementById('worldRestartButton').addEventListener('click', () => resetGame('world'));
        document.getElementById('battleRestartButton').addEventListener('click', () => resetGame('battle'));
    }

    // --- チュートリアル制御 ---
    function showTutorial() {
        const tutorial = document.getElementById('tutorial');
        if (tutorial) {
            tutorial.style.display = 'flex';
        }
    }

    function hideTutorial() {
        const tutorial = document.getElementById('tutorial');
        if (tutorial) {
            tutorial.style.display = 'none';
        }
    }



    // --- 初期化処理 ---
    async function initialize() {
        document.querySelectorAll('button').forEach(b => b.disabled = true);
        setupEventListeners();

        // チュートリアルのイベントリスナー
        document.getElementById('closeTutorial').addEventListener('click', hideTutorial);

        // 初回起動時にチュートリアルを表示
        showTutorial();
        showView('menu');
        await startVideo();
        await loadModels();
    }

    initialize();
});