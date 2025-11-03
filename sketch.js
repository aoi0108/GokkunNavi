document.addEventListener('DOMContentLoaded', () => {
    // --- 定数とグローバル変数 ---
    const GAME_CONFIG = {
        MOUTH_OPEN_THRESHOLD: 20,
        COUNTDOWN_SECONDS: 3,
        MOUTH_OPEN_DURATION_MS: 500,
        MESSAGES: {
            cheers: {
                initial: "あなたは会社員です。憧れの先輩と飲みにいくことになりました。\n準備ができたらスタートを押してね！",
                action: "今だ！飲んで！飲めたら口を開けて笑顔で乾杯するんだ！"
            },
            world: {
                initial: "お前は世界の平和を託された唯一の勇者。\n体内に宿る滅亡の因子を打ち消すため、お前の命と引き換えに世界を救う「魂の解毒剤」を今すぐ飲まなければならない。\nお前の決断が、世界の運命を決める。\n準備ができたら、スタートボタンを押したまえ！",
                action: "今だ！解毒剤を飲め！！飲めたら口を開けるんだ！"
            },
            battle: {
                initial: "手元に薬と水を用意してスタートボタンを押そう！",
                action: "今だ！魔法の薬を飲み、口を開けて氷攻撃を仕掛けるんだ！"
            }
        }
    };

    // --- DOM要素 ---
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const mediaContainer = document.getElementById('mediaContainer');
    const winSound = new Audio('assets/winsound.mp3');
    const ganbareSound = new Audio('assets/ganbare.mp3');

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
            // video要素のサイズが確定してからcanvasのサイズを合わせる
            video.onloadedmetadata = () => {
                handleResize();
            };
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

        // メディアクエリに合致するかどうかでdisplayプロパティを決定
        if (window.matchMedia("(orientation: landscape) and (max-height: 500px)").matches && viewId !== 'menu') {
            activeView.style.display = 'flex';
        } else {
            activeView.style.display = 'block';
        }

        if (viewId === 'menu') {
            mediaContainer.style.display = 'none';
            stopDetection();
        } else {
            const placeholder = activeView.querySelector('.media-placeholder');
            if (placeholder) {
                placeholder.appendChild(mediaContainer);
            }
            mediaContainer.style.display = 'block';
            // ビューが切り替わった後にリサイズ処理を呼び出す
            setTimeout(handleResize, 50);
        }
        resetGame(viewId); // ビューが変更されたらゲームをリセット
    }

    function updateMessage(view, text) {
        const el = document.getElementById(`${view}Message`);
        if (el) el.innerHTML = text.replace(/\n/g, '<br>');
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

        mediaContainer.style.display = 'block';

        const placeholder = document.querySelector(`#${view}View .media-placeholder`);
        if (placeholder) {
            placeholder.style.display = 'block';
        }

        gameState = {
            isStarted: false,
            isOver: false,
            mouthOpenTime: null,
        };

        if (view === 'cheers') {
            document.getElementById('izakayaVideo').style.display = 'none';
            document.querySelector('#cheersView .character-container').style.display = 'flex';
        } else if (view === 'world') {
            document.getElementById('intro-video').style.display = 'none';
            document.querySelector('#worldView .world-top').style.display = 'flex';
            document.getElementById('bossImage').src = 'assets/king.png';
        } else if (view === 'battle') {
            document.getElementById('battle-video').style.display = 'none';
            document.querySelector('#battleView .battle-area').style.display = 'flex';
            gameState.playerHP = 100;
            gameState.enemyHP = 100;
            updateHP('player', 100);
            updateHP('enemy', 100);
            document.getElementById('battleBoss').src = 'assets/boss.png';
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

    function startBattleGame() {
        const battleVideo = document.getElementById('battle-video');
        const battleArea = document.querySelector('#battleView .battle-area');
        const mediaPlaceholder = document.querySelector('#battleView .media-placeholder');
        const startButton = document.getElementById('battleStartButton');

        // Hide elements, show and play video
        battleArea.style.display = 'none';
        mediaPlaceholder.style.display = 'none';
        startButton.style.display = 'none';
        battleVideo.style.display = 'block';
        battleVideo.play();

        // When video ends, start the game
        battleVideo.onended = () => {
            battleVideo.style.display = 'none';
            battleArea.style.display = 'flex';
            mediaPlaceholder.style.display = 'block';
            startGame('battle');
        };
    }

    function startGame(view) {
        resetGame(view);
        toggleButtons(view, false);
        updateMessage(view, "今のうちに水と薬を口に含んで...");

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
                winGame(currentView);
            }
        } else {
            gameState.mouthOpenTime = null;
        }

        if (currentView === 'battle' && gameState.isStarted && !gameState.isOver) {
            updateBattleState();
        }
    }

    function showResultAfterVideo(view) {
        // This function is called AFTER an after-story video plays.
        const viewElement = document.getElementById(`${view}View`);
        if (window.matchMedia("(orientation: landscape) and (max-height: 500px)").matches) {
            viewElement.style.display = 'flex';
        } else {
            viewElement.style.display = 'block';
        }
        mediaContainer.style.display = 'none'; // Hide camera feed

        showResult(view, true);
        updateMessage(view, '');
        toggleButtons(view, false); // Show restart button

        if (view === 'world') {
            document.getElementById('bossImage').src = 'assets/lastboss2.png';
        }
    }

    function playAfterStory(view) {
        document.getElementById(`${view}View`).style.display = 'none';
        mediaContainer.style.display = 'none';

        const afterVideoMap = {
            cheers: document.getElementById('izakayaAfterVideo'),
            world: document.getElementById('worldAfterVideo')
        };

        const videoToPlay = afterVideoMap[view];

        if (videoToPlay) {
            videoToPlay.style.display = 'block';
            videoToPlay.play();
            videoToPlay.onended = () => {
                videoToPlay.style.display = 'none';
                showResultAfterVideo(view);
            };
        } else {
            showResultAfterVideo(view);
        }
    }

    function winGame(view) {
        if (gameState.isOver) return;
        gameState.isOver = true;
        stopDetection();
        winSound.play();

        if (view === 'battle') {
            // For battle, show result directly, keeping camera view.
            gameState.enemyHP = 0;
            updateHP('enemy', 0);
            document.getElementById('battleBoss').src = 'assets/boss2.png';
            updateMessage('battle', 'クリティカル！敵を倒した！');
            // The battle view doesn't have a specific "Result" div,
            // but we still need to show the restart button.
            toggleButtons(view, false);
        } else {
            // For other games, play the after-story video
            playAfterStory(view);
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
    function updateBattleState() {
        gameState.playerHP -= 0.7; // 継続ダメージ
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
            btn.addEventListener('click', () => {
                // Stop, reset, and hide all videos before going to menu
                const allVideos = [
                    document.getElementById('izakayaVideo'),
                    document.getElementById('intro-video'),
                    document.getElementById('battle-video'),
                    document.getElementById('izakayaAfterVideo'),
                    document.getElementById('battleAfterVideo'),
                    document.getElementById('worldAfterVideo')
                ];
                allVideos.forEach(v => {
                    if (v) {
                        v.pause();
                        v.currentTime = 0;
                        v.load();
                        v.style.display = 'none';
                    }
                });
                showView('menu');
            });
        });

        document.getElementById('cheersStartButton').addEventListener('click', () => startCheersGame());
        document.getElementById('worldStartButton').addEventListener('click', () => startWorldGame());
        document.getElementById('battleStartButton').addEventListener('click', () => startBattleGame());

        document.getElementById('cheersRestartButton').addEventListener('click', () => { ganbareSound.play(); startGame('cheers'); });
        document.getElementById('worldRestartButton').addEventListener('click', () => { ganbareSound.play(); startGame('world'); });
        document.getElementById('battleRestartButton').addEventListener('click', () => { ganbareSound.play(); startGame('battle'); });
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

    // --- ウィンドウリサイズ対応 ---
    function handleResize() {
        const placeholder = mediaContainer.parentElement;
        if (mediaContainer.style.display !== 'none' && placeholder && placeholder.offsetParent) {
            const displaySize = {
                width: placeholder.clientWidth,
                height: placeholder.clientHeight
            };
            if (displaySize.width > 0 && displaySize.height > 0) {
                faceapi.matchDimensions(canvas, displaySize);
            }
        }
    }

    // --- 初期化処理 ---
    async function initialize() {
        document.querySelectorAll('button').forEach(b => b.disabled = true);
        setupEventListeners();

        // チュートリアルのイベントリスナー
        document.getElementById('closeTutorial').addEventListener('click', hideTutorial);

        // リサイズイベントリスナー
        window.addEventListener('resize', handleResize);

        // 初回起動時にチュートリアルを表示
        showTutorial();
        showView('menu');
        await startVideo();
        await loadModels();
    }

    initialize();
});