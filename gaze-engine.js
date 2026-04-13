/**
 * 配色家离散眼神控制系统
 * 
 * 方案: 单眼虹膜比例直测法 (Iris Ratio Method)
 * 原理: 直接测量左眼瞳孔在眼眶中的水平位置比例
 *       比例从 0~1 线性对应 8 张卡片
 *       只需 3 步校准: 看最左 → 看中间 → 看最右
 */

import {
    FaceLandmarker,
    FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

// ===== DOM =====
var STATUS_EL = document.getElementById('status-badge');
var CALIBRATE_BTN = document.getElementById('calibrate-btn');
var RECALIBRATE_BTN = document.getElementById('recalibrate-btn');
var CURSOR = document.getElementById('gaze-cursor');
var CALIB_OVERLAY = document.getElementById('calibration-overlay');
var CALIB_STEP = document.getElementById('calib-step-text');
var CALIB_INST = document.getElementById('calib-instruction-text');
var WEBCAM = document.getElementById('webcam');

// ===== 状态 =====
var faceLandmarker = null;
var webcamRunning = false;
var lastVideoTime = -1;
var isCalibrating = false;

// ===== 虹膜校准数据 =====
var irisMin = 0.35;
var irisMax = 0.65;
var irisMid = 0.50;

// 平滑
var smoothedRatio = 0.5;
var SMOOTH_FACTOR = 0.25;

var lastGazedIndex = -1;

// ===================================================
// 1. 初始化 MediaPipe FaceLandmarker
// ===================================================
async function init() {
    try {
        var vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numFaces: 1,
            outputFaceBlendshapes: false,
            outputFacialTransformationMatrixes: false
        });

        STATUS_EL.textContent = "模型就绪";

        var stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 }
        });
        WEBCAM.srcObject = stream;
        webcamRunning = true;
        WEBCAM.addEventListener("loadeddata", loop);

        STATUS_EL.textContent = "已就绪 · 请校准";
        CALIBRATE_BTN.disabled = false;

    } catch (e) {
        console.error("初始化失败:", e);
        STATUS_EL.textContent = "初始化失败";
    }
}

// ===================================================
// 2. 实时推理循环
// ===================================================
function loop() {
    if (!webcamRunning) return;

    var now = performance.now();
    if (lastVideoTime !== WEBCAM.currentTime) {
        lastVideoTime = WEBCAM.currentTime;

        try {
            var results = faceLandmarker.detectForVideo(WEBCAM, now);
            if (results.faceLandmarks && results.faceLandmarks.length > 0) {
                processLandmarks(results.faceLandmarks[0]);
            }
        } catch (e) {
            // 忽略偶发帧错误
        }
    }

    requestAnimationFrame(loop);
}

// ===================================================
// 3. 头部朝向 + 虹膜融合 (Head Pose + Iris Fusion)
// ===================================================
//
// 原理: 专业眼动追踪仪都是"头部姿态 + 眼球"双信号融合。
//       头部朝向 = 粗定位（非常可靠，因为脸很大）
//       虹膜偏移 = 精细调整（精度有限但有用）
//       融合后可以覆盖 8 个目标。
//
var HEAD_WEIGHT = 0.55;  // 头部朝向的权重（更可靠给更多权重）
var IRIS_WEIGHT = 0.45;  // 虹膜的权重

function processLandmarks(lm) {
    if (!lm[468] || !lm[1]) return;

    // --- 头部朝向估计 ---
    // 鼻尖(1) 相对于左脸颊(234)和右脸颊(454) 的水平位置
    // 当头左转时，鼻尖会偏向右脸颊；反之亦然
    var leftFace = lm[234].x;   // 左脸边缘
    var rightFace = lm[454].x;  // 右脸边缘
    var noseTip = lm[1].x;      // 鼻尖
    var faceWidth = rightFace - leftFace;

    if (Math.abs(faceWidth) < 0.001) return;
    var headRatio = (noseTip - leftFace) / faceWidth;

    // --- 虹膜比例 ---
    var innerX = lm[133].x;
    var outerX = lm[33].x;
    var eyeWidth = outerX - innerX;
    var irisRatio = 0.5;
    if (Math.abs(eyeWidth) > 0.001) {
        irisRatio = (lm[468].x - innerX) / eyeWidth;
    }

    // --- 融合 ---
    var fusedRatio = headRatio * HEAD_WEIGHT + irisRatio * IRIS_WEIGHT;

    // 自适应平滑
    var delta = Math.abs(fusedRatio - smoothedRatio);
    var adaptiveSmooth = delta > 0.025 ? 0.35 : 0.08;
    smoothedRatio += (fusedRatio - smoothedRatio) * adaptiveSmooth;

    // 校准中
    if (isCalibrating) {
        collectCalibData(smoothedRatio);
        return;
    }

    // 将虹膜比例映射到卡片索引 [0, 7]
    var normalizedRatio = (smoothedRatio - irisMin) / (irisMax - irisMin);
    normalizedRatio = Math.max(0, Math.min(1, normalizedRatio));

    // 反转: 比例大=看左=左边的卡片(索引小)
    var cardIndex = Math.round((1 - normalizedRatio) * 7);
    cardIndex = Math.max(0, Math.min(7, cardIndex));

    highlightCard(cardIndex);
}

