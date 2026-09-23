# 讲解视频制作脚本

`media/rules-video.mp4` / `.webm` 是用下面的脚本自动生成的:AI 语音(离线中文 TTS)+ 在真实游戏里自动演示并录屏。改了规则想重新生成时:

1. **写旁白**:编辑 `script.json`(`text` 是配音稿,`cap` 是屏幕字幕;数字请写成汉字,读音更准)。
2. **生成配音**:`pip install zhtts "tensorflow-cpu==2.15.1"`,然后 `python synth.py` → 每段一个 `*.wav` 和 `durations.json`。
   (zhtts 自带 FastSpeech2 + MB-MelGAN 中文模型,完全离线;`synth.py` 里把"般若"的读音校正为 bō rě。)
3. **录制画面**:`npm i playwright`,然后 `node record.js`。脚本会打开游戏、按旁白时长逐场景演示(字幕、高亮框、鼠标点击),截下画面帧到 `frames/`。
4. **合成视频**:`pip install imageio-ffmpeg scipy`,然后 `python build.py` → 输出到 `media/`。

`frames/`、`*.wav` 等中间文件不需要提交。
