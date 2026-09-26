"""丝路百科的实景照片:从维基共享资源(Wikimedia Commons)下载、缩小,并生成署名。

用法(需要能访问 commons.wikimedia.org 和 upload.wikimedia.org;pip install pillow):

  python fetch.py search "Mogao Caves" [--limit 12] [--sheet candidates.jpg]
      按关键词找候选照片:列出标题、尺寸、许可协议、作者,并拼一张带编号的缩略图总览,方便挑选。
      只有自由许可(CC0 / 公有领域 / CC BY / CC BY-SA)的照片才能用,其余会标出来。

  python fetch.py leads "Mogao Caves" "Giant Wild Goose Pagoda" [--lang en]
      查维基百科条目的首图(通常是最有代表性的一张)在共享资源上的文件名和许可协议。

  python fetch.py build [--only 敦煌·莫高窟,大雁塔] [--force]
      按 photos.json 下载选好的照片,缩小到 1280×960 以内、转成 WebP,存进 media/places/,
      再生成 js/photos.js(游戏读取)和 media/places/CREDITS.md(完整署名)。

photos.json 的每一项:条目名(站点名或名胜古迹名) → {
  "slug": 文件名(不带扩展名), "commons": "File:....jpg", "caption": 照片说明,
  "focus": 可选,百科小图里的取景位置(CSS object-position,比如 "50% 30%")
}
也可以放自己的照片:把文件放进 media/places/,写 {"file": "xxx.webp", "caption": "...", "author": "...", "license": "..."}。
"""
import argparse
import html
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = 'https://commons.wikimedia.org/w/api.php'
UA = 'SilkRoadFadengClassroomGame/1.0 (educational offline game; place-photos fetch script)'
MAX_BOX = (1280, 960)
QUALITY = 72
FREE = re.compile(r'^(cc0|public domain|pd\b|pd-|cc[ -]by(-sa)?[ -]\d)', re.I)
NOT_FREE = re.compile(r'\b(nc|nd)\b', re.I)
HERE = Path(__file__).resolve().parent


def http_get(url, params=None):
    if params:
        url = url + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or attempt == 3:
                raise
        except urllib.error.URLError:
            if attempt == 3:
                raise
        time.sleep(2 ** (attempt + 1))


def api(params, url=API):
    base = {'format': 'json', 'formatversion': '2'}
    return json.loads(http_get(url, {**base, **params}))


def plain(value, limit=90):
    """extmetadata 里的值是 HTML:去掉标签,只留文字"""
    text = html.unescape(re.sub(r'<[^>]+>', ' ', value or ''))
    text = re.sub(r'\s+', ' ', text).strip()
    return text if len(text) <= limit else text[:limit - 1] + '…'


def meta(info):
    ext = info.get('extmetadata') or {}
    get = lambda k: (ext.get(k) or {}).get('value', '')
    author = plain(get('Artist')) or plain(get('Credit'))
    author = re.sub(r'\s*\((talk|discussion|contribs?|讨论|贡献)[^)]*\)', '', author, flags=re.I).strip()
    return {
        'license': plain(get('LicenseShortName'), 40),
        'licenseUrl': plain(get('LicenseUrl'), 200),
        'author': author,
    }


def is_free(license_name):
    return bool(FREE.search(license_name or '')) and not NOT_FREE.search(license_name or '')


def imageinfo_params(width):
    return {
        'prop': 'imageinfo',
        'iiprop': 'url|size|mime|extmetadata',
        'iiurlwidth': str(width),
        'iiextmetadatafilter': 'LicenseShortName|LicenseUrl|Artist|Credit|AttributionRequired',
    }


# ---------------- search:找候选照片 ----------------
def cmd_search(args):
    data = api({
        'generator': 'search', 'gsrsearch': args.query + ' filetype:bitmap', 'gsrnamespace': '6',
        'gsrlimit': str(args.limit), **imageinfo_params(360),
    })
    pages = sorted((data.get('query') or {}).get('pages', []), key=lambda p: p.get('index', 0))
    rows = []
    for i, page in enumerate(pages, 1):
        info = (page.get('imageinfo') or [{}])[0]
        m = meta(info)
        rows.append((i, page['title'], info, m))
        flag = '' if is_free(m['license']) else '  ✗ 许可不可用'
        print(f"{i:2d}. {page['title']}\n    {info.get('width')}×{info.get('height')} · {m['license'] or '?'} · {m['author'][:50]}{flag}")
    if args.sheet and rows:
        contact_sheet(rows, args.sheet)
        print('缩略图总览:', args.sheet)


