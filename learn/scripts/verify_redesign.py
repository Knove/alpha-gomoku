#!/usr/bin/env python
"""learn 教程改造校验脚本:代码节选逐字校验加文风门禁。

功能两块:

一、代码节选逐字校验。扫描 learn/src/lessons 下全部课程文件里的代码节选块
(现有 codewalk 样式块,以及改造后复用 framework/evidence.tsx 中 EvidenceCard
的落点码块),对每一块按其 caption 声明的源文件(仓库根下 alphagomoku 目录、
server 目录等)做子串匹配:排除编辑标记行之后,节选断成的每一段都必须是声明
源文件里的连续行,段与段在源文件里的出现位置严格递增(行序单调);比对时节选
与源码窗口各自去掉公共缩进后逐字符匹配(整段等量缩进对齐)。编辑标记行指统一
前缀「#(」的行,仅两类:省略声明、非源码块首标识;前缀用半角括号「#(」,全角「#（」不作标记识别,其余行一律逐字校验。证据卡 fidelity 属性为 constructed 的块是教学
构造物,不作逐字校验。caption 指块上方的声明:证据卡的 source 与 title 属性、
眉签( mini-label )文字、对证(Ledger)标题、块首注释行;caption 未声明源文件
的块跳过并计入警告。

二、文风门禁。learn/src 里出现破折号(U+2014 连写两次)即失败;learn/src 里
出现「对账」一词即失败。契约文件 STYLE-TEXTBOOK.md 的禁用词表行本身要写出这些
字样,不纳入扫描范围,与契约第四节的门禁命令只扫 src 对齐。

失败分类:--only 给出本次改造涉及的课程文件(如 L02,L11)后,范围内课程的节选
失败计为失败并影响退出码,范围外课程的节选失败计为存量待迁移(阶段 4 工单,
冻结不阻塞本次验收),不影响退出码;不给 --only 时全部节选失败都计失败。
文风门禁不受 --only 影响,始终全量执行。

退出码:0 表示通过(允许带警告与存量待迁移),1 表示存在失败项,2 表示用法或目录错误。
用法:python scripts/verify_redesign.py [--root 仓库根] [--only L02,L11] [--selftest]
"""
from __future__ import annotations

import argparse
import re
import sys
import tempfile
from pathlib import Path

DASH = "\u2014\u2014"  # 破折号:U+2014 连写两次,写成转义避免脚本自身命中门禁字面
BANNED_WORD = "对账"
MARKER_PREFIXES = ("#(",)
SOURCE_EXTS = {"py", "ts", "tsx", "js", "jsx", "mjs", "json", "sh"}
SKIP_DIRS = {"node_modules", ".venv", ".git", "__pycache__", "dist", "build", ".next"}

# caption 里形如 game.py、server/app.py、pipeline.run、Game.canonical_board 的记号
TOKEN_RE = re.compile(
    r"(?<![A-Za-z0-9_./-])((?:[A-Za-z0-9_.-]+/)*[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+)(?![A-Za-z0-9_])"
)


def unescape_line(raw: str) -> str:
    """还原模板字面量里的转义:反斜杠加反斜杠、反斜杠加反引号、反斜杠加美元符。"""
    out: list[str] = []
    i = 0
    while i < len(raw):
        c = raw[i]
        if c == "\\" and i + 1 < len(raw) and raw[i + 1] in "\\`$":
            out.append(raw[i + 1])
            i += 2
        else:
            out.append(c)
            i += 1
    return "".join(out)


def extract_pre_bodies(text: str) -> list[tuple[int, list[str]]]:
    """找出每个代码节选块( <pre> 模板字面量,或 EvidenceCard 的直接模板字面量子节点),
    返回(正文起始偏移,逐行原文)。"""
    blocks: list[tuple[int, list[str]]] = []
    opener = re.compile(r"<pre[^>]*>\{`|<EvidenceCard\b[^>]*>\s*\{`")
    for m in opener.finditer(text):
        start = m.end()
        i = start
        n = len(text)
        while i < n:
            if text[i] == "\\":
                i += 2
                continue
            if text[i] == "`":
                break
            i += 1
        raw = text[start:i]
        blocks.append((start, raw.split("\n")))
    return blocks


