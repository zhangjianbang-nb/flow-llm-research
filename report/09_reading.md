## 第九章 阅读清单：从三小时到三周

> 这份报告引用了 30 多篇论文。全读一遍不现实，也没有必要。这一章给三条阅读路径：三小时（决策者）、一天（工程师）、三周（研究者）。每条路径只列「必读」和「选读」，并说明「读它是为了回答什么问题」。

### 9.1 三条路径

**路径 A：三小时（决策者 / 产品负责人）**

1. 本报告第 0 章（结论）+ 第 1 章（为什么是现在）+ 第 4 章（实验）+ 第 8 章（判断与建议）。
2. FMLM 摘要 + 表 1（一步生成的数字）。
3. Lafa 摘要 + 表 2/表 8（8B 的质量-吞吐）。
4. DiffusionGemma 摘要（25B MoE、256 画布、1500 TPS）。

目标：能在会议上回答「这条路线值不值得投」「风险在哪」「多久能看到结果」。

**路径 B：一天（工程师 / 算法工程师）**

1. 第 2 章（理论）+ 第 4 章（实验）+ 第 5 章（架构）+ 第 7 章（工程）。
2. FMLM 全文（重点：第 3 节方法、第 5 节消融）。
3. FS-DFM 全文（重点：步数感知、8 步 vs 1024 步）。
4. Lafa 全文（重点：块级分解、异步时间、自投机、消融表）。
5. 第 10 章附录 A（数学推导）+ 附录 D（伪代码）。

目标：能画出 FlowGemma 的数据流，能估计 TPF/TPS，能判断「哪个 kernel 必须先写」。

**路径 C：三周（研究者）**

1. 第 2 章 + 第 3 章 + 第 10 章附录 A/B/C。
2. 五篇必读全文：FMLM、FS-DFM、Logit-KL、General Discrete Paths、Transition Matching。
3. 九篇新证据：Lafa、RePlaid、LangFlow、S-FLM、Categorical Flow Maps、DBTM、ELF-REG、TTCD、FMLM★/aFMLM/Posterior Refinement。
4. 背景：DDPM、Score SDE、Flow Matching、Stochastic Interpolants、Consistency Models。
5. 代码：FMLM、FS-DFM、Lafa、Posterior Refinement。

目标：能独立复现一个少步流模型，能指出论文的假设漏洞，能设计自己的消融。

### 9.2 必读五篇

| 论文 | arXiv | venue | 为什么读 | 读什么 | 代码 |
|---|---|---|---|---|---|
| FMLM | 2602.16813 | NeurIPS 2026 | 一步生成的最强证据；two-time denoiser + 时间重参数化 | 第 3 节方法、第 5 节消融、表 1 | `github.com/david3684/flm` |
| FS-DFM | 2509.20624 | ICLR 2026 | 少步离散流；步数感知 + RK-4 shortcut | 第 3 节、表 1/表 2 | `github.com/apple/ml-fs-dfm` |
| Logit-KL | 2411.16821 | ICLR 2026 | logit 空间的 KL 测地线；几何选择的重要性 | 第 3 节、表 1/表 4 | 论文附带 |
| General Discrete Paths | 2412.03487 | ICLR 2025 | 任意离散路径 + kinetic-optimal 速度 | 第 2–3 节、Wikitext/FID 表 | 论文附带 |
| Transition Matching | 2506.23589 | NeurIPS 2025 | 统一扩散/流/连续 AR 的框架 | 第 2–4 节 | 论文附带 |

### 9.3 新证据九篇（2026）

| 论文 | arXiv | 日期 | 一句话 | 优先级 |
|---|---|---|---|---|
| Lafa | 2610.28559 | 2026-10 | 8B 块级连续流，2.54× AR 吞吐 | **最高** |
| RePlaid | 2605.18530 | 2026-05 | 连续扩散的第一个缩放律，与 AR 差 20× 算力 | 高 |
| LangFlow | 2604.11748 | 2026-04 | 嵌入空间连续扩散，Gen PPL 92.3/36.5 | 高 |
| S-FLM | 2605.11125 | 2026-05 | 超球面上的流，避免 one-hot 高维 | 中 |
| Categorical Flow Maps | 2602.12233 | 2026-02 | 分类数据的少步流映射，一步生成 | 中 |
| DBTM | 2609.15903 | 2026-09 | 无教师的一步传输，训练成本低 | 中 |
| ELF-REG | 2609.29102 | 2026-09 | 连续扩散到 GSM8K/MATH/HumanEval | 中 |
| TTCD | 2607.14106 | 2026-07 | per-token 时间，160M 模型 | 低 |
| FMLM★ / aFMLM / Posterior Refinement | 2607.00714 / 2610.42018 / 2606.24773 | 2026-06–10 | 一步生成的稳定性：不动点、异步、后验修正 | 中高 |

