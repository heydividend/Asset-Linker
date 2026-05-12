#!/usr/bin/env python3
"""Extract images from the Prentice Test Bank DOCX and associate each image
with the question or answer it appears next to.

Outputs:
  - artifacts/boc-notebook/public/games/prentice-images/<image>.{jpeg,png}
  - artifacts/api-server/scripts/prentice-images.json

Schema of the JSON output:
  [
    {
      "chapter": 7,
      "qNum": 165,
      "stem": "A patient would wear this brace when they have suffered from what pathology?",
      "kind": "question" | "answer",
      "images": ["image7.jpeg", "image8.jpeg", ...]
    },
    ...
  ]
"""
from __future__ import annotations

import json
import re
import shutil
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

DOCX = Path("attached_assets/Stuvia-5433259-test-bank-for-principles-of-athletic-training-_1778547012124.docx")
OUT_IMG_DIR = Path("artifacts/boc-notebook/public/games/prentice-images")
OUT_JSON = Path("artifacts/api-server/scripts/prentice-images.json")
WATERMARK_IMAGE = "media/image1.png"

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
WM_RX = re.compile(r"^(?:Stuvia\.com - The Marketplace to Buy and Sell your Study Material)+\s*")
NOISE_LINE = re.compile(
    r"(Downloaded by:.*|Distribution of this document is illegal|Want to earn.*|extra per year|Test Bank For|"
    r"Principles of Athletic Training.*|Chapter 1-29.*|Student name:?|^\s*$)"
)


