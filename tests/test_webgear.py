"""
Playwright tests for WebGear default theme: H.264 WebCodecs engine, MJPEG fallbacks, fullscreen & error pages.
"""

import re

import pytest
from playwright.sync_api import expect

# counts non-black canvas samples, proves decoded frames were painted
LIT_PIXELS = """() => {
    const c = document.getElementById("canvascontainer");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4000) lit += d[i] + d[i + 1] + d[i + 2] > 30;
    return lit;
}"""


@pytest.fixture
def errors(page):
    """
    collects uncaught page errors
    """
    found = []
    page.on("pageerror", lambda e: found.append(str(e)))
    return found


@pytest.fixture
def sockets(page):
    """
    collects opened WebSocket urls
    """
    found = []
    page.on("websocket", lambda ws: found.append(ws.url))
    return found


def expect_mjpeg(page, status):
    expect(page.locator("#imgcontainer")).to_be_visible(timeout=15000)
    expect(page.locator("#imgcontainer")).to_have_attribute("src", "/video")
    expect(page.locator("#canvascontainer")).to_be_hidden()
    expect(page.locator("#hud-mode")).to_have_text("MJPEG")
    expect(page.locator("#hud-status")).to_have_text(status)
    expect(page.locator("#hud-res")).to_have_text("640×360", timeout=15000)


def test_h264_webcodecs_stream(page, servers, errors, sockets):
    page.goto(servers["h264"])
    expect(page.locator("#canvascontainer")).to_be_visible(timeout=20000)
    expect(page.locator("#imgcontainer")).to_be_hidden()
    expect(page.locator("#hud-status")).to_have_text("live")
    expect(page.locator("#hud-mode")).to_have_text("H.264")
    expect(page.locator("#hud-res")).to_have_text("640×360")
    expect(page.locator("#hud-fps")).to_have_text(re.compile(r"^[1-9]\d* fps$"), timeout=5000)
    expect(page.locator("#hud-rate")).to_have_text(re.compile(r"KB/s$"))
    expect(page.locator("#hud-latency")).to_have_text(re.compile(r"^decode \d+\.\d ms$"))
    assert page.evaluate(LIT_PIXELS) > 0
    assert sockets == [servers["h264"].replace("http", "ws") + "/ws/video"]
    assert not errors


def test_h264_fallback_without_webcodecs(page, servers, errors, sockets):
    # same gate as insecure (plain HTTP, non-localhost) origins
    page.add_init_script("delete window.VideoDecoder")
    page.goto(servers["h264"])
    expect_mjpeg(page, "fallback")
    assert not sockets
    assert not errors


def test_h264_fallback_on_websocket_failure(page, servers, errors):
    # point WebSocket at unknown route, server rejects handshake
    page.add_init_script(
        "const WS = WebSocket; window.WebSocket = function (url) { return new WS(url + '-missing'); };"
    )
    page.goto(servers["h264"])
    expect_mjpeg(page, "fallback")
    assert not errors


def test_mjpeg_mode(page, servers, errors, sockets):
    page.goto(servers["mjpeg"])
    expect_mjpeg(page, "live")
    assert not sockets
    assert not errors


@pytest.mark.parametrize("mode", ["h264", "mjpeg"])
def test_fullscreen_toggle(page, servers, mode):
    page.goto(servers[mode])
    player = page.locator("#player")
    player.click()
    page.wait_for_function("document.fullscreenElement?.id === 'player'")
    player.click()
    page.wait_for_function("document.fullscreenElement === null")


@pytest.mark.parametrize("mode", ["h264", "mjpeg"])
def test_error_page(page, servers, errors, mode):
    response = page.goto(servers[mode] + "/missing")
    assert response.status == 404
    expect(page.locator("h1.glow")).to_have_text("404")
    expect(page.locator("footer .social a")).to_have_count(4)
    assert not errors


def test_static_assets(page, servers):
    for path, kind in [
        ("/static/js/custom.js", "javascript"),
        ("/static/js/videoFrameDecoderWorker.js", "javascript"),
        ("/static/css/custom.css", "css"),
        ("/static/img/favicon-32x32.png", "png"),
    ]:
        response = page.request.get(servers["h264"] + path)
        assert response.ok, path
        assert kind in response.headers["content-type"], path
