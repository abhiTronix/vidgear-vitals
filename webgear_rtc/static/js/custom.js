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

/*handles WebGear_RTC stream: WebRTC peer with auto-reconnect & real-time performance overlay*/
(function () {
    const player = document.getElementById("player");
    if (!player) return; // error pages

    const video = document.getElementById("video");
    const pill = (name) => document.getElementById("hud-" + name);
    const hud = (name, text) => (pill(name).textContent = text);
    const status = (state) => {
        hud("status", state);
        pill("status").dataset.state = state;
    };
    // relative endpoints, so app works behind reverse-proxy sub-paths too
    const offerUrl = player.dataset.offer || "offer";
    const closeUrl = player.dataset.close || "close_connection";
    let iceServers = [];
    try {
        iceServers = JSON.parse(player.dataset.iceServers || "[]");
    } catch (e) {
        console.warn("WebGear_RTC: invalid ICE servers,", e);
    }

    player.addEventListener("click", () => toggleFullScreen("player"));

    let pc = null, id = null, timer = null, retries = 0, last = null, stalled = 0;

    // wait for ICE gathering, but never longer than `ms` (unreachable STUN servers)
    const gathered = (peer, ms) =>
        new Promise((resolve) => {
            if (peer.iceGatheringState === "complete") return resolve();
            peer.addEventListener("icegatheringstatechange", () => peer.iceGatheringState === "complete" && resolve());
            setTimeout(resolve, ms);
        });

    function close() {
        clearTimeout(timer);
        if (!pc) return;
        pc.onconnectionstatechange = null;
        pc.close();
        pc = null;
        // ask server to free this peer now, beacon survives page unload
        navigator.sendBeacon(closeUrl, new Blob([JSON.stringify({ id: id })], { type: "application/json" }));
        id = null;
    }

    function reconnect(reason) {
        close();
        status("reconnecting");
        console.warn("WebGear_RTC: reconnecting,", reason);
        timer = setTimeout(connect, Math.min(1000 * 2 ** retries++, 10000));
    }

    async function connect() {
        close();
        status("connecting");
        last = null;
        stalled = 0;
        const peer = (pc = new RTCPeerConnection({ iceServers: iceServers }));
        peer.addTransceiver("video", { direction: "recvonly" });
        peer.ontrack = (evt) => (video.srcObject = evt.streams[0] || new MediaStream([evt.track]));
        peer.onconnectionstatechange = () => {
            const state = peer.connectionState;
            if (state === "connected") {
                retries = 0;
                status("live");
            } else if (state === "failed") {
                reconnect("connection failed");
            } else if (state === "disconnected") {
                status("reconnecting");
                timer = setTimeout(() => peer.connectionState === "disconnected" && reconnect("connection lost"), 5000);
            }
        };
        try {
            await peer.setLocalDescription(await peer.createOffer());
            await gathered(peer, 3000);
            const response = await fetch(offerUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sdp: peer.localDescription.sdp, type: peer.localDescription.type }),
            });
            if (peer !== pc) return;
            if (response.status === 503) {
                // video-server stream ended, nothing to reconnect to
                close();
                return status("ended");
            }
            if (!response.ok) throw new Error("offer rejected with HTTP " + response.status);
            const answer = await response.json();
            id = answer.id;
            await peer.setRemoteDescription({ sdp: answer.sdp, type: answer.type });
        } catch (e) {
            peer === pc && reconnect(e.message);
        }
    }

    // real-time performance overlay, from WebRTC stats (fields browsers lack stay hidden)
    setInterval(async () => {
        if (!pc || pc.connectionState !== "connected") return;
        const peer = pc;
        const report = await peer.getStats();
        let rtp, pair;
        report.forEach((s) => {
            if (s.type === "inbound-rtp" && s.kind === "video") rtp = s;
            if (s.type === "candidate-pair" && s.nominated && s.state === "succeeded") pair = s;
        });
        if (!rtp || peer !== pc) return;
        const codec = rtp.codecId && report.get(rtp.codecId);
        codec && hud("codec", codec.mimeType.split("/")[1]);
        rtp.frameWidth && hud("res", rtp.frameWidth + "×" + rtp.frameHeight);
        pair && pair.currentRoundTripTime >= 0 && hud("rtt", "rtt " + Math.round(pair.currentRoundTripTime * 1000) + " ms");
        if (last) {
            const delta = (key) => rtp[key] - last[key];
            const seconds = delta("timestamp") / 1000;
            const frames = delta("framesDecoded");
            if (Number.isFinite(frames)) {
                hud("fps", Math.round(frames / seconds) + " fps");
                stalled = frames > 0 ? 0 : stalled + 1;
            }
            const kbps = (delta("bytesReceived") * 8) / seconds / 1000;
            Number.isFinite(kbps) && hud("rate", kbps >= 1000 ? (kbps / 1000).toFixed(2) + " Mbps" : Math.round(kbps) + " kbps");
            const buffer = delta("jitterBufferDelay") / delta("jitterBufferEmittedCount");
            Number.isFinite(buffer) && hud("buffer", "buffer " + Math.round(buffer * 1000) + " ms");
            const lost = delta("packetsLost"), received = delta("packetsReceived");
            if (lost + received > 0) {
                const percent = (100 * Math.max(lost, 0)) / (lost + received);
                hud("loss", "loss " + percent.toFixed(1) + "%");
                pill("loss").dataset.level = percent > 5 ? "bad" : percent > 1 ? "warn" : "";
            }
            // connected but no new frames: show it, then re-negotiate
            if (stalled >= 5) return reconnect("stream stalled");
            status(stalled >= 2 ? "stalled" : "live");
        }
        last = rtp;
    }, 1000);

    addEventListener("pagehide", close);
    addEventListener("pageshow", (e) => e.persisted && connect());
    connect();
})();
