import json, re, numpy as np, os
from pypinyin import load_phrases_dict
load_phrases_dict({'般若': [['bō'], ['rě']]})
from zhtts import TTS
from scipy.io import wavfile
t = TTS()
SR = 24000
SPEED = 0.88  # <1 = faster (duration ratio)
def fs2(text):
    ids = t.processor.text_to_sequence(text, inference=True)
    a = t.acoustic; d = a.get_input_details(); o = a.get_output_details()
    a.resize_tensor_input(d[0]['index'], [1, len(ids)]); a.allocate_tensors()
    inp = (np.array([ids], np.int32), np.array([0], np.int32), np.array([SPEED], np.float32), np.array([1.0], np.float32), np.array([1.0], np.float32))
    for i, det in enumerate(d): a.set_tensor(det['index'], inp[i])
    a.invoke()
    return t.mel2audio(a.get_tensor(o[1]['index']))
def synth(text):
    parts = [p for p in re.split(r'(?<=[、,,。!?!?:;])', text) if p.strip()]
    out = []
    for p in parts:
        core = re.sub(r'[、,,。!?!?:;]', '', p)
        if not core: continue
        out.append(fs2(core))
        end = p[-1]
        out.append(np.zeros(int(SR * (0.34 if end in '。!?!?' else 0.16)), np.float32))
    return np.concatenate(out)
scenes = json.load(open('script.json'))
meta = []
for s in scenes:
    audio = synth(s['text'])
    audio = audio / max(1e-6, np.abs(audio).max()) * 0.89
    wavfile.write(f"{s['id']}.wav", SR, (audio * 32767).astype(np.int16))
    meta.append({'id': s['id'], 'dur': round(len(audio) / SR, 3)})
    print(s['id'], meta[-1]['dur'], round(len(s['text']) / meta[-1]['dur'], 2), 'char/s')
json.dump(meta, open('durations.json', 'w'))
print('total', round(sum(m['dur'] for m in meta), 1))
