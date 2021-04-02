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

function toggleFullScreen(id) {
    const element = document.getElementById(id);
    screenfull.toggle(element)
}

// resize img tag for smaller screens[Temporary HACK]
function resize() {
	var img = document.getElementsByTagName('img');
	var w = window.innerWidth / 1.5;
	var h = window.innerHeight;
	for (i = 0; i < img.length; i++) {
		var ratio = (img[i].clientHeight / img[i].clientWidth);
		if (img[i].clientHeight > h && img[i].clientWidth < w) {
			img[i].style.height = h + "px";
			img[i].style.width = (h / ratio) + "px";
		}
		if (img[i].clientHeight <= h && img[i].clientWidth < w && ratio > 1) {
			img[i].style.height = h + "px";
			img[i].style.width = (h / ratio) + "px";
		}
		if (img[i].clientWidth >= w) {
			img[i].style.width = w + "px";
		}
		if (img[i].clientHeight < h && img[i].clientWidth <= w && ratio < 1) {
			img[i].style.width = w + "px";
		}
	}
}
// call resize
resize();
window.onresize = resize;
