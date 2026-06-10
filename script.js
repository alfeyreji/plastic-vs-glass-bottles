// ==========================================
// NEON AI IMAGE CLASSIFIER - JAVASCRIPT
// ==========================================

const URL = "https://teachablemachine.withgoogle.com/models/KxSdZhlv8/";

let model = null;
let modelLoadPromise = null;
let cameraStream = null;
let videoElement = null;
let predictionAnimationId = null;
let isStartingCamera = false;
let isCameraRunning = false;
let isPredicting = false;

const startBtn = document.getElementById("startBtn");
const startBtnText = startBtn.querySelector(".btn-text");
const webcamContainer = document.getElementById("webcam-container");
const loadingText = document.getElementById("loadingText");
const errorText = document.getElementById("errorText");
const imageUpload = document.getElementById("imageUpload");
const uploadPreview = document.getElementById("uploadPreview");
const predictionsDiv = document.getElementById("predictions");
const topPredictionCard = document.getElementById("topPredictionCard");
const topPredictionClass = document.getElementById("topPredictionClass");
const topPredictionValue = document.getElementById("topPredictionValue");

document.addEventListener("DOMContentLoaded", () => {
    startBtn.addEventListener("click", startCamera);
    imageUpload.addEventListener("change", classifyUploadedImage);
});

function createNamedError(name, message, cause) {
    const error = new Error(message);
    error.name = name;
    error.cause = cause;
    return error;
}

function waitForLibraries(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const checkLibraries = () => {
            if (typeof tf !== "undefined" && typeof tmImage !== "undefined") {
                console.log("Libraries loaded");
                resolve();
                return;
            }

            if (Date.now() - startTime >= timeoutMs) {
                reject(
                    createNamedError(
                        "LibraryLoadError",
                        "TensorFlow.js or Teachable Machine library failed to load."
                    )
                );
                return;
            }

            window.setTimeout(checkLibraries, 100);
        };

        checkLibraries();
    });
}

async function loadModel() {
    if (model) {
        return model;
    }

    if (modelLoadPromise) {
        return modelLoadPromise;
    }

    modelLoadPromise = (async () => {
        await waitForLibraries();
        await tf.ready();

        try {
            model = await tmImage.load(URL + "model.json", URL + "metadata.json");
            console.log("Model loaded");
            return model;
        } catch (error) {
            console.error("Model load error:", error);
            throw createNamedError(
                "ModelLoadError",
                "The AI model failed to load. Check your internet connection and try again.",
                error
            );
        }
    })();

    try {
        return await modelLoadPromise;
    } finally {
        if (!model) {
            modelLoadPromise = null;
        }
    }
}

async function startCamera() {
    if (isStartingCamera || isCameraRunning || hasActiveCameraStream()) {
        showStatus("Camera is already running");
        return;
    }

    isStartingCamera = true;
    startBtn.disabled = true;
    startBtnText.textContent = "STARTING...";
    hideError();

    try {
        showStatus("Loading AI model...");
        await loadModel();

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw createNamedError(
                "BrowserUnsupportedError",
                "Browser does not support camera access."
            );
        }

        showStatus("Requesting camera permission...");
        console.log("Camera permission requested");

        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user",
                width: { ideal: 1280 },
                height: { ideal: 720 },
            },
            audio: false,
        });
        console.log("Camera stream started");

        videoElement = await createAndPlayVideo(cameraStream);
        webcamContainer.replaceChildren(videoElement);

        isCameraRunning = true;
        startBtnText.textContent = "CAMERA RUNNING";
        showStatus("Camera started successfully");
        topPredictionCard.classList.remove("hidden");
        predictionsDiv.innerHTML =
            '<p class="no-predictions">Reading camera feed...</p>';

        const videoTrack = cameraStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.addEventListener("ended", handleCameraEnded, { once: true });
        }

        startPredictionLoop();
    } catch (error) {
        console.error("Camera startup error:", error);
        stopCamera(true);
        handleError(error);
    } finally {
        isStartingCamera = false;
        startBtn.disabled = isCameraRunning;

        if (!isCameraRunning) {
            startBtnText.textContent = "START CAMERA";
        }
    }
}

