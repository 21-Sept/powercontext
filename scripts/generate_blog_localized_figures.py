"""Render paired blog diagrams from the article text; no source screenshots are altered.

Run with python scripts/generate_blog_localized_figures.py.
Numeric results are transcribed from the 1.0 article's original figures 10 and 12.
"""

# ruff: noqa: RUF001
import unicodedata
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIGURES = []


def add(folder, name, titles, cards, footers=("", "")):
    FIGURES.append((folder, name, titles, cards, footers))


R = "powercontext-1-0-0-release"
D = "deepseek-harness-powercontext"
# Each tuple pairs Chinese and English; content and geometry are shared.
add(
    R,
    "figure-01",
    ("工作不应在交接时中断", "Keep work moving across handoffs"),
    [
        (
            ("昨天", "Yesterday"),
            ("修改代码、运行测试、排除方案。", "Change code, run tests, rule out unsuitable approaches."),
        ),
        (
            ("交接", "Handoff"),
            ("保留目标、判断依据和已验证进展。", "Preserve the goal, decision evidence and verified progress."),
        ),
        (
            ("今天", "Today"),
            ("新的人或 Agent 核对证据，从下一步继续。", "The next person or agent checks the evidence and continues."),
        ),
    ],
)
add(
    R,
    "figure-02",
    ("协作需要共享工作上下文", "Collaboration needs shared context"),
    [
        (("运行状态", "Runtime state"), ("记录任务进行到了哪里。", "Record how far the task has progressed.")),
        (
            ("上下文", "Context"),
            ("保留目标、约束、来源和判断。", "Preserve goals, constraints, sources and decisions."),
        ),
        (
            ("协作", "Collaboration"),
            ("跨会话、工具和参与者继续工作。", "Continue across sessions, tools and participants."),
        ),
    ],
)
for n in ("03", "18"):
    add(
        R,
        "figure-" + n,
        ("人与 Agent 协作的项目上下文", "Project context for people and agents"),
        [
            (
                ("Memory", "Memory"),
                (
                    "保存未来仍然有用的事实、约束与决策。",
                    "Keep facts, constraints and decisions useful for future tasks.",
                ),
            ),
            (
                ("Handoff", "Handoff"),
                ("携带当前目标、已验证进展与下一步。", "Carry the current goal, verified progress and next step."),
            ),
            (
                ("证据", "Evidence"),
                ("让接手者能够核对来源和适用范围。", "Let recipients verify sources and applicability."),
            ),
        ],
    )