def marker_flags(lines: list[str]) -> list[bool]:
    """标注编辑标记行:仅统一前缀「#(」的行豁免逐字校验,其余行一律校验。"""
    return [ln.lstrip().startswith(MARKER_PREFIXES) for ln in lines]


def strip_common_indent(lines: list[str]) -> list[str]:
    """去掉整段公共缩进(空行归一为空行),供整段等量缩进对齐后比对。"""
    indents = [len(ln) - len(ln.lstrip(" ")) for ln in lines if ln.strip()]
    cut = min(indents) if indents else 0
    return [ln[cut:] if ln.strip() else "" for ln in lines]


def split_segments(lines: list[str], flags: list[bool]) -> list[list[str]]:
    """按编辑标记行断段:标记行不进段,段内行保持原次序。"""
    segments: list[list[str]] = []
    current: list[str] = []
    for line, is_marker in zip(lines, flags):
        if is_marker:
            if current:
                segments.append(current)
                current = []
        else:
            current.append(line)
    if current:
        segments.append(current)
    return segments


def match_segments(source_lines: list[str], segments: list[list[str]]) -> bool:
    """每段在源文件里找到一个连续行窗口,窗口去公共缩进后与段逐字符相等;
    各窗口起始行号严格递增(行序单调)。"""
    pos = 0
    for segment in segments:
        needle = strip_common_indent(segment)
        width = len(needle)
        found = -1
        for j in range(pos, max(pos, len(source_lines) - width + 1)):
            if strip_common_indent(source_lines[j:j + width]) == needle:
                found = j
                break
        if found < 0:
            return False
        pos = found + 1
    return True


def tag_attrs(tag: str) -> dict[str, str]:
    out = {m.group(1): m.group(2) for m in re.finditer(r'(\w+)="([^"]*)"', tag)}
    out.update({m.group(1): m.group(2) for m in re.finditer(r"(\w+)='([^']*)'", tag)})
    return out


def enclosing_tag(text: str, pos: int, name: str) -> str | None:
    open_at = text.rfind("<" + name, 0, pos)
    if open_at < 0:
        return None
    close_at = text.rfind("</" + name + ">", 0, pos)
    if close_at > open_at:
        return None
    end = open_at
    quote = ""
    while end < len(text):
        c = text[end]
        if quote:
            if c == quote:
                quote = ""
        elif c in "\"'`":
            quote = c
        elif c == ">":
            return text[open_at:end + 1]
        end += 1
    return None


def caption_texts(text: str, pos: int, first_line: str) -> list[str]:
    """汇总代码块 caption:证据卡属性、眉签、对证标题、块首注释行,取并集。"""
    parts: list[str] = []
    ec = enclosing_tag(text, pos, "EvidenceCard")
    if ec is not None:
        attrs = tag_attrs(ec)
        parts.extend(v for v in (attrs.get("source", ""), attrs.get("title", "")) if v)
    prev_pre_end = text.rfind("</pre>", 0, pos)
    label_at = text.rfind('mini-label">', 0, pos)
    if label_at > prev_pre_end:
        end = text.find("<", label_at + len('mini-label">'))
        if end > 0:
            parts.append(text[label_at + len('mini-label">'):end])
    ledger = enclosing_tag(text, pos, "Ledger")
    if ledger is not None:
        parts.append(tag_attrs(ledger).get("title", ""))
    if first_line.lstrip().startswith("#"):
        parts.append(first_line)
    return [p for p in parts if p]


