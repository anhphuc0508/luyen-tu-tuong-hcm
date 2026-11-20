"""Extract the supplied PDF; answer keys come exclusively from red PDF text.

Run from the workspace: python -X utf8 luyen-tu-tuong-hcm/scripts/extract_pdf.py
Dependency: PyMuPDF (can be installed in the workspace's .tools directory).
"""
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".tools"))
import pymupdf

SOURCE = ROOT / "Scribd.pdf"
OUT = ROOT / "luyen-tu-tuong-hcm" / "dist"
AUDIT = ROOT / "extraction"
OUT.mkdir(exist_ok=True)
AUDIT.mkdir(exist_ok=True)


def clean(text):
    return re.sub(r"\s+", " ", text).strip()


def red(color):
    r, g, b = (color >> 16) & 255, (color >> 8) & 255, color & 255
    return r >= 160 and r > g * 1.5 and r > b * 1.5


doc = pymupdf.open(SOURCE)
questions, lines, ignored, issues = [], [], [], []
current = option = None
for page in doc:
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            spans = line["spans"]
            text = clean("".join(s["text"] for s in spans))
            red_chars = sum(len(s["text"].strip()) for s in spans if red(s["color"]))
            row = {"page": page.number + 1, "text": text, "redChars": red_chars,
                   "bbox": [round(v, 2) for v in line["bbox"]]}
            lines.append(row)
            if not text or (text.isdigit() and line["bbox"][1] > page.rect.height * .9) or text.startswith("TÀI LIỆU ÔN THI"):
                ignored.append(row)
                continue
            qm = re.match(r"^(\d+)[.)]\s*(.*)$", text)
            om = re.match(r"^([A-Ha-h])[.)]\s*(.*)$", text)
            if qm:
                current = {"id": int(qm[1]), "question": qm[2], "options": [],
                           "correctAnswers": [], "sourcePages": [page.number + 1]}
                questions.append(current)
                option = None
            elif om and current:
                option = {"id": om[1].upper(), "text": om[2], "_redChars": red_chars}
                current["options"].append(option)
            elif current:
                if option:
                    option["text"] = clean(option["text"] + " " + text)
                    option["_redChars"] += red_chars
                else:
                    current["question"] = clean(current["question"] + " " + text)
            else:
                issues.append({"type": "unassigned_line", **row})
            if current and page.number + 1 not in current["sourcePages"]:
                current["sourcePages"].append(page.number + 1)

for q in questions:
    q["correctAnswers"] = [o["id"] for o in q["options"] if o["_redChars"]]
    q["answerEvidence"] = {"method": "red_text", "color": "#FF0000",
                           "redCharactersByOption": {o["id"]: o.pop("_redChars") for o in q["options"]}}
    q["status"] = "verified_from_color" if len(q["correctAnswers"]) == 1 else "needs_review"
    if not q["question"] or len(q["options"]) != 4 or [o["id"] for o in q["options"]] != list("ABCD") or len(q["correctAnswers"]) != 1:
        issues.append({"type": "question_structure_or_answer", "id": q["id"], "question": q})

ids = [q["id"] for q in questions]
for n, count in Counter(ids).items():
    if count != 1:
        issues.append({"type": "duplicate_number", "id": n, "count": count})
missing = sorted(set(range(1, max(ids) + 1)) - set(ids))
if missing:
    issues.append({"type": "missing_numbers", "ids": missing})

data = {"schemaVersion": "1.0", "title": "Tư tưởng Hồ Chí Minh",
        "source": {"file": SOURCE.name, "pages": len(doc),
                   "sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                   "answerMethod": "Đáp án lấy từ phần chữ màu đỏ trong PDF gốc; chưa thẩm định lại kiến thức."},
        "totalQuestions": len(questions), "questions": questions}
(OUT / "questions.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(ROOT / "Scribd.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(OUT / "questions.js").write_text("window.QUIZ_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")
(AUDIT / "lines.json").write_text(json.dumps(lines, ensure_ascii=False, indent=2), encoding="utf-8")
report = {"pages": len(doc), "questions": len(questions), "issues": issues,
          "answerDistribution": dict(Counter(a for q in questions for a in q["correctAnswers"])),
          "ignoredLines": ignored}
(AUDIT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({k: v for k, v in report.items() if k != "ignoredLines"}, ensure_ascii=False, indent=2))
