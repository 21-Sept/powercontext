# /// script
# requires-python = ">=3.11"
# dependencies = ["matplotlib>=3.10,<4"]
# ///
"""Render the bilingual v1.2.0 blog figures. Run with uv run scripts/generate_blog_jev_figures.py.

Semantics: powercontext-v1.2.0 memory_write_gate.py and runtime/config.py;
code workflow: docs/en/docs/workflows/repository-code.md;
reported benchmark scores: docs/en/benchmarks/index.md (Qwen3.7-plus row).
"""

# Chinese captions intentionally use full-width punctuation.
# ruff: noqa: RUF001

from html import escape
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "docs/assets/blog/powercontext-1-2-0-jev"
BG = "#f7f5ef"
INK = "#14213a"
MUTED = "#5c6a7c"
BLUE = "#1769d2"
LINE = "#cbd3dc"
GREEN = "#177a63"
RED = "#a84150"


class Diagram:
    def __init__(self, lang, name, height, title, subtitle):
        self.lang, self.name, self.height = lang, name, height
        self.parts = [
            f'''<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="{height}" viewBox="0 0 1000 {height}" role="img" aria-labelledby="title desc" lang="{lang}">
<title id="title">{escape(title)}</title><desc id="desc">{escape(subtitle)}</desc>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="{MUTED}" stroke-width="1.5"/></marker></defs>
<style>text{{font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;fill:{INK}}}.muted{{fill:{MUTED}}}</style>
<rect width="1000" height="{height}" rx="18" fill="{BG}"/>'''
        ]
        self.text(48, 40, "PowerContext  /  v1.2.0", 18, color=BLUE, weight=700)
        self.text(48, 88, title, 34, weight=700)
        self.text(48, 126, subtitle, 20, color=MUTED)

    def text(self, x, y, value, size=22, color=INK, weight=400):
        self.parts.append(
            f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" style="fill:{color}">{escape(value)}</text>'
        )

    def lines(self, x, y, values, size=21, color=MUTED, step=31):
        for i, value in enumerate(values):
            self.text(x, y + i * step, value, size, color)

    def box(self, x, y, w, h, title, lines=(), tag=None, fill="#ffffff", accent=BLUE):
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{fill}" stroke="{LINE}"/>')
        offset = 0
        if tag:
            self.text(x + 24, y + 30, tag, 17, accent, 700)
            offset = 26
        self.text(x + 24, y + 42 + offset, title, 25, weight=700)
        self.lines(x + 24, y + 75 + offset, lines, size=20, step=29)

    def arrow(self, path, dashed=False):
        dash = ' stroke-dasharray="6 6"' if dashed else ""
        self.parts.append(
            f'<path d="{path}" fill="none" stroke="{MUTED}" stroke-width="2" stroke-linejoin="round"{dash} marker-end="url(#arrow)"/>'
        )

    def footer(self, lines):
        y = self.height - 28 - (len(lines) - 1) * 27
        self.lines(48, y, lines, 17, step=27)

    def save(self):
        (OUT / f"{self.name}.{self.lang}.svg").write_text("\n".join(self.parts) + "\n</svg>\n")


