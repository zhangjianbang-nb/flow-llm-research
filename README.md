# 从 DiffusionGemma 到 FlowGemma

**流匹配语言模型的下一步：一份可执行的技术调研**

> 方向成立，而且值得优先投入；但真正的杠杆不是「把离散换成连续」，而是「把逐位置独立提交换成整块联合传输」，再用流映射把多步压成少步，用 AR 能力做验证。

这份报告讨论 Flow Generation / Flow Matching 是否会成为 Diffusion LLM 之后的下一站，并把这个问题拆成证据、理论、玩具实验、架构提案、实验方案与工程账本六层。**FlowGemma 是报告提出的研究提案，不是已经存在的 Google 模型。**

- 正文：10 章，24,773 个汉字，9 张图，28 张表，45 处论文引用
- PDF：72 页，A4，含目录书签、页码与元数据
- 网页：单页 `index.html`，支持深色/浅色、移动端、朗读（可调音量、可静音）、图片灯箱
- 实验：一个可独立复现的三臂 oracle 玩具实验，比较离散因子化、连续对角流、连续联合流

## 三个核心结论

1. **连续流在少步生成上确实赢了离散扩散。** FMLM 在 LM1B 上一步生成 Gen PPL 119.34，当时最好的离散蒸馏基线是 292.94；FS-DFM 用 8 步达到 1024 步离散流的质量；Lafa 把 8B 块级连续流做到 2.54× AR 吞吐。
2. **连续流要真正可用，必须是「联合」的，不能是「逐位置独立」的。** 这是本报告对原方案最重要的修正。玩具实验里，连续对角流的非法混合率停在 **79.5%** 的平台，比离散扩散更糟；连续联合流在 N≥2 时是 **0%**。连续本身不解决因子化误差，块内联合才解决。
3. **FlowGemma 的工程形态是「连续联合流 + 流映射 + 块级 KV cache + AR 验证」，不是「纯流替代 AR」。** 低 batch 是流的主场，高 batch 仍是 AR 的主场；混合形态会比纯流更早落地。

## 怎么读

| 时间 | 读什么 |
|---|---|
| 3 分钟 | 打开 `index.html`，读「先给结论」「一张判断表」「一分钟版本」 |
| 30 分钟 | 读第 1、4、8 章：为什么是现在、连续 vs 离散的三臂实验、判断与路线图 |
| 3 小时 | 读第 1–5 章，跳过公式细节，抓住「联合」这条主线 |
| 3 天 | 读全文 + 第 10 章附录，按第 6 章 E0–E3 做复现计划 |
| 3 周 | 按第 9 章阅读清单读五篇必读 + 九篇 2026 新证据，复现玩具实验与 E1 |

## 文件结构

```
.
├── index.html                 # 网页版（单页，离线可开）
├── REPORT.md                  # 合并后的 Markdown 全文
├── report.pdf                 # 72 页 A4 PDF
├── report/                    # 分章 Markdown 源文件
│   ├── 00_front.md
│   ├── 01_why.md … 10_appendix.md
├── figs/                      # 9 张 SVG 图
├── assets/                    # 样式、交互、本地 KaTeX
├── experiment/
│   ├── toy_flow_vs_diffusion.mjs   # 三臂 oracle 实验
│   ├── make_figs.mjs               # 实验图
│   ├── make_diagrams.mjs           # 架构/矩阵/路线图
│   └── results.json                # 实验输出（已提交）
└── scripts/
    ├── build_site.mjs          # Markdown → index.html / REPORT.md
    ├── print_pdf.mjs           # Chrome CDP → report.pdf
    ├── finalize_pdf.py         # 页码、书签、元数据
    └── shoot.mjs               # CDP 截图辅助
```

## 本地打开

网页不依赖构建工具，直接双击 `index.html` 即可；如果浏览器对本地字体或脚本有限制，起一个静态服务器更稳：

```bash
python3 -m http.server 8765
# 打开 http://127.0.0.1:8765/
```

朗读面板在右上角「朗读」按钮：播放/暂停、停止、静音、音量滑杆、语速、中文声音选择。点击正文段落可以从该段开始读。

## 复现实验

只需要 Node.js，无第三方依赖：

```bash
node experiment/toy_flow_vs_diffusion.mjs
node experiment/make_figs.mjs
node experiment/make_diagrams.mjs
```

实验设置：6 个相关城市对、V=12、K=6、3 个随机种子 × 5,000 条序列；比较三个 oracle 去噪器（无学习误差），扫描 N=1…64 步。输出包括非法混合率、边缘 TV、后验熵与样本。

重新构建网页与 PDF：

```bash
node scripts/build_site.mjs
# 需要 Chrome 以 --remote-debugging-port=9222 启动
node scripts/print_pdf.mjs --out report.pdf
python3 scripts/finalize_pdf.py
```

## 证据与边界

- 论文数字尽量回到 arXiv HTML 全文核对；第 10 章附录 C 列出 29 条核验记录（arXiv ID、日期、venue、代码链接）。
- 报告把「证据」「推断」「猜测」分开标注；判断表的置信度是作者主观概率，不是论文结论。
- 玩具实验是 **oracle** 实验：它证明「联合有用」，不证明「联合可学、可算」。真实模型的联合后验是近似的。
- 长上下文、多模态、RL 后训练没有覆盖；MoE 路由稳定性没有公开证据。这些是 FlowGemma 二期的事。
- 论文数字来自作者环境；本报告没有独立复现 Lafa/FMLM/FS-DFM，E0 就是为补这一课设计的。

## 引用

```bibtex
@techreport{zhang2026flowgemma,
  title   = {从 DiffusionGemma 到 FlowGemma：基于 MoE Transformer 的少步并行语言生成},
  author  = {张建邦},
  year    = {2026},
  month   = {11},
  note    = {技术调研报告，72 页},
  url     = {https://github.com/zhangjianbang-nb/flow-llm-research}
}
```

## 许可

- 代码（`experiment/`、`scripts/`、`assets/app.js`）：MIT，见 `LICENSE`。
- 报告文本、图表与 PDF：CC BY 4.0，见 `LICENSE-TEXT`。

## 致谢与声明

本报告由张建邦主持调研，ZCode 执行论文核验、独立实验与撰写。FlowGemma 是待验证的架构提案；DiffusionGemma 是 Google DeepMind 的技术报告。文中所有第三方论文、模型与商标归各自作者所有。
