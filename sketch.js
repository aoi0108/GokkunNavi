let video;
let canvas;
let displaySize;
let isGameStarted = false;
let isCounting = false;
let isGameOver = false;
let mouthOpenStartTime = null;

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

    // 音声ファイルの初期化
    winSound = new Audio('assets/winsound.mp3');

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
    const top = mouth[13];    // 上唇中央
    const bottom = mouth[19]; // 下唇中央
    const d = dist(top.x, top.y, bottom.x, bottom.y);
    return d > MOUTH_OPEN_THRESHOLD;
}

async function loadFaceAPI() {
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri('models/tiny_face_detector');
        await faceapi.nets.faceLandmark68Net.loadFromUri('models/face_landmark_68');
        await startVideo();
        startButton.disabled = false;
        messageEl.textContent = "スタートボタンを押してください。";
    } catch (err) {
        console.error("顔認識モデルの読み込みに失敗しました:", err);
        messageEl.textContent = "顔認識モデルの読み込みに失敗しました。";
    }
}

async function startVideo() {
    video = document.getElementById('video');
    canvas = document.getElementById('canvas');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        displaySize = { width: video.width, height: video.height };
        faceapi.matchDimensions(canvas, displaySize);
    } catch (err) {
        console.error("カメラの起動に失敗しました:", err);
        messageEl.textContent = "カメラの起動に失敗しました。";
    }
}

async function detectExpressions() {
    if (!isGameStarted || isGameOver) return;

    const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
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
    messageEl.textContent = "準備完了！スタートボタンを押してください。";
}

// DOMContentLoaded イベントリスナー
document.addEventListener('DOMContentLoaded', () => {
    initializeElements();
    startButton.disabled = true;
    messageEl.textContent = "顔認識モデルを読み込み中...";
    loadFaceAPI();
});
