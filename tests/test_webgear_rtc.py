"""
Playwright tests for WebGear_RTC default theme: WebRTC stream, performance overlay, reconnects, fullscreen & error pages.
"""

import json
import re

import pytest
from playwright.sync_api import expect

# counts non-black samples of current video frame, proves decoded frames were painted
LIT_PIXELS = """() => {
    const v = document.getElementById("video");
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(v, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4000) lit += d[i] + d[i + 1] + d[i + 2] > 30;
    return lit;
}"""


@pytest.fixture
def errors(page):
    """
    collects uncaught page errors & alert dialogs
    """
    found = []
    page.on("pageerror", lambda e: found.append(str(e)))
    page.on("dialog", lambda d: (found.append("dialog: " + d.message), d.dismiss()))
    return found


@pytest.fixture
def requests(page):
    """
    collects requested urls
    """
    found = []
    page.on("request", lambda r: found.append(r.url))
    return found


def expect_live(page):
    expect(page.locator("#hud-status")).to_have_text("live", timeout=30000)
    expect(page.locator("#hud-fps")).to_have_text(re.compile(r"^[1-9]\d* fps$"), timeout=10000)


def test_rtc_stream(page, rtc_servers, errors, requests):
    page.goto(rtc_servers["default"])
    expect_live(page)
    expect(page.locator("#hud-status")).to_have_attribute("data-state", "live")
    expect(page.locator("#hud-codec")).to_have_text(re.compile(r"^(VP8|H264)$"))
    expect(page.locator("#hud-res")).to_have_text("640×360")
    expect(page.locator("#hud-rate")).to_have_text(re.compile(r"\d (kbps|Mbps)$"))
    expect(page.locator("#hud-rtt")).to_have_text(re.compile(r"^rtt \d+ ms$"))
    expect(page.locator("#hud-buffer")).to_have_text(re.compile(r"^buffer \d+ ms$"))
    expect(page.locator("#hud-loss")).to_have_text(re.compile(r"^loss \d+\.\d%$"))
    assert page.evaluate("document.getElementById('video').videoWidth") == 640
    assert page.evaluate(LIT_PIXELS) > 0
    # zero external dependencies
    assert requests and all(url.startswith(rtc_servers["default"]) for url in requests), requests
    assert not errors


@pytest.mark.parametrize("kind", ["default", "live"])
def test_two_pages_stream(context, rtc_servers, kind):
    # every viewer gets the full stream, with or without live broadcast
    pages = [context.new_page() for _ in range(2)]
    for page in pages:
        page.goto(rtc_servers[kind])
    for page in pages:
        expect_live(page)


@pytest.mark.parametrize("status, state", [(500, "reconnecting"), (503, "ended")])
def test_offer_failure(page, rtc_servers, errors, status, state):
    page.route("**/offer", lambda route: route.fulfill(status=status, json={"error": "test"}))
    page.goto(rtc_servers["default"])
    expect(page.locator("#hud-status")).to_have_text(state, timeout=15000)
    expect(page.locator("#hud-status")).to_have_attribute("data-state", state)
    assert not errors


def test_ice_servers_from_page(page, rtc_servers, errors):
    # theme reads ICE servers from `data-ice-servers`, which server fills from `ice_servers`
    assert page.goto(rtc_servers["default"]).ok
    assert json.loads(page.locator("#player").get_attribute("data-ice-servers")) == []
    expect_live(page)
    assert not errors


def test_reload_frees_peer(page, rtc_servers):
    with page.expect_response("**/offer") as offer:
        page.goto(rtc_servers["default"])
    peer = offer.value.json()["id"]
    expect_live(page)
    page.reload()
    expect_live(page)
    # old peer was closed on server by page's beacon (`OK` would mean it's still open)
    response = page.request.post(rtc_servers["default"] + "/close_connection", data={"id": peer})
    assert response.text() == "DISABLED"


def test_reconnect_after_server_drop(page, rtc_servers, errors):
    with page.expect_response("**/offer") as offer:
        page.goto(rtc_servers["default"])
    expect_live(page)
    # server drops this peer, page notices stalled stream and reconnects with a new peer
    response = page.request.post(rtc_servers["default"] + "/close_connection", data={"id": offer.value.json()["id"]})
    assert response.text() == "OK"
    with page.expect_response("**/offer", timeout=30000) as again:
        expect(page.locator("#hud-status")).not_to_have_text("live", timeout=15000)
    assert again.value.ok
    expect_live(page)
    assert not errors


def test_fullscreen_toggle(page, rtc_servers):
    page.goto(rtc_servers["default"])
    player = page.locator("#player")
    player.click()
    page.wait_for_function("document.fullscreenElement?.id === 'player'")
    player.click()
    page.wait_for_function("document.fullscreenElement === null")


def test_error_page(page, rtc_servers, errors):
    response = page.goto(rtc_servers["default"] + "/missing")
    assert response.status == 404
    expect(page.locator("h1.glow")).to_have_text("404")
    expect(page.locator("footer .social a")).to_have_count(4)
    assert not errors


def test_static_assets(page, rtc_servers):
    for path, kind in [
        ("/static/js/custom.js", "javascript"),
        ("/static/css/custom.css", "css"),
        ("/static/img/favicon-32x32.png", "png"),
    ]:
        response = page.request.get(rtc_servers["default"] + path)
        assert response.ok, path
        assert kind in response.headers["content-type"], path