class SourceIndex:
    """仓库源文件索引:按基名(忽略大小写)查找,按目录优先级择一。"""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.by_name: dict[str, list[Path]] = {}
        stack = [root]
        while stack:
            d = stack.pop()
            for child in d.iterdir():
                if child.is_dir():
                    if child.name not in SKIP_DIRS:
                        stack.append(child)
                elif child.is_file():
                    self.by_name.setdefault(child.name.lower(), []).append(child)

    def resolve(self, token: str) -> Path | None:
        direct = self.root / token
        if direct.is_file():
            return direct
        names = [token.rsplit("/", 1)[-1]]
        if "." not in names[0]:
            names = []
        elif names[0].rsplit(".", 1)[-1].lower() not in SOURCE_EXTS:
            stem = names[0].rsplit(".", 1)[0]
            names = [stem + "." + ext for ext in sorted(SOURCE_EXTS)]
        for name in names:
            hits = self.by_name.get(name.lower(), [])
            if not hits:
                continue
            return self._prefer(hits)
        return None

    def _prefer(self, hits: list[Path]) -> Path:
        tiers = ("alphagomoku/", "server/", "web/src/", "learn/src/")

        def rank(p: Path) -> tuple[int, int, str]:
            rel = p.relative_to(self.root).as_posix()
            for i, t in enumerate(tiers):
                if rel.startswith(t):
                    return (i, len(rel), rel)
            return (len(tiers), len(rel), rel)

        return sorted(hits, key=rank)[0]


def declared_sources(caption: str, index: SourceIndex) -> tuple[list[Path], list[str]]:
    """从 caption 提取源文件:返回(已解析文件,有源码扩展名但找不到的记号)。"""
    files: list[Path] = []
    missing: list[str] = []
    seen: set[str] = set()
    for m in TOKEN_RE.finditer(caption):
        token = m.group(1)
        if token in seen:
            continue
        seen.add(token)
        base = token.rsplit("/", 1)[-1]
        ext = base.rsplit(".", 1)[-1].lower() if "." in base else ""
        looks_like_file = "/" in token or ext in SOURCE_EXTS
        path = index.resolve(token)
        if path is not None:
            if path not in files:
                files.append(path)
        elif looks_like_file:
            missing.append(token)
    return files, missing


def lesson_in_scope(rel: str, only: set[str] | None) -> bool:
    if not only:
        return True
    stem = Path(rel).stem
    name = Path(rel).name
    return stem in only or name in only or rel in only


def check_excerpts(
    root: Path, only: set[str] | None = None
) -> tuple[list[str], list[str], list[str]]:
    """返回(失败,存量待迁移,警告)。失败与存量都是已带文件行号的完整消息。"""
    index = SourceIndex(root)
    failures: list[str] = []
    backlog: list[str] = []
    warnings: list[str] = []
    lessons = sorted((root / "learn/src/lessons").glob("*.tsx"))
    for lesson in lessons:
        text = lesson.read_text(encoding="utf-8")
        rel = lesson.relative_to(root).as_posix()
        for start, raw_lines in extract_pre_bodies(text):
            start_line = text.count("\n", 0, start) + 1
            ec = enclosing_tag(text, start, "EvidenceCard")
            if ec is not None and tag_attrs(ec).get("fidelity") == "constructed":
                continue  # 教学构造物,不作逐字校验
            flags = marker_flags(raw_lines)
            body = [unescape_line(raw) for raw in raw_lines]
            caption = "\n".join(caption_texts(text, start, body[0] if body else ""))
            files, missing = declared_sources(caption, index)
            if missing:
                message = (
                    f"{rel}:{start_line}: caption 声明的源文件在仓库中找不到: {', '.join(missing)}"
                )
                (failures if lesson_in_scope(rel, only) else backlog).append(message)
                continue
            if not files:
                warnings.append(f"{rel}:{start_line}: caption 未声明源文件,本块跳过校验")
                continue
            sources = {p: p.read_text(encoding="utf-8", errors="replace").split("\n") for p in files}
            names = ", ".join(p.relative_to(root).as_posix() for p in files)
            segments = split_segments(body, flags)
            ok = any(match_segments(src_lines, segments) for src_lines in sources.values())
            if not ok:
                shown = next(
                    (ln for ln, is_marker in zip(body, flags) if not is_marker and ln.strip()),
                    "(空块)",
                )
                shown = shown if len(shown) <= 60 else shown[:57] + "..."
                where = caption.replace("\n", " / ")
                where = where if len(where) <= 60 else where[:57] + "..."
                message = (
                    f"{rel}:{start_line}: 节选块[{where}]在声明的源文件 {names} 中"
                    f"找不到逐字对齐的连续或分段子串(已按公共缩进对齐): {shown}"
                )
                (failures if lesson_in_scope(rel, only) else backlog).append(message)
    return failures, backlog, warnings