def text_of(p) -> str:
    t = "".join((tt.text or "") for tt in p.findall(".//w:t", NS)).strip()
    t = WM_RX.sub("", t)
    # The PDF/DOCX often duplicates content (each line shows up twice
    # because of how the export merges paragraphs). Collapse N-fold
    # repetition: if the string is exactly "X" + "X", return "X".
    n = len(t)
    if n > 6 and n % 2 == 0 and t[: n // 2] == t[n // 2 :]:
        t = t[: n // 2]
    return t.strip()


def imgs_of(p, rel_map):
    out = []
    for b in p.findall(".//a:blip", NS):
        rid = b.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed")
        f = rel_map.get(rid)
        if f and f != WATERMARK_IMAGE:
            out.append(f)
    return out


def main() -> int:
    if not DOCX.exists():
        print(f"DOCX not found: {DOCX}", file=sys.stderr)
        return 1
    OUT_IMG_DIR.mkdir(parents=True, exist_ok=True)

    z = zipfile.ZipFile(DOCX)
    rels = z.read("word/_rels/document.xml.rels").decode("utf8")
    rel_map = {}
    for m in re.finditer(r'Id="([^"]+)"\s+Type="[^"]*image"\s+Target="([^"]+)"', rels):
        rel_map[m.group(1)] = m.group(2)

    # ---- extract every content image to public/games/prentice-images/ ----
    extracted: set[str] = set()
    for member in z.namelist():
        rel = member.replace("word/", "", 1) if member.startswith("word/") else member
        if rel == WATERMARK_IMAGE:
            continue
        if not member.startswith("word/media/"):
            continue
        name = Path(member).name
        target = OUT_IMG_DIR / name
        with z.open(member) as src, target.open("wb") as dst:
            shutil.copyfileobj(src, dst)
        extracted.add(name)
    print(f"Extracted {len(extracted)} image files → {OUT_IMG_DIR}")

    # ---- walk paragraphs and attribute images to questions/answers ----
    doc = z.read("word/document.xml").decode("utf8")
    root = ET.fromstring(doc)
    body = root.find("w:body", NS)
    paragraphs = body.findall("w:p", NS)

    # Markers may appear anywhere in a paragraph (the DOCX concatenates
    # "Answer Key" + "Test name: chapter N" + "<stem>" into one block).
    Q_RX = re.compile(r"(\d+)\)([A-Z][^0-9)][^\n]*?)(?=\d+\)|$)")  # "165)A patient..."
    QNUM_ONLY_RX = re.compile(r"(?<![0-9])(\d+)\)")  # any "N)" marker
    ANS_LETTER_RX = re.compile(r"(?<![0-9])(\d+)\)\s*(?:[A-H]|\[[A-H,\s]+\])(?=[A-Z\s\d]|$)")
    TEST_NAME_RX = re.compile(r"Test name:\s*chapter\s+(\d+)", re.IGNORECASE)
    ANSWER_KEY_RX = re.compile(r"\bAnswer Key\b", re.IGNORECASE)
    CHAPTER_HEADER_RX = re.compile(r"^Chapter\s+(\d+)\s*$", re.IGNORECASE)

    chapter = 0
    in_answer_key = False
    cur_q_num: int | None = None
    stems: dict[tuple[int, int], str] = {}
    images_by_q: dict[tuple[int, int, str], list[str]] = {}

    for p in paragraphs:
        t = text_of(p)
        if t:
            # 1. Update chapter context from any markers in this paragraph,
            #    in left-to-right order.  "Answer Key"/"Test name: chapter N"
            #    flips us into the answer-key section for that chapter.
            for m in re.finditer(
                r"(Chapter\s+(\d+)\s*$)|(Test name:\s*chapter\s+(\d+))|(Answer Key)",
                t,
                flags=re.IGNORECASE | re.MULTILINE,
            ):
                if m.group(1):
                    n = int(m.group(2))
                    if 1 <= n <= 29:
                        chapter = n
                        in_answer_key = False
                        cur_q_num = None
                elif m.group(3):
                    n = int(m.group(4))
                    if 1 <= n <= 29:
                        chapter = n
                        in_answer_key = True
                        cur_q_num = None
                elif m.group(5):
                    in_answer_key = True
                    cur_q_num = None

            # "Student name:" appears at the start of every chapter's
            # question block, flipping us back out of the previous chapter's
            # answer key.
            if re.search(r"\bStudent name:?", t):
                in_answer_key = False

            # 2. Capture question stems and track the latest question number.
            #    A long capitalized run after "N)" is a question stem; this
            #    also flips us out of any stale answer-key state.
            for m in Q_RX.finditer(t):
                qn = int(m.group(1))
                stem = m.group(2).strip()
                if len(stem) > 8 and not re.fullmatch(r"[A-H](?:\s*,\s*[A-H])*", stem):
                    in_answer_key = False
                    stems.setdefault((chapter, qn), stem[:300])
                    cur_q_num = qn

            # Update cur_q_num to LAST "N)" marker in paragraph regardless
            for m in QNUM_ONLY_RX.finditer(t):
                cur_q_num = int(m.group(1))

        for f in imgs_of(p, rel_map):
            if cur_q_num is None or chapter == 0:
                continue
            kind = "answer" if in_answer_key else "question"
            key = (chapter, cur_q_num, kind)
            images_by_q.setdefault(key, []).append(Path(f).name)

    # ---- assemble output ----
    records = []
    for (chap, qn, kind), images in sorted(images_by_q.items()):
        records.append({
            "chapter": chap,
            "qNum": qn,
            "kind": kind,
            "stem": stems.get((chap, qn), ""),
            "images": images,
        })

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with OUT_JSON.open("w") as fp:
        json.dump(records, fp, indent=2)
    print(f"Wrote {len(records)} image-question records → {OUT_JSON}")

    # quick stats
    q_recs = [r for r in records if r["kind"] == "question" and r["stem"]]
    print(f"  Question-attached images:  {sum(len(r['images']) for r in q_recs)} across {len(q_recs)} questions")
    print(f"  Answer-attached images:    {sum(len(r['images']) for r in records if r['kind']=='answer')}")

    # ---- splice a "prentice-images" matching game into games.json ----
    update_games_json(q_recs)
    return 0


def update_games_json(q_recs: list[dict]) -> None:
    """Add (or replace) the `prentice-images` matching game inside the
    boc-notebook games.json. Each pair = (one image, short stem snippet).

    De-duplicate by image (a single image only appears once; the first
    question that owns it wins). De-duplicate labels too (matching games
    need unique labels — duplicates make the pairing ambiguous).
    """
    games_path = Path("artifacts/boc-notebook/src/data/games.json")
    if not games_path.exists():
        print(f"  games.json not found at {games_path} — skipping game splice")
        return

    GAME_ID = "prentice-images"
    seen_images: set[str] = set()
    seen_labels: set[str] = set()
    pairs: list[dict] = []
    for r in q_recs:
        # short, unique label snippet from stem
        label = re.sub(r"\s+", " ", r["stem"]).strip()
        if "?" in label:
            label = label.split("?", 1)[0] + "?"
        label = label[:90].strip()
        if not label or label in seen_labels:
            continue
        for img in r["images"]:
            if img in seen_images:
                continue
            seen_images.add(img)
            seen_labels.add(label)
            pairs.append({"label": label, "image": f"/games/prentice-images/{img}"})
            break  # one image per question for matching uniqueness

    game = {
        "id": GAME_ID,
        "title": "Prentice Equipment & Procedures",
        "description": "Match each Prentice 18e test-bank figure to the question it illustrates.",
        "pairs": pairs,
    }

    with games_path.open("r") as fp:
        data = json.load(fp)
    games = data.get("games", [])
    games = [g for g in games if g.get("id") != GAME_ID]
    games.append(game)
    data["games"] = games
    with games_path.open("w") as fp:
        json.dump(data, fp, indent=2)
    print(f"  Spliced game '{GAME_ID}' into {games_path} ({len(pairs)} pairs)")


if __name__ == "__main__":
    raise SystemExit(main())
