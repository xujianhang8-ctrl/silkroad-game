# 丝路百科的实景照片

丝路百科里,站点和名胜古迹的详情页会先显示一张实景照片(点一下看大图),旁边的「🗺️ 地图位置」可以切回地图定位。没有照片的条目仍然只显示地图。

- 照片文件在 `media/places/`,游戏读取的清单是 `js/photos.js`,完整署名在 `media/places/CREDITS.md`。
- 照片都来自维基共享资源(Wikimedia Commons),只用可以自由使用的许可协议(CC0、公有领域、CC BY、CC BY-SA),百科里每张照片下面都有作者和许可协议。
- 游戏完全离线:照片已经存在 `media/places/` 里,上课不需要联网。

## 重新下载或换照片

需要能访问 `commons.wikimedia.org` 和 `upload.wikimedia.org`,并且 `pip install pillow`。

1. **找候选照片**:`python fetch.py search "Mogao Caves" --sheet candidates.jpg`,会列出候选照片的尺寸、许可协议、作者,再拼一张带编号的缩略图总览。也可以用 `python fetch.py leads "Mogao Caves"` 查维基百科条目的首图。
2. **写进清单**:在 `photos.json` 里给条目写上 `slug`(文件名)、`commons`(共享资源上的文件名,比如 `File:Mogao Caves.jpg`)和 `caption`(照片说明);小图取景不理想时,可以加 `focus`(比如 `"50% 30%"`)。
3. **下载**:`python fetch.py build`。照片会缩小到 1280×960 以内、转成 WebP 存进 `media/places/`,并重新生成 `js/photos.js` 和 `CREDITS.md`。只想换某几张:`python fetch.py build --only 敦煌·莫高窟,大雁塔`。

想用自己拍的照片:把文件放进 `media/places/`,在 `photos.json` 里写 `{"file": "我的照片.webp", "caption": "…"}`(可选 `author`、`license`),再运行一次 `build`;或者直接在 `js/photos.js` 里加一行。
