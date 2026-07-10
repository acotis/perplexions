#!/usr/bin/env python3
"""Build src/assets/perplexions-emoji.woff2 from Twemoji artwork.

The two head-shake emoji (🙂‍↔️ / 🙂‍↕️) are ZWJ sequences from Emoji 15.1;
system emoji fonts older than that render them as their component emoji.
Shipping our own font containing every emoji in WORD_EMOJIS fixes that on
any browser that supports COLRv0 color fonts (Chrome 71+, Firefox 32+,
Safari 11+ except 17.0–17.1, Edge).

Pipeline: parse WORD_EMOJIS out of src/main.ts → download the matching
Twemoji SVGs (pinned tag) → nanoemoji builds a COLRv0 TTF → HarfBuzz-shape
every emoji to prove each one resolves to a single real glyph → compress
to woff2. Run via scripts/build-emoji-font.sh (sets up the venv).
Rerun whenever WORD_EMOJIS changes; the woff2 output is committed.
"""

import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

TWEMOJI_TAG = 'v17.0.3'
TWEMOJI_SVG_URL = f'https://raw.githubusercontent.com/jdecked/twemoji/{TWEMOJI_TAG}/assets/svg'
FAMILY = 'Perplexions Emoji'

ROOT = Path(__file__).resolve().parent.parent
MAIN_TS = ROOT / 'src' / 'main.ts'
BUILD_DIR = ROOT / 'scripts' / 'emoji-font-build'
SVG_CACHE = BUILD_DIR / f'twemoji-{TWEMOJI_TAG}'
NANOEMOJI_IN = BUILD_DIR / 'svg-in'
TTF_OUT = BUILD_DIR / 'PerplexionsEmoji.ttf'
WOFF2_OUT = ROOT / 'src' / 'assets' / 'perplexions-emoji.woff2'


def word_emojis() -> list[str]:
    src = MAIN_TS.read_text(encoding='utf-8')
    m = re.search(r'const WORD_EMOJIS = \[(.*?)\];', src, re.DOTALL)
    if not m:
        sys.exit('could not find WORD_EMOJIS in src/main.ts')
    emojis = re.findall(r"'([^']+)'", m.group(1))
    if len(emojis) < 100:
        sys.exit(f'only found {len(emojis)} emojis; parse is probably broken')
    return emojis


def twemoji_name(emoji: str) -> str:
    # Twemoji filenames drop U+FE0F unless the sequence contains a ZWJ.
    cps = [ord(c) for c in emoji]
    if 0x200D not in cps:
        cps = [c for c in cps if c != 0xFE0F]
    return '-'.join(f'{c:x}' for c in cps)


def nanoemoji_name(emoji: str) -> str:
    # nanoemoji derives cmap entries and ZWJ ligatures from Noto-style
    # filenames, which drop U+FE0F entirely.
    cps = [ord(c) for c in emoji if ord(c) != 0xFE0F]
    return 'emoji_u' + '_'.join(f'{c:04x}' for c in cps) + '.svg'


def download_svgs(emojis: list[str]) -> None:
    SVG_CACHE.mkdir(parents=True, exist_ok=True)
    for emoji in emojis:
        dest = SVG_CACHE / f'{twemoji_name(emoji)}.svg'
        if dest.exists():
            continue
        url = f'{TWEMOJI_SVG_URL}/{dest.name}'
        print(f'fetching {dest.name}')
        try:
            urllib.request.urlretrieve(url, dest)
        except Exception as e:
            sys.exit(f'{emoji}: failed to fetch {url}: {e}')


def stage_inputs(emojis: list[str]) -> list[Path]:
    if NANOEMOJI_IN.exists():
        for old in NANOEMOJI_IN.iterdir():
            old.unlink()
    NANOEMOJI_IN.mkdir(parents=True, exist_ok=True)
    staged = []
    for emoji in emojis:
        dest = NANOEMOJI_IN / nanoemoji_name(emoji)
        dest.write_bytes((SVG_CACHE / f'{twemoji_name(emoji)}.svg').read_bytes())
        staged.append(dest)
    return staged


def build_ttf(inputs: list[Path]) -> None:
    subprocess.run(
        [
            # nanoemoji lives in the same venv as this interpreter.
            str(Path(sys.executable).parent / 'nanoemoji'),
            '--color_format', 'glyf_colr_0',
            '--family', FAMILY,
            '--build_dir', str(BUILD_DIR / 'nanoemoji-work'),
            '--output_file', str(TTF_OUT),
            *[str(p) for p in inputs],
        ],
        check=True,
        # nanoemoji shells out to ninja, which also lives in the venv.
        env={**os.environ, 'PATH': f'{Path(sys.executable).parent}:{os.environ["PATH"]}'},
    )


def verify(emojis: list[str]) -> None:
    """Shape every emoji with HarfBuzz; each must yield one visible glyph.

    An unsupported ZWJ sequence would shape to multiple visible glyphs and a
    missing emoji to .notdef (glyph 0), so this catches both. U+FE0F maps to
    a zero-width blank glyph, which is fine and ignored here.
    """
    import uharfbuzz as hb

    face = hb.Face(TTF_OUT.read_bytes())
    font = hb.Font(face)
    failures = []
    for emoji in emojis:
        buf = hb.Buffer()
        buf.add_str(emoji)
        buf.guess_segment_properties()
        hb.shape(font, buf)
        gids = [info.codepoint for info in buf.glyph_infos]
        advances = [pos.x_advance for pos in buf.glyph_positions]
        visible = [g for g, adv in zip(gids, advances) if adv > 0]
        if len(visible) != 1 or 0 in gids:
            failures.append(f'{emoji} -> glyph ids {gids} advances {advances}')
    if failures:
        sys.exit('font verification failed:\n' + '\n'.join(failures))
    print(f'verified: all {len(emojis)} emojis shape to a single visible glyph')


def write_woff2() -> None:
    from fontTools.ttLib import TTFont

    WOFF2_OUT.parent.mkdir(parents=True, exist_ok=True)
    font = TTFont(TTF_OUT)
    font.flavor = 'woff2'
    font.save(WOFF2_OUT)
    print(f'wrote {WOFF2_OUT.relative_to(ROOT)} ({WOFF2_OUT.stat().st_size:,} bytes)')


def main() -> None:
    emojis = word_emojis()
    print(f'{len(emojis)} emojis in WORD_EMOJIS')
    download_svgs(emojis)
    build_ttf(stage_inputs(emojis))
    verify(emojis)
    write_woff2()


if __name__ == '__main__':
    main()
