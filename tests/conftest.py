"""
Serves this repository's WebGear theme through a real vidgear WebGear server (H.264 & MJPEG modes)
for Playwright frontend tests.
"""

import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

SERVER = """
import sys, uvicorn
from vidgear.gears.asyncio import WebGear
source, mode, data, port = sys.argv[1:]
web = WebGear(source=source, streaming_mode=mode, custom_data_location=data,
              enable_infinite_frames=True, frame_size_reduction=0, logging=True)
uvicorn.run(web(), host="127.0.0.1", port=int(port), log_level="warning")
"""


@pytest.fixture(scope="session")
def servers(tmp_path_factory):
    """
    Starts one WebGear server per streaming mode, using local theme files: {mode: base_url}
    """
    tmp = tmp_path_factory.mktemp("webgear")
    video = tmp / "testsrc.mp4"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25",
         "-t", "120", "-pix_fmt", "yuv420p", str(video)],
        check=True,
    )
    procs, urls = [], {}
    for port, mode in ((8701, "h264"), (8702, "mjpeg")):
        data = tmp / mode
        shutil.copytree(ROOT / "webgear", data / ".vidgear" / "webgear")
        procs.append(subprocess.Popen([sys.executable, "-c", SERVER, str(video), mode, str(data), str(port)]))
        urls[mode] = "http://127.0.0.1:{}".format(port)
    try:
        for url in urls.values():
            deadline = time.time() + 90
            while True:
                try:
                    urllib.request.urlopen(url + "/static/css/custom.css", timeout=2)
                    break
                except OSError:
                    if time.time() > deadline:
                        raise
                    time.sleep(0.5)
        yield urls
    finally:
        for proc in procs:
            proc.terminate()
            proc.wait(timeout=30)