def contact_sheet(rows, out):
    from PIL import Image, ImageDraw
    cell_w, cell_h, cols = 360, 290, 4
    sheet = Image.new('RGB', (cell_w * cols, cell_h * ((len(rows) + cols - 1) // cols)), (40, 36, 60))
    draw = ImageDraw.Draw(sheet)
    for n, (i, title, info, m) in enumerate(rows):
        x, y = (n % cols) * cell_w, (n // cols) * cell_h
        try:
            im = Image.open(io.BytesIO(http_get(info['thumburl']))).convert('RGB')
            im.thumbnail((cell_w - 10, cell_h - 40))
            sheet.paste(im, (x + 5, y + 5))
        except Exception as e:  # noqa: BLE001 — 一张失败不影响其他
            draw.text((x + 10, y + 100), 'load failed: ' + str(e)[:40], fill=(255, 120, 120))
        label = f"{i}. {m['license'] or '?'} {info.get('width')}x{info.get('height')}"
        if not is_free(m['license']):
            label += ' NOT FREE'
        draw.text((x + 6, y + cell_h - 30), label.encode('ascii', 'replace').decode(), fill=(255, 230, 150))
        draw.text((x + 6, y + cell_h - 16), title[5:60].encode('ascii', 'replace').decode(), fill=(220, 220, 220))
    sheet.save(out, quality=85)


# ---------------- leads:维基百科条目的首图 ----------------
def cmd_leads(args):
    wiki = f'https://{args.lang}.wikipedia.org/w/api.php'
    data = api({'prop': 'pageimages', 'piprop': 'original|name', 'titles': '|'.join(args.titles), 'redirects': '1'}, url=wiki)
    names = {}
    for page in (data.get('query') or {}).get('pages', []):
        if page.get('pageimage'):
            names[page['title']] = 'File:' + page['pageimage']
        else:
            print(f"{page.get('title')}: 没有首图")
    if not names:
        return
    info = commons_info(list(names.values()), 360)
    for article, fname in names.items():
        i = info.get(fname.replace('_', ' '))
        if not i:
            print(f'{article}: {fname}(不在共享资源上,多半不能用)')
            continue
        m = meta(i)
        flag = '' if is_free(m['license']) else '  ✗ 许可不可用'
        print(f"{article}: {fname}\n    {i.get('width')}×{i.get('height')} · {m['license']} · {m['author'][:50]}{flag}")


def commons_info(titles, width):
    """共享资源上的文件信息,按标题返回(每次最多 50 个)"""
    out = {}
    for k in range(0, len(titles), 50):
        data = api({'titles': '|'.join(titles[k:k + 50]), **imageinfo_params(width)})
        q = data.get('query') or {}
        norm = {n['from']: n['to'] for n in q.get('normalized', [])}
        for page in q.get('pages', []):
            if page.get('missing') or not page.get('imageinfo'):
                continue
            out[page['title']] = page['imageinfo'][0]
        for src, dst in norm.items():
            if dst in out:
                out[src] = out[dst]
    return out


# ---------------- build:下载选好的照片,生成 js/photos.js 与 CREDITS.md ----------------
def cmd_build(args):
    root = Path(args.root).resolve() if args.root else HERE.parents[1]
    spec = json.loads((HERE / 'photos.json').read_text(encoding='utf-8'))
    only = set(filter(None, (args.only or '').split(',')))
    places_dir = root / 'media' / 'places'
    places_dir.mkdir(parents=True, exist_ok=True)

    titles = [s['commons'] for s in spec.values() if s.get('commons')]
    info = commons_info(titles, 1600) if titles else {}
    problems = []
    photos = {}
    for place, s in spec.items():
        if s.get('commons'):
            i = info.get(s['commons']) or info.get(s['commons'].replace('_', ' '))
            if not i:
                problems.append(f'{place}: 共享资源上找不到 {s["commons"]}')
                continue
            m = meta(i)
            if not is_free(m['license']):
                problems.append(f'{place}: {s["commons"]} 的许可协议是 {m["license"] or "未知"},不能用')
                continue
            fname = s['slug'] + '.webp'
            target = places_dir / fname
            # --only:只(重新)下载列出的几张;否则下载还没有的,--force 全部重新下载
            if (place in only) if only else (args.force or not target.exists()):
                save_webp(http_get(i.get('thumburl') or i['url']), target)
                print(f'✓ {place} → media/places/{fname} ({target.stat().st_size // 1024} KB)')
                time.sleep(0.3)
            if not target.exists():
                problems.append(f'{place}: 还没有下载 media/places/{fname}')
                continue
            photos[place] = {
                'file': fname,
                'caption': s.get('caption', ''),
                'author': m['author'],
                'license': '公有领域' if re.match(r'(public domain|pd\b|pd-)', m['license'], re.I) else m['license'],
                'licenseUrl': m['licenseUrl'],
                'source': i.get('descriptionurl', ''),
            }
        elif s.get('file'):
            if not (places_dir / s['file']).exists():
                problems.append(f'{place}: media/places/{s["file"]} 不存在')
                continue
            photos[place] = {k: s[k] for k in ('file', 'caption', 'author', 'license', 'licenseUrl', 'source') if s.get(k)}
        if place in photos and s.get('focus'):
            photos[place]['focus'] = s['focus']

    write_photos_js(root / 'js' / 'photos.js', photos)
    write_credits(places_dir / 'CREDITS.md', photos)
    print(f'共 {len(photos)} 张照片 → js/photos.js、media/places/CREDITS.md')
    if problems:
        print('\n需要处理:\n  ' + '\n  '.join(problems))
        sys.exit(1)


def save_webp(data, target):
    from PIL import Image, ImageOps
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert('RGB')
    im.thumbnail(MAX_BOX, Image.LANCZOS)
    im.save(target, 'WEBP', quality=QUALITY, method=6)


def js_str(v):
    return "'" + str(v).replace('\\', '\\\\').replace("'", "\\'").replace('\n', ' ') + "'"


PHOTOS_JS_HEAD = """/* 丝路法灯 · 丝路百科里的实景照片
 * 键是百科里的条目名(站点名,或名胜古迹的名字);照片文件放在 media/places/ 里。
 *   caption:照片上是什么;author / license / licenseUrl:作者与许可协议(署名用);source:原图页面;
 *   focus:可选,百科小图的取景位置(CSS object-position)。
 * 现有照片都来自维基共享资源(Wikimedia Commons),可以自由使用,署名见 media/places/CREDITS.md。
 * 这个文件由 tools/place-photos/fetch.py 生成;老师也可以手动加自己的照片(只填 file 和 caption 就行)。
 * 没有照片的条目,百科里仍显示"地图上的位置"。
 */
var DR = window.DR || (window.DR = {});

DR.PLACE_PHOTOS = {
"""


def write_photos_js(path, photos):
    lines = []
    for place, p in photos.items():
        fields = ', '.join(f'{k}: {js_str(v)}' for k, v in p.items() if v)
        lines.append(f'  {js_str(place)}: {{ {fields} }},')
    path.write_text(PHOTOS_JS_HEAD + '\n'.join(lines) + ('\n' if lines else '') + '};\n', encoding='utf-8')


def write_credits(path, photos):
    out = ['# 丝路百科实景照片 · 署名', '',
           '这些照片来自维基共享资源(Wikimedia Commons),按各自的许可协议使用。'
           '为了离线使用,照片都缩小了尺寸并转成了 WebP 格式,内容没有其他改动。', '',
           '| 条目 | 文件 | 照片说明 | 作者 | 许可协议 | 原图 |', '|---|---|---|---|---|---|']
    cell = lambda v: str(v or '').replace('|', '\\|')
    for place, p in photos.items():
        lic = f"[{cell(p.get('license'))}]({p['licenseUrl']})" if p.get('licenseUrl') else cell(p.get('license'))
        src = f"[链接]({p['source']})" if p.get('source') else ''
        out.append(f"| {cell(place)} | {cell(p['file'])} | {cell(p.get('caption'))} | {cell(p.get('author'))} | {lic} | {src} |")
    path.write_text('\n'.join(out) + '\n', encoding='utf-8')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('search')
    s.add_argument('query')
    s.add_argument('--limit', type=int, default=12)
    s.add_argument('--sheet')
    s.set_defaults(fn=cmd_search)
    l = sub.add_parser('leads')
    l.add_argument('titles', nargs='+')
    l.add_argument('--lang', default='en')
    l.set_defaults(fn=cmd_leads)
    b = sub.add_parser('build')
    b.add_argument('--only')
    b.add_argument('--force', action='store_true')
    b.add_argument('--root', help=argparse.SUPPRESS)
    b.set_defaults(fn=cmd_build)
    args = ap.parse_args()
    args.fn(args)


if __name__ == '__main__':
    main()