def decision(lang):
    zh = lang == "zh"

    def t(a, b):
        return a if zh else b

    d = Diagram(
        lang,
        "decision-flow",
        1130,
        t("用项目证据检查候选方案", "Review proposals with project evidence"),
        t(
            "应用编排流程；模型判断与实际测试分别记录。",
            "The application orchestrates review and records test results separately.",
        ),
    )
    d.box(
        48,
        162,
        280,
        142,
        "Memory",
        t(["已确认的项目规则", "保留来源与引用"], ["Established project rules", "Sources and citations"]),
        tag="01",
    )
    d.box(
        376,
        162,
        576,
        142,
        "PreparedContext",
        t(
            ["召回相关记录，核对引用", "把项目依据明确传给生成与检查环节"],
            [
                "Recall relevant records and verify their citations.",
                "Explicitly pass evidence to generation and review.",
            ],
        ),
        tag="02",
    )
    d.arrow("M 328 233 H 376")
    d.arrow("M 664 304 V 340 H 258 V 376")
    d.arrow("M 664 340 H 742 V 376")
    d.box(
        48,
        376,
        420,
        180,
        "Coding Agent",
        t(
            ["当前任务 + 项目背景", "沿用原有生成模型", "产出候选代码或方案"],
            [
                "Current task + project context",
                "Keep the existing generation model",
                "Produce candidate code or a proposal",
            ],
        ),
    )
    d.box(
        532,
        376,
        420,
        180,
        "DecisionModel",
        t(
            ["问题 + 候选方案 + 项目证据", "Runtime → SystemOne 适配器", "Jev / Laya"],
            ["Question + proposal + evidence", "Runtime → SystemOne adapter", "Jev / Laya"],
        ),
    )
    d.arrow("M 468 474 H 532")
    d.arrow("M 258 556 V 638")
    d.text(274, 602, t("候选代码", "Candidate code"), 18)
    d.arrow("M 742 556 V 638")
    d.text(758, 602, t("模型意见", "Assessment"), 18)
    d.box(
        48,
        638,
        420,
        172,
        t("独立测试", "Independent tests"),
        t(
            ["执行真实代码", "核对实际行为与预期结果", "模型意见不替代测试"],
            [
                "Execute the actual code",
                "Check behavior against expectations",
                "A model verdict does not replace tests",
            ],
        ),
        accent=GREEN,
    )
    d.box(
        532,
        638,
        420,
        172,
        "yes / no / abstain",
        t(
            ["符合 / 不符合 / 无法确定", "超时或后端失败 → abstain", "不会自动修改候选代码"],
            [
                "Meets rules / does not / uncertain",
                "Timeout or backend failure → abstain",
                "Does not automatically change code",
            ],
        ),
    )
    d.arrow("M 258 810 V 844 H 500 V 876")
    d.arrow("M 742 810 V 844 H 500")
    d.box(
        48,
        876,
        904,
        136,
        t("应用汇总观察，再写回 Memory", "The application records observations in Memory"),
        t(
            [
                "规则、模型意见、测试结果分别保留，供后续任务召回。",
                "应用显式控制召回、判断与写回；接入模型不等于自动拥有项目历史。",
            ],
            [
                "Keep rules, model assessments and test results distinct for later recall.",
                "The application controls recall, review and writeback; history is not automatic.",
            ],
        ),
    )
    d.footer(
        t(
            ["接入示例流程 · DecisionModel 由应用调用，生成模型独立配置。"],
            ["Example integration flow · The application calls DecisionModel; generation is configured separately."],
        )
    )
    d.save()