function createAndPlayVideo(stream) {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.className = "webcam-video";
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;

        const handleLoadedMetadata = async () => {
            try {
                await video.play();
                console.log("Video playing");
                resolve(video);
            } catch (error) {
                reject(error);
            }
        };

        video.addEventListener("loadedmetadata", handleLoadedMetadata, { once: true });
        video.addEventListener(
            "error",
            () => reject(createNamedError("VideoPlaybackError", "Camera video could not play.")),
            { once: true }
        );
        video.srcObject = stream;
    });
}

function startPredictionLoop() {
    cancelPredictionLoop();
    console.log("Predictions running");

    const predictFrame = async () => {
        if (!isCameraRunning || !videoElement || !model) {
            return;
        }

        if (!isPredicting) {
            isPredicting = true;

            try {
                const predictions = await model.predict(videoElement);
                renderPredictions(predictions);
            } catch (error) {
                console.error("Prediction error:", error);
                stopCamera(true);
                handleError(
                    createNamedError(
                        "PredictionError",
                        "Prediction failed. Reload the page and try again.",
                        error
                    )
                );
                return;
            } finally {
                isPredicting = false;
            }
        }

        if (isCameraRunning) {
            predictionAnimationId = requestAnimationFrame(predictFrame);
        }
    };

    predictionAnimationId = requestAnimationFrame(predictFrame);
}

async function classifyUploadedImage(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    if (isStartingCamera) {
        showError("Wait for the camera startup to finish, then upload the image.");
        event.target.value = "";
        return;
    }

    hideError();
    stopCamera(true);
    startBtn.disabled = true;

    try {
        showStatus("Loading AI model...");
        await loadModel();

        showStatus("Classifying uploaded image...");
        const objectUrl = window.URL.createObjectURL(file);

        try {
            await loadImagePreview(objectUrl);
            const predictions = await model.predict(uploadPreview);
            renderPredictions(predictions);
            console.log("Uploaded image prediction complete");
        } finally {
            window.URL.revokeObjectURL(objectUrl);
        }

        showStatus("Image classified successfully");
    } catch (error) {
        console.error("Uploaded image prediction error:", error);

        if (error.name === "LibraryLoadError" || error.name === "ModelLoadError") {
            handleError(error);
        } else {
            handleError(
                createNamedError(
                    "PredictionError",
                    "The uploaded image could not be classified.",
                    error
                )
            );
        }
    } finally {
        startBtn.disabled = false;
        imageUpload.value = "";
    }
}

function loadImagePreview(objectUrl) {
    return new Promise((resolve, reject) => {
        uploadPreview.onload = () => {
            uploadPreview.classList.remove("hidden");
            resolve();
        };
        uploadPreview.onerror = () => reject(new Error("The selected image could not be opened."));
        uploadPreview.src = objectUrl;
    });
}

function renderPredictions(predictions) {
    const sortedPredictions = Array.from(predictions)
        .map((prediction) => ({
            className: prediction.className,
            probability: prediction.probability,
            percentage: (prediction.probability * 100).toFixed(2),
        }))
        .sort((a, b) => b.probability - a.probability);

    updatePredictions(sortedPredictions);
    updateTopPrediction(sortedPredictions[0]);
    topPredictionCard.classList.remove("hidden");
}