add(
    R,
    "figure-04",
    ("三种连续性，三种职责", "Three kinds of continuity"),
    [
        (
            ("运行连续性", "Runtime continuity"),
            (
                "会话恢复、检查点和记录；依赖原 Agent Host。",
                "Resume, checkpoints and transcripts within the original Agent Host.",
            ),
        ),
        (
            ("知识连续性", "Knowledge continuity"),
            ("Memory 保存未来任务可复用的事实和约束。", "Memory preserves facts and constraints for future tasks."),
        ),
        (
            ("工作连续性", "Work continuity"),
            ("Handoff 让下一位参与者知道现在如何继续。", "Handoff tells the next participant how to continue now."),
        ),
    ],
)
add(
    R,
    "figure-05",
    ("围绕工作组织上下文", "Organize context around the work"),
    [
        (("围绕工作", "Work-centered"), ("目标、进展和证据保持关联。", "Keep goals, progress and evidence connected.")),
        (
            ("面向行动", "Actionable"),
            ("明确下一步与需要先确认的事项。", "Make the next step and required checks explicit."),
        ),
        (
            ("人机共享", "Shared by people and agents"),
            (
                "不同视图引用同一版本的可核对材料。",
                "Different views reference the same version of verifiable material.",
            ),
        ),
    ],
)
add(
    R,
    "figure-06",
    ("一份可以接手的工作包", "A work package someone can act on"),
    [
        (
            ("目标与范围", "Goal and scope"),
            ("说明要完成什么，以及本次不包含什么。", "State what to complete and what is outside this task."),
        ),
        (
            ("已验证", "Verified"),
            ("记录结果、代码版本、测试条件和证据。", "Record results, code version, test conditions and evidence."),
        ),
        (
            ("待核实", "To verify"),
            ("保留阻塞、假设与仍然开放的问题。", "Keep blockers, hypotheses and open questions visible."),
        ),
        (
            ("下一步", "Next step"),
            (
                "接手者核对当前环境和权限，再决定是否接收。",
                "The recipient checks the environment and permissions before accepting.",
            ),
        ),
    ],
)
add(
    R,
    "figure-07",
    ("保留来源与可信边界", "Preserve provenance and boundaries"),
    [
        (
            ("来源", "Source"),
            (
                "保留原始证据及引用，不把猜测当事实。",
                "Keep original evidence and citations; distinguish guesses from facts.",
            ),
        ),
        (
            ("范围", "Scope"),
            ("限定项目、环境和适用条件。", "Identify the project, environment and applicable conditions."),
        ),
        (("版本", "Revision"), ("修订与退役保留历史。", "Revisions and retirement retain history.")),
        (
            ("审核", "Review"),
            (
                "复用为经验或技能前，审核做法与证据。",
                "Review the practice and evidence before reuse as Experience or Skill.",
            ),
        ),
    ],
)
add(
    R,
    "figure-08",
    ("工具可以换，项目上下文继续", "Change tools, keep project context"),
    [
        (
            ("Agent 集成", "Agent integrations"),
            (
                "Codex、Claude Code 等工具按约定采集和召回。",
                "Codex, Claude Code and other hosts capture and recall through integrations.",
            ),
        ),
        (
            ("独立服务", "Independent server"),
            (
                "HTTP / OpenAPI 与 Streamable HTTP MCP 暴露能力。",
                "HTTP / OpenAPI and Streamable HTTP MCP expose capabilities.",
            ),
        ),
        (
            ("同一项目", "Same project"),
            (
                "连接同一服务，明确 Scope，传递准确的交接版本。",
                "Use the same service and explicit Scope; pass the exact Handoff version.",
            ),
        ),
    ],
)
add(
    R,
    "figure-09",
    ("上下文如何沿着工作流转", "How context follows the work"),
    [
        (
            ("01 接入证据", "01 Bring in evidence"),
            (
                "代码、文档、工单、轨迹和人工输入成为 Source。",
                "Code, documents, tickets, traces and human input become Source.",
            ),
        ),
        (
            ("02 沉淀判断", "02 Preserve decisions"),
            ("Memory 保存可复用结论及其来源。", "Memory keeps reusable conclusions with provenance."),
        ),
        (
            ("03 按需组装", "03 Assemble on demand"),
            (
                "PreparedContext 按 Scope、相关性和预算组织引用。",
                "PreparedContext selects cited evidence by Scope, relevance and budget.",
            ),
        ),
        (
            ("04 交接工作", "04 Hand off work"),
            ("Handoff 携带目标、进展、阻塞与下一步。", "Handoff carries the goal, progress, blockers and next step."),
        ),
        (
            ("05 审核复用", "05 Review for reuse"),
            ("经验与技能候选经审核后服务未来任务。", "Reviewed Experience and Skill candidates support future tasks."),
        ),
    ],
)
add(
    R,
    "figure-11",
    ("LoCoMo：相对完整上下文基线", "LoCoMo: versus full context"),
    [
        (("+37.88 个百分点", "+37.88 percentage points"), ("问答准确率提高。", "Higher question-answering accuracy.")),
        (("约 −91.9%", "About −91.9%"), ("搜索 p95 延迟降低。", "Lower search p95 latency.")),
        (
            ("约 −93.7%", "About −93.7%"),
            ("单题回答 Token 减少；不代表系统总成本。", "Fewer answer tokens per question; not total system cost."),
        ),
    ],
)
add(
    R,
    "figure-13",
    ("SWE-bench Pro：完成更多任务", "SWE-bench Pro: more tasks resolved"),
    [
        (("关闭 PowerContext", "PowerContext OFF"), ("602 / 731 个任务完成。", "602 / 731 tasks resolved.")),
        (("开启 PowerContext", "PowerContext ON"), ("634 / 731 个任务完成。", "634 / 731 tasks resolved.")),
        (
            ("净增 32 个任务", "+32 tasks"),
            ("任务解决率增加 4.38 个百分点。", "Resolution rate increases by 4.38 percentage points."),
        ),
    ],
    (
        "此配置下的整体结果，不单独衡量 Handoff 的贡献。",
        "System-level results for this configuration; not an isolated Handoff measurement.",
    ),
)
add(
    R,
    "figure-14",
    ("三个功能验收步骤", "Three functional acceptance checks"),
    [
        (
            ("01 保存判断", "01 Save a decision"),
            ("明确保存约束，检查结果及来源。", "Explicitly save a constraint; check the result and sources."),
        ),
        (
            ("02 跨会话召回", "02 Recall in a new session"),
            (
                "同一 Scope 下召回，并与当前环境核对。",
                "Recall under the same Scope and verify against the current environment.",
            ),
        ),
        (
            ("03 交接工作", "03 Hand off unfinished work"),
            (
                "提交准确版本；接手者核对代码、证据与权限。",
                "Commit an exact version; the recipient checks code, evidence and permissions.",
            ),
        ),
    ],
)
add(
    R,
    "figure-15",
    ("开源上下文基础设施", "Open context infrastructure"),
    [
        (
            ("可检查", "Inspectable"),
            ("了解存了什么、为何召回、谁修改过。", "Inspect what was saved, why it was recalled and who changed it."),
        ),
        (
            ("可扩展", "Extensible"),
            ("扩展集成、测试、评测与工作流程。", "Extend integrations, tests, evaluations and workflows."),
        ),
        (
            ("可携带", "Portable"),
            (
                "上下文独立于会话，迁移过程可检查。",
                "Context is independent of a session and migration can be inspected.",
            ),
        ),
    ],
)
add(
    R,
    "figure-16",
    ("从这里继续", "Continue from here"),
    [
        (("已验证", "Verified"), ("明确结论与支持它的证据。", "Make conclusions and supporting evidence explicit.")),
        (
            ("待解决", "Unresolved"),
            ("开放问题保持可见，不写成已完成。", "Keep open questions visible instead of marking them complete."),
        ),
        (
            ("下一步", "Next step"),
            ("人或 Agent 核对当前状态，再继续工作。", "A person or agent checks the current state, then continues."),
        ),
    ],
)
add(
    D,
    "cordis-plugin-tree",
    ("能力通过插件组合", "Capabilities compose through plugins"),
    [
        (("Harness", "Harness"), ("Cordis 内核组合插件能力。", "The Cordis kernel composes plugin capabilities.")),
        (
            ("模型与工具", "Models and tools"),
            (
                "模型适配器负责路由；工具通过 defineTool 注册。",
                "Model adapters route requests; tools register through defineTool.",
            ),
        ),
        (
            ("会话与界面", "Sessions and UI"),
            ("工作区、会话与 Web 界面各自作为插件。", "Workspace, sessions and the web interface are plugins."),
        ),
        (
            ("powercontext-dsh", "powercontext-dsh"),
            ("提供项目记忆召回与工作交接能力。", "Provides project-memory recall and handoff capabilities."),
        ),
    ],
)
add(
    D,
    "two-process-architecture",
    ("两个进程，通过 HTTP 连接", "Two processes connected over HTTP"),
    [
        (
            ("浏览器", "Browser"),
            (
                "使用本地 Harness 界面，不直接调用 Server。",
                "Uses the local Harness UI; does not call the Server directly.",
            ),
        ),
        (
            ("powercontext-dsh", "powercontext-dsh"),
            (
                "Node 适配器调用 prepare_context、capture_source 和 pc_* 工具。",
                "The Node adapter calls prepare_context, capture_source and pc_* tools.",
            ),
        ),
        (
            ("PowerContext Server", "PowerContext Server"),
            (
                "独立 Python 进程通过 HTTP /v1 提供记忆与检索。",
                "An independent Python process serves memory and retrieval over HTTP /v1.",
            ),
        ),
    ],
)
add(
    D,
    "recall-timeline",
    ("每轮模型调用前的召回与采集", "Recall and capture before a model step"),
    [
        (("01 用户输入", "01 User message"), ("用户消息进入 Harness。", "The user message enters Harness.")),
        (
            ("02 prepare_context", "02 prepare_context"),
            ("从 Server 获取有预算边界的上下文。", "Fetch bounded context from the Server."),
        ),
        (
            ("03 注入证据", "03 Inject evidence"),
            (
                "将召回内容作为不可信历史，不作为指令。",
                "Treat recalled content as untrusted history, not instructions.",
            ),
        ),
        (
            ("04 capture_source", "04 capture_source"),
            ("将用户输入作为 Source 保存。", "Store the user input as Source."),
        ),
        (
            ("05 按需使用记忆", "05 Use memory when needed"),
            (
                "模型通过 pc_remember / pc_search 显式读写。",
                "The model explicitly reads or writes through pc_remember / pc_search.",
            ),
        ),
    ],
)


