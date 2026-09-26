/* 丝路法灯 · 丝路百科里的实景照片
 * 键是百科里的条目名(站点名,或名胜古迹的名字);照片文件放在 media/places/ 里。
 *   caption:照片上是什么;author / license / licenseUrl:作者与许可协议(署名用);source:原图页面。
 * 现有照片都来自维基共享资源(Wikimedia Commons),可以自由使用,署名见 media/places/CREDITS.md。
 * 这个文件由 tools/place-photos/fetch.py 生成;老师也可以手动加自己的照片(只填 file 和 caption 就行)。
 * 没有照片的条目,百科里仍显示"地图上的位置"。
 */
var DR = window.DR || (window.DR = {});

DR.PLACE_PHOTOS = {
};
