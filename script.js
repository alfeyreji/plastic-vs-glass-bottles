// ==========================================
// NEON AI IMAGE CLASSIFIER - JAVASCRIPT
// ==========================================

// Teachable Machine Model URL
const URL = "https://teachablemachine.withgoogle.com/models/KxSdZhlv8/";

// State Management
let model;
let webcam;
let maxPredictions;
let labelContainer;
let isModelLoaded = false;
let isCameraRunning = false;
let predictionAnimationId;

// DOM Elements
const startBtn = document.getElementById("startBtn");
const webcamContainer = document.getElementById("webcam-container");
const loadingText = document.getElementById("loadingText");
const errorText = document.getElementById("errorText");
const predictionsDiv = document.getElementById("predictions");
const topPredictionCard = document.getElementById("topPredictionCard");
const topPredictionClass = document.getElementById("topPredictionClass");
const topPredictionValue = document.getElementById("topPredictionValue");

// ==========================================
// WAIT FOR LIBRARIES TO LOAD
// ==========================================

function waitForLibraries() {
    return new Promise((resolve) => {
        if (typeof tmImage !== "undefined" && typeof tf !== "undefined") {
            resolve();
        } else {
            setTimeout(() => waitForLibraries().then(resolve), 100);
        }
    });
}

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {
    await waitForLibraries();
    startBtn.addEventListener("click", initializeCamera);
});

// ==========================================
// INITIALIZE CAMERA & LOAD MODEL
// ==========================================

async function initializeCamera() {
    try {
        console.log("Initializing camera...");
        startBtn.disabled = true;
        loadingText.classList.remove("hidden");
        errorText.classList.add("hidden");
        showLoadingText("Loading model and initializing camera...");

        // Check if tmImage is available
        if (typeof tmImage === "undefined") {
            throw new Error("Teachable Machine library not loaded. Please refresh the page.");
        }

        console.log("Loading model...");
        // Initialize Teachable Machine
        const modelURL = URL + "model.json";
        const metadataURL = URL + "metadata.json";

        model = await tmImage.load(modelURL, metadataURL);
        maxPredictions = model.getTotalClasses();
        console.log("Model loaded. Classes:", maxPredictions);

        console.log("Initializing webcam...");
        // Initialize Webcam
        const size = 300;
        const flip = true;
        webcam = new tmImage.Webcam(size, size, flip);
        await webcam.setup();
        console.log("Webcam setup complete");
        
        await webcam.play();
        console.log("Webcam playing");

        // Clear placeholder and add webcam canvas
        webcamContainer.innerHTML = "";
        webcamContainer.appendChild(webcam.canvas);

        // Update UI
        isModelLoaded = true;
        isCameraRunning = true;
        loadingText.classList.add("hidden");
        startBtn.disabled = true;
        startBtn.style.display = "none";
        topPredictionCard.classList.remove("hidden");

        console.log("Starting predictions...");
        // Start prediction loop
        predictionsDiv.innerHTML = "";
        predict();
    } catch (error) {
        console.error("Full error:", error);
        handleCameraError(error);
    }
}

// ==========================================
// HANDLE CAMERA ERRORS
// ==========================================

function handleCameraError(error) {
    console.error("Error Details:", error);
    console.error("Error Name:", error.name);
    console.error("Error Message:", error.message);

    startBtn.disabled = false;
    startBtn.style.display = "block";
    loadingText.classList.add("hidden");
    errorText.classList.remove("hidden");

    if (error.message && error.message.includes("Teachable Machine library")) {
        errorText.textContent = "❌ Libraries failed to load. Please refresh the page.";
    } else if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        errorText.textContent =
            "❌ Camera permission denied. Please allow camera access and try again.";
    } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        errorText.textContent =
            "❌ No camera found. Please connect a camera and try again.";
    } else if (error.name === "NotReadableError") {
        errorText.textContent =
            "❌ Camera is already in use. Please close other apps using the camera.";
    } else {
        errorText.textContent = `❌ Error: ${error.message || error}`;
    }
}

// ==========================================
// SHOW LOADING TEXT
// ==========================================

function showLoadingText(text) {
    loadingText.textContent = text;
}

// ==========================================
// PREDICTION LOOP
// ==========================================

async function predict() {
    if (isCameraRunning && isModelLoaded) {
        // Webcam Update
        webcam.update();

        // Get Predictions
        const prediction = await model.predict(webcam.canvas);

        // Sort predictions by confidence (highest first)
        const sortedPredictions = Array.from(prediction)
            .map((pred, index) => ({
                className: model.getClassName(index),
                probability: pred.probability,
                percentage: (pred.probability * 100).toFixed(2),
            }))
            .sort((a, b) => b.probability - a.probability);

        // Update UI with predictions
        updatePredictions(sortedPredictions);

        // Update top prediction card
        updateTopPrediction(sortedPredictions[0]);
    }

    predictionAnimationId = requestAnimationFrame(predict);
}

// ==========================================
// UPDATE PREDICTIONS DISPLAY
// ==========================================

function updatePredictions(predictions) {
    predictionsDiv.innerHTML = "";

    if (!predictions || predictions.length === 0) {
        predictionsDiv.innerHTML = '<p class="no-predictions">No predictions available</p>';
        return;
    }

    predictions.forEach((pred, index) => {
        const predictionItem = document.createElement("div");
        predictionItem.className = "prediction-item";

        const header = document.createElement("div");
        header.className = "prediction-header";

        const label = document.createElement("span");
        label.className = "prediction-label";
        label.textContent = pred.className;

        const percentage = document.createElement("span");
        percentage.className = "prediction-percentage";
        percentage.textContent = `${pred.percentage}%`;

        header.appendChild(label);
        header.appendChild(percentage);

        const barContainer = document.createElement("div");
        barContainer.className = "prediction-bar-container";

        const bar = document.createElement("div");
        bar.className = "prediction-bar";
        bar.style.width = `${pred.probability * 100}%`;

        barContainer.appendChild(bar);

        predictionItem.appendChild(header);
        predictionItem.appendChild(barContainer);

        predictionsDiv.appendChild(predictionItem);
    });
}

// ==========================================
// UPDATE TOP PREDICTION CARD
// ==========================================

function updateTopPrediction(topPred) {
    if (topPred && topPred.probability > 0) {
        topPredictionClass.textContent = topPred.className;
        topPredictionValue.textContent = `${topPred.percentage}%`;
    }
}

// ==========================================
// CLEANUP ON PAGE UNLOAD
// ==========================================

window.addEventListener("beforeunload", () => {
    if (webcam) {
        webcam.stop();
    }
    if (predictionAnimationId) {
        cancelAnimationFrame(predictionAnimationId);
    }
});