function updatePredictions(predictions) {
    if (!predictions.length) {
        predictionsDiv.innerHTML =
            '<p class="no-predictions">No predictions available</p>';
        return;
    }

    const fragment = document.createDocumentFragment();

    predictions.forEach((prediction) => {
        const predictionItem = document.createElement("div");
        predictionItem.className = "prediction-item";

        const header = document.createElement("div");
        header.className = "prediction-header";

        const label = document.createElement("span");
        label.className = "prediction-label";
        label.textContent = prediction.className;

        const percentage = document.createElement("span");
        percentage.className = "prediction-percentage";
        percentage.textContent = `${prediction.percentage}%`;

        const barContainer = document.createElement("div");
        barContainer.className = "prediction-bar-container";

        const bar = document.createElement("div");
        bar.className = "prediction-bar";
        bar.style.width = `${prediction.probability * 100}%`;

        header.append(label, percentage);
        barContainer.appendChild(bar);
        predictionItem.append(header, barContainer);
        fragment.appendChild(predictionItem);
    });

    predictionsDiv.replaceChildren(fragment);
}

function updateTopPrediction(topPrediction) {
    if (!topPrediction) {
        return;
    }

    topPredictionClass.textContent = topPrediction.className;
    topPredictionValue.textContent = `${topPrediction.percentage}%`;
}

function hasActiveCameraStream() {
    return Boolean(
        cameraStream &&
            cameraStream.getVideoTracks().some((track) => track.readyState === "live")
    );
}

function cancelPredictionLoop() {
    if (predictionAnimationId !== null) {
        cancelAnimationFrame(predictionAnimationId);
        predictionAnimationId = null;
    }
}

function stopCamera(resetDisplay) {
    cancelPredictionLoop();
    isCameraRunning = false;

    if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
        cameraStream = null;
    }

    if (videoElement) {
        videoElement.pause();
        videoElement.srcObject = null;
        videoElement = null;
    }

    if (resetDisplay) {
        const placeholder = document.createElement("div");
        placeholder.id = "webcam-placeholder";
        placeholder.className = "webcam-placeholder";

        const placeholderText = document.createElement("p");
        placeholderText.textContent = "Camera Ready";
        placeholder.appendChild(placeholderText);
        webcamContainer.replaceChildren(placeholder);
    }

    startBtn.disabled = false;
    startBtnText.textContent = "START CAMERA";
}

function handleCameraEnded() {
    if (!isCameraRunning) {
        return;
    }

    console.error("Camera stream ended unexpectedly");
    stopCamera(true);
    showError("Camera stopped. Reconnect it and click Start Camera again.");
}

function showStatus(message) {
    loadingText.textContent = message;
    loadingText.classList.remove("hidden");
}

function hideError() {
    errorText.classList.add("hidden");
    errorText.replaceChildren();
}

function showError(message) {
    const title = document.createElement("strong");
    title.textContent = message;

    const helpList = document.createElement("ul");
    [
        "Allow camera permission in Chrome site settings.",
        "Close Google Meet, Zoom, WhatsApp, or Windows Camera if they are using the camera.",
        "Use VS Code Live Server instead of opening the HTML file directly.",
        "Check Windows Settings > Privacy & security > Camera.",
    ].forEach((tip) => {
        const item = document.createElement("li");
        item.textContent = tip;
        helpList.appendChild(item);
    });

    errorText.replaceChildren(title, helpList);
    errorText.classList.remove("hidden");
    loadingText.classList.add("hidden");
}

function handleError(error) {
    console.error("Caught error:", error);

    const errorMessages = {
        NotAllowedError: "Camera permission denied.",
        PermissionDeniedError: "Camera permission denied.",
        NotFoundError: "No camera found.",
        DevicesNotFoundError: "No camera found.",
        NotReadableError: "Camera is already used by another app.",
        TrackStartError: "Camera is already used by another app.",
        BrowserUnsupportedError: "Browser does not support camera access.",
        LibraryLoadError: "TensorFlow.js or Teachable Machine library failed to load.",
        ModelLoadError: "AI model failed to load.",
        PredictionError: "Prediction error.",
        VideoPlaybackError: "Camera video could not start.",
    };

    showError(errorMessages[error.name] || error.message || "Unexpected camera error.");
}

window.addEventListener("beforeunload", () => {
    stopCamera(false);
});