def code(lang):
    zh = lang == "zh"

    def t(a, b):
        return a if zh else b

    d = Diagram(
        lang,
        "code-understanding",
        1190,
        t("从仓库到可追溯的代码依据", "From repository to traceable code evidence"),
        t(
            "可选实验能力 · 默认关闭 · 与项目记忆分开存储",
            "Optional experimental capability · Disabled by default · Separate from Memory",
        ),
    )
    d.box(
        48,
        162,
        420,
        158,
        t("Git 工作区", "Git worktree"),
        t(
            ["Scope 绑定与访问控制", "捕获文件内容与指纹"],
            ["Scope binding and access control", "Capture source content and fingerprints"],
        ),
        tag=t("01 / 仓库", "01 / SOURCE"),
    )
    d.box(
        532,
        162,
        420,
        158,
        "Tree-sitter",
        t(
            ["Python · JS / TS · Go", "提取定义、符号和引用"],
            ["Python · JS / TS · Go", "Extract definitions, symbols, references"],
        ),
        tag=t("02 / 提取", "02 / EXTRACT"),
    )
    d.arrow("M 468 241 H 532")
    d.arrow("M 742 320 V 350 H 258 V 380")
    d.box(
        48,
        380,
        420,
        158,
        t("静态关系解析", "Static relationship resolution"),
        t(
            ["解析导入、别名与跨文件关系", "区分已解析、候选与未解析线索"],
            ["Resolve imports and cross-file links", "Resolved / candidate / unresolved"],
        ),
        tag=t("03 / 解析", "03 / RESOLVE"),
    )
    d.box(
        532,
        380,
        420,
        158,
        "SQLite / seekdb",
        t(
            ["符号、关系、全文索引", "可重建缓存；按版本发布"],
            ["Symbols, relationships, full-text index", "Rebuildable cache; versioned generations"],
        ),
        tag=t("04 / 索引", "04 / INDEX"),
    )
    d.arrow("M 468 459 H 532")
    d.arrow("M 742 538 V 570 H 500 V 602")
    d.box(
        48,
        602,
        904,
        144,
        "query_code",
        t(
            [
                "定位符号、调用关系与影响线索，读取带出处的源码。",
                "返回路径、行号、内容摘要与版本指纹，便于回到代码核对。",
            ],
            [
                "Locate symbols, calls and possible impacts; read source with provenance.",
                "Paths, line ranges, hashes and fingerprints let readers verify the evidence.",
            ],
        ),
        tag=t("05 / 查询", "05 / QUERY"),
    )
    d.arrow("M 258 746 V 794")
    d.arrow("M 742 746 V 794")
    d.box(
        48,
        794,
        420,
        130,
        t("直接交给 Coding Agent", "Directly to the Coding Agent"),
        t(
            ["用于调查、修改与测试", "候选关系仍需验证"],
            ["Investigate, change and test", "Candidate relationships need verification"],
        ),
    )
    d.box(
        532,
        794,
        420,
        130,
        "include_code: true",
        t(
            ["上下文包 = 相关记忆 + 少量代码依据", "代码不可用时，历史上下文继续交付"],
            ["Memory + bounded code evidence", "History still delivers if code is unavailable"],
        ),
    )
    d.box(
        48,
        970,
        904,
        130,
        t("代码变化后，先更新再查", "Refresh before querying changed code"),
        t(
            [
                "409 code_changed → 本机 code sync → 发布新索引 → 重新定位",
                "复用未变化文件的解析结果，再重新解析全图引用。",
            ],
            [
                "409 code_changed → local code sync → publish index → locate again",
                "Reuse unchanged syntax facts, then resolve all references again.",
            ],
        ),
        fill="#edf2f8",
    )
    d.footer(
        t(
            ["代码关系提供调查线索，最终影响仍需实际测试确认。"],
            ["Code relationships are investigative leads; actual tests must confirm the impact."],
        )
    )
    d.save()


