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

/* WebGear off-thread H.264 (Annex-B) decoder using WebCodecs VideoDecoder.
   In:  { type: "chunk", data: ArrayBuffer }  -- one complete access unit
   Out: { type: "frame", frame: VideoFrame } | { type: "error", message } */

const MAX_QUEUE = 3; // decode backlog that triggers drop-to-next-keyframe
let decoder = null;
let codec = "";
let waitKey = true;

const hex = (b) => b.toString(16).padStart(2, "0");

/* Scans leading NAL units until first slice: returns keyframe flag & codec string from SPS */
function inspect(bytes) {
  let key = false, sps = "";
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] || bytes[i + 1] || bytes[i + 2] !== 1) continue;
    const h = i + 3, type = bytes[h] & 0x1f;
    // avc1.PPCCLL from profile_idc, constraint flags, level_idc
    if (type === 7 && h + 3 < bytes.length) sps = "avc1." + hex(bytes[h + 1]) + hex(bytes[h + 2]) + hex(bytes[h + 3]);
    if (type === 5) key = true;
    if (type === 1 || type === 5) break;
    i = h;
  }
  return { key, sps };
}

function createDecoder() {
  decoder = new VideoDecoder({
    output: (frame) => self.postMessage({ type: "frame", frame }, [frame]),
    error: (e) => {
      self.postMessage({ type: "error", message: e.message });
      decoder = null;
      codec = "";
      waitKey = true;
    },
  });
}

self.onmessage = ({ data }) => {
  if (data.type !== "chunk") return;
  const bytes = new Uint8Array(data.data);
  const { key, sps } = inspect(bytes);

  // (re)configure on keyframes carrying new parameter sets
  if (key && sps && sps !== codec) {
    if (!decoder || decoder.state === "closed") createDecoder();
    decoder.configure({ codec: sps, optimizeForLatency: true });
    codec = sps;
  }
  if (!decoder || decoder.state !== "configured") return;

  // latency guard: drop deltas while backlogged or awaiting keyframe
  if (decoder.decodeQueueSize > MAX_QUEUE) waitKey = true;
  if (waitKey && !key) return;
  waitKey = false;

  decoder.decode(
    new EncodedVideoChunk({
      type: key ? "key" : "delta",
      timestamp: Math.round((performance.timeOrigin + performance.now()) * 1000), // epoch us: main thread derives decode latency
      data: bytes,
    })
  );
};