def check_style(root: Path) -> list[str]:
    """文风门禁只扫 learn/src;契约文件的禁用词表行本身要写出禁用字样,不纳入扫描。"""
    hits: list[str] = []
    src_dir = root / "learn/src"
    if not src_dir.is_dir():
        return hits
    for path in sorted(p for p in src_dir.rglob("*") if p.is_file()):
        rel = path.relative_to(root).as_posix()
        text = path.read_text(encoding="utf-8", errors="replace")
        for i, line in enumerate(text.splitlines(), 1):
            if DASH in line:
                hits.append(f"{rel}:{i}: 出现破折号(U+2014 连写两次),全站零容忍")
            if BANNED_WORD in line:
                hits.append(f"{rel}:{i}: 出现禁用口语词「{BANNED_WORD}」")
    return hits


def collect(
    root: Path, only: set[str] | None = None
) -> tuple[list[str], list[str], list[str]]:
    failures = check_style(root)
    excerpt_failures, backlog, warnings = check_excerpts(root, only)
    return failures + excerpt_failures, backlog, warnings


def run(root: Path, only: set[str] | None = None) -> int:
    if not (root / "learn/src/lessons").is_dir():
        print(f"错误: {root} 下找不到 learn/src/lessons 目录", file=sys.stderr)
        return 2
    failures, backlog, warnings = collect(root, only)
    for item in failures:
        print("失败: " + item)
    for item in backlog:
        print("存量待迁移: " + item)
    for item in warnings:
        print("警告: " + item)
    print(
        f"检查完成:失败 {len(failures)} 项,存量待迁移 {len(backlog)} 项,"
        f"警告 {len(warnings)} 项(警告指 caption 未声明源文件而跳过的块,不计失败;"
        f"存量待迁移指 --only 范围之外的旧节选,冻结为阶段 4 工单,不计失败)。"
        f"逐字校验粒度是文件内子串:caption 声明的函数名与行域只作人工回源指引,脚本不核对。"
    )
    return 1 if failures else 0


def parse_only(values: list[str] | None) -> set[str] | None:
    if not values:
        return None
    out: set[str] = set()
    for value in values:
        out.update(part.strip() for part in value.split(",") if part.strip())
    return out or None