def memory(lang):
    zh = lang == "zh"

    def t(a, b):
        return a if zh else b

    d = Diagram(
        lang,
        "memory-governance",
        1320,
        t("记忆写入与维护，各自有依据", "Evidence-aware memory writes and maintenance"),
        t(
            "写入检查可选；引用、版本和容量校验始终有效。",
            "The model check is optional; citation, version and capacity validation still applies.",
        ),
    )
    d.box(
        48,
        162,
        280,
        158,
        t("候选记忆", "Candidate memory"),
        t(["内容 + 引用证据", "规则、决策与观察"], ["Content + cited evidence", "Rules / decisions / facts"]),
        tag="01",
    )
    d.box(
        376,
        162,
        576,
        158,
        t("可选检查 · DecisionModel", "Optional check · DecisionModel"),
        t(
            ["问题：引用证据是否不足以支持候选记忆？", "默认关闭；下方展示 v1.2.0 的默认结果映射。"],
            ["Does the evidence fail to support this memory?", "Opt-in; v1.2.0 default mapping shown below."],
        ),
        tag="02",
    )
    d.arrow("M 328 241 H 376")
    d.arrow("M 664 320 V 354 H 188 V 390")
    d.arrow("M 664 354 H 500 V 390")
    d.arrow("M 664 354 H 812 V 390")
    d.box(
        48,
        390,
        280,
        152,
        "yes → HOLD",
        t(["证据不足", "暂停本次写入"], ["Evidence is insufficient", "Hold the write"]),
        accent=RED,
        fill="#fbf0f0",
    )
    d.box(
        360,
        390,
        280,
        152,
        "no → ACCEPT",
        t(["继续常规流程", "仍需通过确定性校验"], ["Continue normal flow", "Validation still applies"]),
        accent=GREEN,
        fill="#eef6f2",
    )
    d.box(
        672,
        390,
        280,
        152,
        "abstain → ACCEPT",
        t(["或判断服务故障", "继续常规流程"], ["Also on model fallback", "Continue normal flow"]),
        fill="#edf2f8",
    )

    d.arrow("M 500 542 V 650")
    d.arrow("M 812 542 V 620 H 500")
    d.box(
        48,
        650,
        904,
        180,
        t("常规校验与容量检查", "Normal validation and capacity checks"),
        t(
            [
                "默认上限：有效条目 5,000 · 当前清单条目 10,000 · 清单 4 MiB",
                "超过容量 → 409 memory_capacity_exceeded；通过后成为当前有效记忆。",
                "未启用模型检查时，直接进入常规流程；模型故障也不会绕过这些校验。",
            ],
            [
                "Default limits: 5,000 active entries · 10,000 manifest entries · 4 MiB manifest",
                "Over capacity → 409 memory_capacity_exceeded; valid writes become active memory.",
                "Disabled checks skip the model, not validation. Model failure does not bypass it.",
            ],
        ),
        tag="03",
    )
    d.text(
        48,
        872,
        t("保存后维护：改变当前状态，保留历史", "After saving: change current state, preserve history"),
        27,
        weight=700,
    )
    d.box(
        48,
        902,
        280,
        170,
        t("显式修订", "Revise"),
        t(
            ["创建新版本", "新版本参与检索", "旧版本继续保留"],
            ["Create a new version", "Retrieve the new version", "Preserve the old version"],
        ),
    )
    d.box(
        360,
        902,
        280,
        170,
        t("显式停用", "Deactivate"),
        t(
            ["退出日常检索", "历史正文不删除", "精确引用继续保留"],
            ["Leave ordinary retrieval", "Keep historical content", "Retain exact citations"],
        ),
    )
    d.box(
        672,
        902,
        280,
        170,
        t("可选清单压缩", "Compact manifest"),
        t(
            ["默认关闭，先预览", "仅清理符合条件的停用项", "不删除历史正文与版本"],
            ["Opt-in; preview first", "Eligible inactive items only", "Keep historical versions"],
        ),
    )
    d.box(
        48,
        1104,
        904,
        84,
        t("历史正文、Revision 与精确引用始终保留", "Historical bodies, Revisions and exact citations remain"),
        fill="#edf2f8",
    )
    d.footer(
        t(
            [
                "配置阈值后，低置信度的 HOLD 方向结果可降为 FLAG：继续写入并标记不确定。",
                "容量针对当前 Memory 清单，不等于底层数据库大小。",
                "压缩后的停用条目不能再通过激活恢复；历史内容仍可追溯。",
            ],
            [
                "With a threshold, a low-confidence hold verdict becomes FLAG: write and mark uncertain.",
                "Capacity measures the current Memory manifest, not the size of the underlying database.",
                "Compacted inactive entries cannot be reactivated; their historical content remains traceable.",
            ],
        )
    )
    d.save()