### 9.4 背景与工具

| 主题 | 论文 | arXiv | 为什么读 |
|---|---|---|---|
| DDPM | Denoising Diffusion Probabilistic Models | 2006.11239 | 扩散的起点；理解「噪声 → 数据」 |
| Score SDE | Score-Based Generative Modeling through SDEs | 2011.13456 | 连续时间的扩散；得分匹配 |
| Flow Matching | Flow Matching for Generative Modeling | 2210.02747 | 流匹配的原始论文 |
| Conditional Flow Matching | Flow Matching for Generative Modeling (CFM) | 2302.00482 | 条件流匹配；训练目标 |
| Stochastic Interpolants | Stochastic Interpolants | 2209.03003 | 插值路径的一般框架 |
| Consistency Models | Consistency Models | 2303.01469 | 一步/少步蒸馏的前身 |
| Speculative Decoding | Fast Inference from Transformers via Speculative Decoding | 2211.17192 | 投机解码的原始论文 |
| Medusa | Medusa: Simple LLM Inference Acceleration | 2401.10774 | 多头投机 |
| EAGLE | EAGLE: Speculative Sampling Requires Rethinking Feature Uncertainty | 2401.15077 | 特征级投机 |
| DeepSeek-V3 / MTP | DeepSeek-V3 Technical Report | 2412.19437 | 多 token 预测的工程实现 |
| MDLM | Simple and Effective Masked Diffusion Language Models | 2406.07524 | 离散扩散的强基线 |
| SEDD | Discrete Diffusion Modeling by Estimating the Ratios of the Data Distribution | 2310.16834 | 离散扩散的得分视角 |
| DiffusionGemma | DiffusionGemma Technical Report | 2608.00146 | 25B MoE + 256 画布 + 1500 TPS |

> 注意：MDLM 的 arXiv 标题在不同版本中有差异；引用时以 arXiv 页面为准。上表的「为什么读」是阅读目的，不是论文的完整贡献。

### 9.5 综述与地图

- **A Survey of Diffusion Language Models**（alphaXiv，2026-11-08，37 页，139 篇）：目前最全的 DLM 地图；适合先看「有哪些分支」，再挑论文。
- **本报告第 2 章**：把「似然/得分/速度」「离散/连续」「扩散/流/Transition Matching」三组坐标画成一张图；适合作为读论文前的框架。
- **Lafa 的 related work**：把「块级并行」「连续流」「自投机」三条线的历史梳理得比较清楚；适合作为 2026 年的入口。

### 9.6 代码与模型

| 项目 | 链接 | 用途 |
|---|---|---|
| FMLM | `github.com/david3684/flm` | 一步流模型；two-time denoiser |
| FS-DFM | `github.com/apple/ml-fs-dfm` | 少步离散流；步数感知 |
| Lafa | `github.com/lafa-gh/large-flow-lms` | 8B 块级流；训练/推理配方 |
| Lafa 模型 | `huggingface.co/lafa-hf/models` | 0.5B/7B/8B checkpoint |
| Posterior Refinement | `github.com/MananAg007/posterior-refinement` | 一步生成 + 后验修正 |
| DiffusionGemma | vLLM/HF 参考实现 | 25B MoE 离散扩散推理 |

### 9.7 还没被回答的问题

读论文时，最容易犯的错是把「论文没说的」当成「论文证明了」。以下问题，目前没有公开答案：

1. **长上下文**：块级流在 32k/128k 上会不会因为 KV 读取而失去吞吐优势？没有公开 benchmark。
2. **多模态**：图像 token 能不能进流块？还是只能做前缀？没有公开证据。
3. **RL 后训练**：流模型的 RLHF/DPO 怎么做？奖励是序列级的，流是块级的，credit assignment 更难。
4. **MoE 路由**：去噪状态下的路由稳定性，只有 Lafa 的稠密实验，没有 MoE 公开数据。
5. **1 步质量**：FMLM 的一步 PPL 很好，但 TV/熵塌缩的风险没有系统评估；第 4 章的 N=1 实验是一个警告。
6. **评估口径**：TPF/TPS 的报告方式不统一；很多论文不报验证成本、不报 batch/长度。
7. **复现**：Lafa 是 preprint；FS-DFM/FMLM 的代码是否能在非 H100 硬件上复现，没有公开报告。

> **工匠笔记 9：读论文时，先看「它没测什么」。** 一篇论文的贡献在「它测了什么」，但它的边界在「它没测什么」。FlowGemma 的提案，就是把这些「没测什么」变成 E1/E2/E3 的实验项。

---