def selftest() -> int:
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        (root / "alphagomoku").mkdir()
        (root / "alphagomoku/game.py").write_text(
            "class Game:\n"
            "    def canonical_board(self) -> np.ndarray:\n"
            '        """Board from the perspective of the player to move."""\n'
            "        return self.board * self._current\n"
            "    def other(self):\n"
            "        return 1\n",
            encoding="utf-8",
        )
        lessons = root / "learn/src/lessons"
        lessons.mkdir(parents=True)
        # 第 1 块:去公共缩进的三行节选(第 2 课情形)应通过;
        # 第 2 块:行序打乱应失败;第 3 块:段间插入外来行应失败;
        # 第 4 块:标记行豁免,未标记者仍校验;
        # 第 5 块:constructed 教学构造物跳过。
        (lessons / "LX.tsx").write_text(
            '<Ledger title="game.py · Game.canonical_board">\n'
            '<EvidenceCard fidelity="runtime-exact" source="game.py" title="去缩进节选">\n'
            "<pre>{`def canonical_board(self) -> np.ndarray:\n"
            '    """Board from the perspective of the player to move."""\n'
            "    return self.board * self._current`}</pre>\n"
            "</EvidenceCard>\n"
            '<EvidenceCard fidelity="runtime-exact" source="game.py" title="行序打乱">\n'
            "<pre>{`        return self.board * self._current\n"
            "    def canonical_board(self):`}</pre>\n"
            "</EvidenceCard>\n"
            '<EvidenceCard fidelity="runtime-exact" source="game.py" title="插入外来行">\n'
            "<pre>{`    def canonical_board(self):\n"
            "        NOT_IN_SOURCE\n"
            "        return self.board * self._current`}</pre>\n"
            "</EvidenceCard>\n"
            '<EvidenceCard fidelity="runtime-exact" source="game.py" title="标记行豁免">\n'
            "<pre>{`#(省略一行)\n"
            "        NOT_IN_SOURCE_MARKED\n"
            "        return self.board * self._current`}</pre>\n"
            "</EvidenceCard>\n"
            '<EvidenceCard fidelity="constructed" source="game.py" title="构造物">\n'
            "<pre>{`totally made up pseudocode`}</pre>\n"
            "</EvidenceCard>\n"
            "</Ledger>\n"
            "<pre>{`python -m tool`}</pre>\n",
            encoding="utf-8",
        )
        (root / "learn/src/lessons/LY.tsx").write_text(
            '<EvidenceCard fidelity="runtime-exact" source="game.py" title="他课旧节选">\n'
            "<pre>{`        LEGACY_LINE`}</pre>\n"
            "</EvidenceCard>\n",
            encoding="utf-8",
        )
        (root / "learn/src/ban.ts").write_text('const w = "对账" + "' + DASH + '"\n', encoding="utf-8")
        (root / "learn/STYLE-TEXTBOOK.md").write_text(
            "破折号示例 " + DASH + " 与禁用词 " + BANNED_WORD + "\n", encoding="utf-8"
        )

        failures, backlog, warnings = collect(root, only={"LX"})
        assert any("插入外来行" in f for f in failures), failures
        assert any("行序打乱" in f for f in failures), failures
        assert any("NOT_IN_SOURCE_MARKED" in f for f in failures), failures
        assert not any("去缩进节选" in f for f in failures), failures
        assert not any("构造物" in f for f in failures), failures
        # 标记行豁免逐字校验:失败消息的示例行不应是标记行本身
        assert not any(f.rsplit(": ", 1)[-1].lstrip().startswith(MARKER_PREFIXES) for f in failures), failures
        assert any(BANNED_WORD in f for f in failures), failures
        assert any("破折号" in f for f in failures), failures
        assert any("LEGACY_LINE" in b for b in backlog), backlog
        assert not any("LEGACY_LINE" in f for f in failures), failures
        assert any("caption 未声明源文件" in w for w in warnings), warnings
        assert not any("python -m tool" in f for f in failures), failures

        # 契约文件不纳入文风门禁:上面的 STYLE-TEXTBOOK.md 含破折号与禁用词仍应通过
        failures2, backlog2, _ = collect(root, only={"LX", "LY"})
        assert not any("STYLE-TEXTBOOK" in f for f in failures2), failures2
        assert any("LEGACY_LINE" in f for f in failures2), failures2
        assert not backlog2, backlog2
    print("自检通过")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="learn 教程改造校验:节选逐字校验与文风门禁")
    parser.add_argument("--root", type=Path, default=None, help="仓库根目录,默认从脚本位置推断")
    parser.add_argument(
        "--only",
        action="append",
        default=None,
        help="本次改造涉及的课程文件(可逗号分隔,如 L02,L11);范围外旧节选计为存量待迁移",
    )
    parser.add_argument("--selftest", action="store_true", help="运行内置自检")
    args = parser.parse_args()
    if args.selftest:
        return selftest()
    root = args.root.resolve() if args.root else Path(__file__).resolve().parents[2]
    return run(root, parse_only(args.only))


if __name__ == "__main__":
    sys.exit(main())
