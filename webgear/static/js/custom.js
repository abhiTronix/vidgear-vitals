/*!
===============================================
vidgear library source-code is deployed under the Apache 2.0 License:
Copyright (c) 2019 Abhishek Thakur(@abhiTronix) <abhi.una12@gmail.com>
    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at
    http://www.apache.org/licenses/LICENSE-2.0
    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
    ===============================================
    */

/*handles fullscreen workflow (native Fullscreen API)*/
function toggleFullScreen(id) {
    const element = document.getElementById(id);
    if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else if (element) {
        (element.requestFullscreen || element.webkitRequestFullscreen).call(element);
    }
}

/*handles WebGear stream: low-latency H.264 (WebSocket + WebCodecs) with MJPEG fallback*/
(function () {
    const player = document.getElementById("player");
    if (!player) return; // error pages

    const canvas = document.getElementById("canvascontainer");
    const img = document.getElementById("imgcontainer");
    const hud = (name, text) => (document.getElementById("hud-" + name).textContent = text);
    const videoEndpoint = player.dataset.video || "/video";

    player.addEventListener("click", () => toggleFullScreen("player"));
    img.addEventListener("load", () => hud("res", img.naturalWidth + "\u00d7" + img.naturalHeight), { once: true });

    function mjpeg(reason) {
        canvas.hidden = true;
        img.hidden = false;
        if (!img.getAttribute("src")) img.src = videoEndpoint;
        hud("mode", "MJPEG");
        hud("status", reason ? "fallback" : "live");
        reason && console.warn("WebGear: MJPEG fallback,", reason);
    }

    if (player.dataset.mode !== "h264") return mjpeg();
    // WebCodecs is secure-context only: HTTPS or localhost
    if (!("VideoDecoder" in window && "Worker" in window && window.isSecureContext)) {
        return mjpeg("WebCodecs unavailable (needs HTTPS or localhost)");
    }

    const ctx = canvas.getContext("2d");
    const worker = new Worker(player.dataset.worker);
    const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws" + videoEndpoint);
    ws.binaryType = "arraybuffer";
    let frames = 0, bytes = 0, latency = 0, live = false;

    ws.onmessage = ({ data }) => {
        bytes += data.byteLength;
        worker.postMessage({ type: "chunk", data }, [data]);
    };
    ws.onclose = () => {
        worker.terminate();
        live ? hud("status", "ended") : mjpeg("WebSocket stream unavailable");
    };
    worker.onerror = (e) => (live ? hud("status", "error") : (ws.close(), mjpeg(e.message)));
    worker.onmessage = ({ data }) => {
        if (data.type === "error") return console.error("WebGear decoder:", data.message);
        const frame = data.frame;
        if (!live) {
            live = true;
            canvas.hidden = false;
            img.hidden = true;
            hud("mode", "H.264");
            hud("status", "live");
        }
        if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
            canvas.width = frame.displayWidth;
            canvas.height = frame.displayHeight;
            hud("res", frame.displayWidth + "\u00d7" + frame.displayHeight);
        }
        ctx.drawImage(frame, 0, 0);
        latency += performance.timeOrigin + performance.now() - frame.timestamp / 1000;
        frame.close(); // release GPU buffer immediately
        frames++;
    };

    // telemetry tick
    setInterval(() => {
        if (!live) return;
        hud("fps", frames + " fps");
        hud("rate", (bytes / 1024).toFixed(1) + " KB/s");
        frames && hud("latency", "decode " + (latency / frames).toFixed(1) + " ms");
        frames = bytes = latency = 0;
    }, 1000);
})();