def benchmark(lang):
    # Installed by this script's PEP 723 environment, outside the package dependencies.
    import matplotlib  # ty: ignore[unresolved-import]

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt  # ty: ignore[unresolved-import]
    from matplotlib import font_manager  # ty: ignore[unresolved-import]

    zh = lang == "zh"

    def t(a, b):
        return a if zh else b

    # A local CJK font is embedded as glyph paths, so exported charts do not depend on reader fonts.
    candidates = ["Arial Unicode MS", "PingFang SC", "Heiti TC", "Noto Sans CJK SC"]
    available = {font.name for font in font_manager.fontManager.ttflist}
    font = next((name for name in candidates if name in available), "DejaVu Sans")
    plt.rcParams.update({"font.family": font, "svg.fonttype": "path", "text.color": INK, "axes.labelcolor": MUTED})
    fig = plt.figure(figsize=(10, 7.8), dpi=100, facecolor=BG)
    fig.text(0.048, 0.94, "PowerContext  /  v1.2.0", fontsize=13, color=BLUE, weight="bold")
    fig.text(0.048, 0.867, t("LoCoMo-Plus：问答准确率", "LoCoMo-Plus: answer accuracy"), fontsize=25, weight="bold")
    fig.text(
        0.048,
        0.816,
        t(
            "Qwen3.7-plus · 相同资料与任务，比较是否加入 Jev 候选过滤",
            "Qwen3.7-plus · Same material and tasks, with or without Jev filtering",
        ),
        fontsize=14,
        color=MUTED,
    )
    ax = fig.add_axes([0.27, 0.29, 0.66, 0.34], facecolor=BG)
    values = [60.37, 68.947]
    ax.barh([1, 0], values, height=0.36, color=["#8b99ac", BLUE], zorder=3)
    ax.set_xlim(0, 100)
    ax.set_ylim(-0.58, 1.58)
    ax.set_yticks([1, 0], ["PowerContext", "PowerContext + Jev"], fontsize=15, color=INK)
    ax.set_xticks([0, 20, 40, 60, 80, 100], [f"{v}%" for v in [0, 20, 40, 60, 80, 100]], fontsize=12, color=MUTED)
    ax.tick_params(axis="both", length=0, pad=12)
    ax.grid(axis="x", color=LINE, linewidth=0.8, zorder=0)
    for spine in ax.spines.values():
        spine.set_visible(False)
    for y, value, label in [(1, values[0], "60.37%"), (0, values[1], "68.947%")]:
        ax.text(value + 1.7, y, label, va="center", fontsize=18, weight="bold", color=INK)
    fig.text(0.27, 0.713, "+8.577", fontsize=26, weight="bold", color=BLUE)
    fig.text(0.435, 0.713, t("个百分点", "percentage points"), fontsize=14, color=MUTED)
    fig.text(0.74, 0.713, "≈14.2%", fontsize=26, weight="bold", color=GREEN)
    fig.text(0.74, 0.674, t("相对提升", "relative increase"), fontsize=13, color=MUTED)
    fig.text(0.27, 0.2, t("问答准确率（越高越好）", "Answer accuracy (higher is better)"), fontsize=14, color=MUTED)
    footnotes = t(
        [
            "Jev 在召回后过滤候选，不替换记忆提取与回答模型。",
            "项目方提供的分数；原始运行记录未公开。数据来源：官网 LoCoMo-Plus 评测页。",
            "本图反映问答结果，不代表代码测试通过率。",
        ],
        [
            "Jev filters retrieved candidates; it does not replace extraction or answer generation.",
            "Owner-reported scores; raw run records are not public. Source: the site's LoCoMo-Plus results.",
            "These are question-answering scores, not code test pass rates.",
        ],
    )
    for i, line in enumerate(footnotes):
        fig.text(0.048, 0.12 - i * 0.034, line, fontsize=11, color=MUTED)
    fig.savefig(
        OUT / f"benchmark.{lang}.svg",
        facecolor=BG,
        metadata={
            "Title": t("LoCoMo-Plus 问答准确率", "LoCoMo-Plus answer accuracy"),
            "Description": "Qwen3.7-plus: PowerContext 60.37%; PowerContext + Jev 68.947%. Owner-reported scores.",
            "Date": None,
        },
    )
    plt.close(fig)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for locale in ["zh", "en"]:
        decision(locale)
        code(locale)
        memory(locale)
        benchmark(locale)
    print("Rendered 8 bilingual SVG figures.")
