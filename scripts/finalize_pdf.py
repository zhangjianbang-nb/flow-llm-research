#!/usr/bin/env python3
"""Add page numbers, PDF metadata and a chapter outline to report.pdf."""
import re
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "report.pdf"
FONT = "/System/Library/Fonts/Supplemental/Songti.ttc"

TITLE = "从 DiffusionGemma 到 FlowGemma：基于 MoE Transformer 的少步并行语言生成"
AUTHOR = "张建邦"
SUBJECT = "Flow Matching、MoE 与块并行语言生成：证据、玩具实验、架构提案与实验方案"
KEYWORDS = "Flow Matching, Diffusion LLM, FlowGemma, DiffusionGemma, MoE, KV Cache, 并行解码, 流映射"

doc = fitz.open(PDF)
n = doc.page_count

# --- footer page numbers (skip the cover) -----------------------------------
for i in range(1, n):
    page = doc[i]
    text = f"第 {i + 1} 页 / 共 {n} 页"
    w = fitz.get_text_length(text, fontname="china-s", fontsize=8.5)
    x = (page.rect.width - w) / 2
    page.insert_text(
        (x, page.rect.height - 22),
        text,
        fontsize=8.5,
        fontname="song",
        fontfile=FONT,
        color=(0.42, 0.42, 0.42),
    )

# --- chapter outline --------------------------------------------------------
headings = []
for md in sorted((ROOT / "report").glob("*.md")):
    for line in md.read_text().splitlines():
        m = re.match(r"^(##|###) (.+)$", line)
        if m:
            level = 1 if m.group(1) == "##" else 2
            text = m.group(2).replace("[[BR]]", "").replace("[[BRM]]", "").strip()
            headings.append((level, text))

toc = []
last_page = 0
for level, h in headings:
    base = re.sub(r"^第.+?章\s*", "", h)
    found = None
    for cut in (10, 6, 4):
        probe = base[:cut]
        for pno in range(last_page, n):
            if doc[pno].search_for(probe):
                found = pno
                break
        if found is not None:
            break
    if found is not None:
        toc.append([level, h, found + 1])
        last_page = found
if toc:
    doc.set_toc(toc)

# --- metadata ---------------------------------------------------------------
doc.set_metadata(
    {
        "title": TITLE,
        "author": AUTHOR,
        "subject": SUBJECT,
        "keywords": KEYWORDS,
        "creator": "ZCode editorial build (Markdown -> HTML -> Chrome printToPDF)",
        "producer": "PyMuPDF",
    }
)

tmp = PDF.with_suffix(".tmp.pdf")
doc.save(tmp, garbage=4, deflate=True)
doc.close()
tmp.replace(PDF)
print(f"finalized {PDF.name}: {n} pages, {PDF.stat().st_size} bytes, {len(toc)} bookmarks")
for item in toc:
    print(f"  p{item[2]:>3}  {item[1]}")
