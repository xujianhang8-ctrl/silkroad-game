"""把录好的画面帧(frames/)和配音(*.wav)合成讲解视频:../../media/rules-video.mp4 与 .webm
需要:numpy、scipy、imageio-ffmpeg(自带 ffmpeg)。"""
import json, subprocess, numpy as np
from scipy.io import wavfile
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
d = json.load(open('frames.json'))
t0, tEnd = d['t0'], d['tEnd']
SR = 24000

# 1) 配音:每段放在对应场景开始后 0.25 秒(字幕先出现,声音随后)
track = np.zeros(int((tEnd - t0) * SR) + SR, np.float32)
for m in d['marks']:
    _, a = wavfile.read(m['id'] + '.wav')
    off = int((m['t'] + 0.25) * SR)
    track[off:off + len(a)] += a.astype(np.float32) / 32767
wavfile.write('narration.wav', SR, (np.clip(track, -1, 1) * 32767).astype(np.int16))

# 2) 画面:按截屏时间戳给每一帧设定时长
fr = d['frames']
before = [i for i, f in enumerate(fr) if f['t'] <= t0]
fr = fr[before[-1] if before else 0:]
lines = ['ffconcat version 1.0']
for i, f in enumerate(fr):
    nxt = fr[i + 1]['t'] if i + 1 < len(fr) else tEnd
    lines += [f"file '{f['file']}'", f"duration {max(0.001, nxt - max(f['t'], t0)):.4f}"]
lines.append(f"file '{fr[-1]['file']}'")
open('frames.ffconcat', 'w').write('\n'.join(lines) + '\n')

# 3) 编码:MP4(H.264/AAC,方便分享)+ WebM(VP9/Opus,任何浏览器都能放)
mp4, webm = '../../media/rules-video.mp4', '../../media/rules-video.webm'
subprocess.run([FF, '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'frames.ffconcat', '-i', 'narration.wav',
                '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '28',
                '-tune', 'animation', '-af', 'afade=t=in:d=0.3,loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000',
                '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', mp4], check=True)
subprocess.run([FF, '-loglevel', 'error', '-y', '-i', mp4, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1',
                '-deadline', 'good', '-cpu-used', '4', '-c:a', 'libopus', '-b:a', '64k', webm], check=True)
print('done:', mp4, webm)