def units(s):
    return sum(2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in s)


def wrap(s, limit):
    lines, line = [], ""
    # Preserve English words and wrap Chinese at character boundaries.
    import re

    for token in re.findall(r"[A-Za-z0-9_./+%*-]+|.", s):
        if line and units(line + token) > limit:
            lines.append(line.strip())
            line = ""
        line += token
    if line.strip():
        lines.append(line.strip())
    return lines


def render(folder, name, titles, cards, footers):
    cols = 2 if len(cards) % 2 == 0 or len(cards) > 3 else 3
    width = (904 - (cols - 1) * 24) / cols
    limit = int((width - 48) / 11)
    paired = [[(wrap(t[i], limit), wrap(b[i], limit)) for t, b in cards] for i in range(2)]
    rows = (len(cards) + cols - 1) // cols
    heights = []
    for row in range(rows):
        heights.append(
            max(80 + len(t) * 30 + len(b) * 29 for edition in paired for t, b in edition[row * cols : (row + 1) * cols])
        )
    height = 174 + sum(heights) + (rows - 1) * 24 + 82
    for idx, lang in enumerate(("zh", "en")):
        parts = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="{height}" viewBox="0 0 1000 {height}" lang="{lang}" role="img" aria-labelledby="title"><title id="title">{escape(titles[idx])}</title><rect width="1000" height="{height}" rx="18" fill="#f7f5ef"/><style>text{{font-family:Arial,"PingFang SC","Microsoft YaHei",sans-serif;fill:#14213a}}</style>'
        ]

        def text(x, y, s, size=21, weight=400, color="#14213a", parts=parts):
            parts.append(
                f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" style="fill:{color}">{escape(s)}</text>'
            )

        text(48, 43, "PowerContext", 18, 700, "#1769d2")
        for i, line in enumerate(wrap(titles[idx], 52)):
            text(48, 88 + i * 38, line, 30, 700)
        y = 156
        for row, h in enumerate(heights):
            for col, (ts, bs) in enumerate(paired[idx][row * cols : (row + 1) * cols]):
                x = 48 + col * (width + 24)
                parts.append(
                    f'<rect x="{x}" y="{y}" width="{width}" height="{h}" rx="14" fill="white" stroke="#cbd3dc"/>'
                )
                for j, line in enumerate(ts):
                    text(x + 24, y + 42 + j * 30, line, 22, 700, "#1769d2")
                for j, line in enumerate(bs):
                    text(x + 24, y + 64 + len(ts) * 30 + j * 29, line, 20)
            y += h + 24
        for i, line in enumerate(wrap(footers[idx], 100)):
            text(48, y + 12 + i * 25, line, 16, color="#5c6a7c")
        parts.append("</svg>")
        (ROOT / f"docs/assets/blog/{folder}/{name}.{lang}.svg").write_text("\n".join(parts) + "\n")


def charts():
    # Value tables avoid misleading shared axes for unlike units.
    for name, titles, headers, rows, footers in [
        (
            "figure-10",
            ("LoCoMo：准确率、延迟与回答用量", "LoCoMo: accuracy, latency and answer usage"),
            [
                ("配置", "Configuration"),
                ("准确率", "Accuracy"),
                ("搜索 p95", "Search p95"),
                ("回答 Token / 题", "Answer tokens / question"),
            ],
            [
                [("PowerContext", "PowerContext"), "90.78%", "1.38 s", "≈ 1.65k"],
                [("PowerMem", "PowerMem"), "87.79%", "1.44 s", "≈ 0.9k"],
                [("完整上下文", "Full context"), "52.9%", "17.12 s", "26k"],
            ],
            (
                "1,540 道计分题；回答 Token 不包含记忆提取、存储和检索的总成本。",
                "1,540 scored questions; answer tokens exclude extraction, storage and retrieval costs.",
            ),
        ),
        (
            "figure-12",
            ("SWE-bench Pro：任务解决率", "SWE-bench Pro: task resolution rate"),
            [
                ("配置", "Configuration"),
                ("完成任务", "Resolved"),
                ("解决率", "Resolution rate"),
                ("相对关闭状态", "Versus OFF"),
            ],
            [
                [("关闭 PowerContext", "PowerContext OFF"), "602 / 731", "82.35%", "—"],
                [("开启 PowerContext", "PowerContext ON"), "634 / 731", "86.73%", "+32"],
                [("差异", "Difference"), "+32", ("+4.38 个百分点", "+4.38 pp"), "—"],
            ],
            (
                "public v2 · Codex · gpt-5.6-sol · medium；系统整体结果，非官方榜单提交。",
                "public v2 · Codex · gpt-5.6-sol · medium; system-level results, not an official leaderboard submission.",
            ),
        ),
    ]:
        for idx, lang in enumerate(("zh", "en")):
            p = [
                f'<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="490" viewBox="0 0 1000 490" lang="{lang}" role="img" aria-labelledby="title"><title id="title">{escape(titles[idx])}</title><rect width="1000" height="490" rx="18" fill="#f7f5ef"/><style>text{{font-family:Arial,"PingFang SC",sans-serif;fill:#14213a}}</style>'
            ]

            def text(x, y, s, size=21, p=p):
                p.append(f'<text x="{x}" y="{y}" font-size="{size}">{escape(s)}</text>')

            text(48, 44, "PowerContext", 18)
            text(48, 95, titles[idx], 30)
            xs = [48, 330, 510, 720]
            for x, h in zip(xs, headers, strict=True):
                text(x, 157, h[idx], 18)
            for j, row in enumerate(rows):
                y = 211 + j * 71
                p.append(f'<path d="M 48 {y + 25} H 952" stroke="#cbd3dc"/>')
                for x, v in zip(xs, row, strict=True):
                    text(x, y, v[idx] if isinstance(v, tuple) else v)
            for i, line in enumerate(wrap(footers[idx], 104)):
                text(48, 431 + i * 24, line, 16)
            p.append("</svg>")
            (ROOT / f"docs/assets/blog/{R}/{name}.{lang}.svg").write_text("\n".join(p) + "\n")


if __name__ == "__main__":
    for figure in FIGURES:
        render(*figure)
    charts()