function highlightCard(index) {
    if (index === lastGazedIndex) return;
    lastGazedIndex = index;

    var cards = document.querySelectorAll('.gaze-card');
    cards.forEach(function(card, i) {
        if (i === index) {
            card.classList.add('gazed');
        } else {
            card.classList.remove('gazed');
        }
    });

    // 移动光标
    var card = cards[index];
    if (card) {
        var rect = card.getBoundingClientRect();
        CURSOR.style.left = (rect.left + rect.width / 2) + 'px';
        CURSOR.style.top = (rect.top + rect.height / 2) + 'px';
    }
}

// ===================================================
// 4. 校准 (只需 3 步!)
// ===================================================
var calibStep = 0;
var calibSamples = [];
var calibTimer = null;

var CALIB_STEPS = [
    { label: "1 / 3", instruction: "请看向屏幕的←最左边←", field: "left" },
    { label: "2 / 3", instruction: "请看向屏幕的●正中间●", field: "center" },
    { label: "3 / 3", instruction: "请看向屏幕的→最右边→", field: "right" }
];

function startCalibration() {
    isCalibrating = true;
    calibStep = 0;
    CURSOR.classList.remove('active');
    CALIB_OVERLAY.classList.remove('hidden');
    showCalibStep();
}

function showCalibStep() {
    if (calibStep >= CALIB_STEPS.length) {
        finishCalibration();
        return;
    }

    var step = CALIB_STEPS[calibStep];
    CALIB_STEP.textContent = step.label;
    CALIB_INST.textContent = step.instruction;
    calibSamples = [];

    // 3秒后自动采集完成
    calibTimer = setTimeout(function() {
        // 取样本的中位数（抗噪）
        calibSamples.sort(function(a, b) { return a - b; });
        var median = calibSamples[Math.floor(calibSamples.length / 2)] || smoothedRatio;

        if (step.field === 'left') {
            irisMax = median; // 看左时的虹膜比例较大
        } else if (step.field === 'center') {
            irisMid = median;
        } else if (step.field === 'right') {
            irisMin = median; // 看右时的虹膜比例较小
        }

        console.log("校准 " + step.field + ": " + median.toFixed(4));

        calibStep++;
        showCalibStep();
    }, 3000);
}

function collectCalibData(ratio) {
    calibSamples.push(ratio);
}

function finishCalibration() {
    isCalibrating = false;
    CALIB_OVERLAY.classList.add('hidden');
    CURSOR.classList.add('active');
    RECALIBRATE_BTN.disabled = false;

    // 给映射范围增加 10% 的余量，让边缘卡片更容易选到
    var range = irisMax - irisMin;
    irisMin -= range * 0.1;
    irisMax += range * 0.1;

    STATUS_EL.textContent = "校准完成 · 追踪中";
    console.log("虹膜范围: [" + irisMin.toFixed(4) + ", " + irisMax.toFixed(4) + "]");
}

// ===================================================
// 5. 事件绑定
// ===================================================
CALIBRATE_BTN.onclick = startCalibration;
RECALIBRATE_BTN.onclick = startCalibration;

// ===================================================
// 6. 脑波驱动事件 (Brainwave Driven Events)
// ===================================================
window.addEventListener('bw-confirm-trigger', function() {
    // 确认动作：点击当前聚焦的卡片
    var cards = document.querySelectorAll('.gaze-card');
    if (lastGazedIndex !== -1 && cards[lastGazedIndex]) {
        console.log("执行确认操作: 材质 " + (lastGazedIndex + 1));
        
        // 视觉反馈已经在 brainwave-engine.js 中通过 class 处理了
        // 这里可以执行实际业务逻辑，比如弹出选择成功提示
        STATUS_EL.textContent = "已选定材质 " + (lastGazedIndex + 1);
        STATUS_EL.classList.replace('loading', 'ready');
        
        // 模拟点击
        cards[lastGazedIndex].click();
    }
});

window.addEventListener('bw-cancel-trigger', function() {
    // 取消动作：重置状态
    console.log("执行取消操作");
    STATUS_EL.textContent = "操作已取消";
    
    // 可以在这里清除之前的选择
    var cards = document.querySelectorAll('.gaze-card');
    cards.forEach(c => c.classList.remove('confirmed-pulse'));
});

window.addEventListener('load', init);
