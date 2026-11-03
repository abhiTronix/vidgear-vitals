# Vidgear Vitals :rotating_light:

[![Playwright Tests](https://github.com/abhiTronix/vidgear-vitals/actions/workflows/playwright.yml/badge.svg)](https://github.com/abhiTronix/vidgear-vitals/actions/workflows/playwright.yml)

This repository maintains updates for additional vital frontend data-files for [vidgear](https://github.com/abhiTronix/vidgear) APIs. These files are auto-downloaded by WebGear & WebGear_RTC APIs on first run _(or when `overwrite_default_files=True`)_.

&nbsp;

### WebGear default theme

<img src="assets/webgear.jpg" width="60%"/>

* **Description:** Default theme files for [WebGear API](https://abhitronix.github.io/vidgear/latest/gears/webgear/).
* **Features:**
	* :zap: **Low-latency H.264 engine:** Streams H.264 Annex-B access units over WebSocket (`/ws/video`), decoded off main-thread by a WebCodecs `VideoDecoder` inside a Web Worker and painted on `<canvas>`. Codec string (`avc1.PPCCLL`) is derived from the stream's SPS, and decode backlog is auto-dropped to the next keyframe.
	* :leftwards_arrow_with_hook: **Automatic MJPEG fallback:** Falls back to the classic `<img src="/video">` Motion-JPEG feed when WebGear runs with `streaming_mode="mjpeg"` _(default)_, WebCodecs is unavailable _(e.g. insecure context: plain HTTP on non-localhost hosts)_, or the WebSocket stream fails.
	* :bar_chart: **Telemetry HUD:** Live status, codec, resolution, FPS, bandwidth and decode-latency pills.
	* :feather: **Zero external dependencies:** No CDN fonts, icon packs or scripts _(native Fullscreen API, inline SVG icons, system fonts)_. Whole theme is ~25KB.
	* :new_moon: Responsive, modern dark UI with click-to-toggle fullscreen.
* **Compatibility:** H.264 streaming needs vidgear with `streaming_mode="h264"` support. With older vidgear versions, theme automatically uses MJPEG.
* **Author:** [@abhiTronix](https://github.com/abhiTronix)
* **License:** Apache License 2.0
* **Version:** v0.2.0
* **Files MD5 Checksums:**
	```shell
	9e4d3304ac51b29b2f0d5dcb524a46bf  webgear/static/img/favicon-32x32.png
	7454ce064f50895e1b496f00ca72fece  webgear/static/css/custom.css
	e9653be265a171b83a9d7f5a1e80a2d4  webgear/static/js/custom.js
	49a19ae9ee9b564f822642b13b4e409b  webgear/static/js/videoFrameDecoderWorker.js
	55248ac91841c7f21b3094b0c9407ffa  webgear/templates/404.html
	8f548328331a763ff832237fe7f6eb5d  webgear/templates/index.html
	4b938ff58e190715366f5f42f25b9bd3  webgear/templates/500.html
	fc698a6abe14e976dced6129b090c341  webgear/templates/base.html
	```

### WebGear_RTC default theme

<img src="assets/webgear_rtc.png" width="40%"/>

* **Description:** Default theme files for [WebGear_RTC API](https://abhitronix.github.io/vidgear/latest/gears/webgear_rtc/).
* **Author:** [@abhiTronix](https://github.com/abhiTronix)
* **License:** Apache License 2.0
* **Version:** v0.1.2
* **Files MD5 Checksums:**
	```shell
	9e4d3304ac51b29b2f0d5dcb524a46bf  webgear_rtc/static/img/favicon-32x32.png
	68808448ff7e466d8e343b25603a34a9  webgear_rtc/static/css/custom.css
	f22c1b90c7f058ab147ada83097ddcdc  webgear_rtc/static/js/custom.js
	55248ac91841c7f21b3094b0c9407ffa  webgear_rtc/templates/404.html
	5fd87d8e25c2328c60d82ea0c5f83bd2  webgear_rtc/templates/index.html
	4b938ff58e190715366f5f42f25b9bd3  webgear_rtc/templates/500.html
	35072a7c3a68f4f093b5c812cf03c82a  webgear_rtc/templates/base.html
	```

&nbsp;

### Testing

WebGear theme is tested end-to-end in real Chromium with [Playwright](https://playwright.dev/python/) against a live vidgear WebGear server _(Python 3.14)_, covering H.264 streaming, every MJPEG fallback path, fullscreen toggle, error pages and static assets:

```sh
pip install "vidgear[asyncio]" pytest-playwright   # FFmpeg (with libx264) must be on PATH
python -m playwright install --with-deps chromium
pytest tests -v
```

> CI installs vidgear from the `testing` branch by default; pick another ref via the workflow's manual `vidgear_ref` input.

&nbsp;

### Copyright

**Copyright © abhiTronix 2019-2026**

This library is released under the **[Apache 2.0 License](https://github.com/abhiTronix/vidgear-vitals/blob/main/LICENSE)**.
