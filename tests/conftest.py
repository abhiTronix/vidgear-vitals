"""
Serves this repository's WebGear & WebGear_RTC themes through real vidgear servers
(WebGear: H.264 & MJPEG modes, WebGear_RTC: default & live-broadcast) for Playwright frontend tests.
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

RTC_SERVER = """
import sys, uvicorn
from vidgear.gears.asyncio import WebGear_RTC
source, live, data, port = sys.argv[1:]
web = WebGear_RTC(source=source, enable_live_broadcast=live == "live", custom_data_location=data,
                  enable_infinite_frames=True, frame_size_reduction=0, logging=True)
uvicorn.run(web(), host="127.0.0.1", port=int(port), log_level="warning")
"""


@pytest.fixture(scope="session")
def browser_type_launch_args(browser_type_launch_args):
    """
    exposes plain host ICE candidates (no mDNS `.local` names) for loopback WebRTC
    """
    args = browser_type_launch_args.get("args", [])
    return {**browser_type_launch_args, "args": args + ["--disable-features=WebRtcHideLocalIpsWithMdns"]}


@pytest.fixture(scope="session")
def video(tmp_path_factory):
    """
    120s 640x360@25 test clip
    """
    video = tmp_path_factory.mktemp("video") / "testsrc.mp4"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25",
         "-t", "120", "-pix_fmt", "yuv420p", str(video)],
        check=True,
    )
    return video


def serve(tmp, theme, script, video, specs):
    """
    starts one server per `(port, arg)` spec with local `theme` files, yields {arg: base_url}
    """
    procs, urls = [], {}
    for port, arg in specs:
        data = tmp / arg
        shutil.copytree(ROOT / theme, data / ".vidgear" / theme)
        procs.append(subprocess.Popen([sys.executable, "-c", script, str(video), arg, str(data), str(port)]))
        urls[arg] = "http://127.0.0.1:{}".format(port)
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


@pytest.fixture(scope="session")
def servers(tmp_path_factory, video):
    """
    Starts one WebGear server per streaming mode, using local theme files: {mode: base_url}
    """
    yield from serve(tmp_path_factory.mktemp("webgear"), "webgear", SERVER, video, ((8701, "h264"), (8702, "mjpeg")))


@pytest.fixture(scope="session")
def rtc_servers(tmp_path_factory, video):
    """
    Starts default & live-broadcast WebGear_RTC servers, using local theme files: {kind: base_url}
    """
    yield from serve(tmp_path_factory.mktemp("webgear_rtc"), "webgear_rtc", RTC_SERVER, video, ((8703, "default"), (8704, "live")))
