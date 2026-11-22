## 第三章 五篇必读，以及 2026 年必须知道的九篇新证据

> 想象一条走廊，尽头有五扇门。第一扇门写着「一步生成」（FMLM），第二扇写着「少步离散流」（FS-DFM），第三扇写着「logit 几何」（Logit-KL），第四扇写着「任意路径」（General Discrete Paths），第五扇写着「统一框架」（Transition Matching）。推开每一扇门，你都会看到同一件事的不同侧面：如何让多个 token 在一次前向里一起变得正确。2026 年，走廊尽头又开了九扇新门，其中最重要的一扇叫 Lafa——它第一次把「块级连续流」做到了 8B。

### 3.1 FMLM：一步生成，连续去噪

**论文**：Flow Map Language Models: One-step Language Modeling via Continuous Denoising（Lee, Yoo, Agarwal, Shah, Huang, Raghunathan, Hong, Boffi, Kim；arXiv:2602.16813v3；NeurIPS 2026；KAIST + CMU；代码 `github.com/david3684/flm`，项目页 `one-step-lm.github.io`）。

**它解决什么问题**：离散扩散在少步 regime 下质量崩得厉害。FMLM 问：如果把状态换成 one-hot 连续向量，能不能既保留「并行生成」，又让少步生成的质量超过离散扩散？

**核心想法**：在 one-hot 嵌入空间做流匹配，学习一个 two-time denoiser，把「多步 ODE」蒸馏成「一步映射」。具体来说：

- 状态 $x_t\in\mathbb R^{L\times |V|}$，数据端点是 one-hot $e_y$，噪声是高斯。
- 模型输出单纯形上的去噪分布 $D_t(x)$，速度由 $v_t(x)=(D_t(x)E-x)/(1-t)$ 给出。
- 用时间重参数化 $\tau(t)=1-\frac{|V|}{|V|-1}P_e(t)$ 把「解码错误率」映射到「流时间」，并在边界留 $p=1/32$ 的质量。
- 用 two-time denoiser $\delta_{s,t}(x)$ 做流映射：对角项匹配教师，非对角项匹配两个短学生的组合（semigroup KL）。

**关键数字**（LM1B / OWT，Gen PPL 越低越好）：

| 方法 | LM1B 1 步 | LM1B 2 步 | LM1B 4 步 | OWT 1 步 | OWT 2 步 | OWT 4 步 |
|---|---:|---:|---:|---:|---:|---:|
| 离散蒸馏最强基线（Duo+Di4C） | 292.94 | 247.69 | 150.67 | 370.51 | — | — |
| FMLM | **119.34** | **110.19** | **98.76** | **168.30** | **133.29** | **111.31** |
| FMLM 1024 步（参考） | 96.91 | — | — | 62.23 | — | — |

一步生成已经超过离散蒸馏最强基线 2.4×（LM1B）和 2.2×（OWT）；两步、四步继续提升。条件生成的一步 PPL 是 141.66，对比离散基线 374.70。

**消融告诉我们什么**：

- **one-hot vs 学习嵌入**：one-hot 130.42，学习嵌入 324.66。在 FMLM 的设置里，one-hot 的「高维但线性可分」比「低维但学出来的嵌入」更好；这与 Lafa 选择预训练嵌入、冻结范数的做法不同，说明嵌入空间的选择高度依赖训练配方。
- **simplex vs Euclidean**：simplex 85.07（熵 3.76）vs Euclidean 96.91（熵 4.29）。simplex 的 PPL 更好，但熵塌缩更严重，需要熵正则。
- **时间重参数化**：无重参数化 149.18，解码错误率重参数化 106.98。时间怎么走，比「走多少步」更重要。
- **边界概率**：无边界 142.61，$p=1/32$ 119.34。$t\to 1$ 的数值奇点不是小事。

**代价**：one-hot 状态是 $O(L|V|)$ 的内存和时间；论文测得比 embedding diffusion 高约 **30%** 的训练时间和显存；two-model flow map 在推理时**显存翻倍**。这就是为什么后来的 Lafa 改用低维嵌入。

**局限**：1 步与 4 步仍有差距；长序列的 $O(L|V|)$ 成本高；条件生成的因子化近似仍在。

### 3.2 FS-DFM：让「步数」成为训练时的显式变量

**论文**：FS-DFM: Fast and Accurate Long Text Generation with Few-Step Diffusion Language Models（Monsefi, Bhendawade, Ciosici, Culver, Zhang, Belousova；Apple + Ohio State；arXiv:2509.20624v5；ICLR 2026；代码 `github.com/apple/ml-fs-dfm`）。

**它解决什么问题**：离散流模型通常要几百到上千步才能达到好质量。FS-DFM 问：能不能训练一个「知道自己只有 8 步」的模型？

**核心想法**：把采样步数 $h$ 作为条件输入，模型学习「在 $h$ 步预算下，当前时刻应该更新多少」。它用一个累积标量更新（cumulative scalar update）控制每个 token 的进度，并用 RK-4 shortcut teacher 和 EMA teacher 做少步蒸馏。数据侧用 1024-token 块 + 512-token 前缀，保证长文本一致性。

**关键数字**：

| NFE | 基线 DFM PPL | FS-DFM PPL |
|---:|---:|---:|
| 1 | 1312.65 | **514.40** |
| 2 | 462.31 | **333.07** |
| 4 | 194.29 | **176.19** |
| 8 | 97.51 | **90.49** |
| 1024 | 85.61 | 87.36 |

8 步就达到 1024 步基线的质量（90.49 vs 85.61，差距很小），最多 128× 加速。8 步 PPL 在 0.17B/1.3B/1.7B 上分别是 75.78/70.97/72.84；**uniform source 比 mask source 更好**，这是一个反直觉但重要的发现：离散流的源分布不一定要用 mask。

**局限**：它仍是离散状态、逐位置分类；「步数感知」缓解了少步误差，但没有消除联合建模的问题。

### 3.3 Logit-KL：在 logit 空间走测地线

**论文**：Logit-KL Flow Matching: Non-Autoregressive Text Generation via Sampling-Hybrid Inference（Sevriugov, Dragunov, Razzhigaev, Kuznetsov, Oseledets；arXiv:2411.16821v5；ICLR 2026）。

**它解决什么问题**：连续流在概率空间里的插值不一定几何合理。Logit-KL 问：如果我们在 logit 空间做「KL 测地线」插值，会不会更好？

**核心想法**：KL 散度下的测地线对应 logit 空间的线性插值。于是可以定义一个既有几何意义、又有闭式速度的流。推理时有三种模式：确定性（取 argmax）、采样（按概率采样）、混合（确定性 + 采样）。这让它既能做高质量生成，也能做多样性采样。

**关键数字**：

- 150M 模型，1024 NFE，PPL：线性插值 1344（Llama2 分词）/15418（GPT3）/13881（GPT2）；Fisher–Rao 192/298/379；**KL-Flow 41/53/62**。
- 1.5B 模型，256/512/1024 NFE：51.5/41.7/32.7（Llama2）；81.1/63.7/48.4（GPT3）；96.6/76.2/58.5（GPT2）。
- 条件生成 BLEU 9.5 vs DFM 8.1；代码填充 Pass@1 17.4 vs 11.1（10% masking）。

**局限**：条件分布仍然是因子化的近似；它证明了「几何选择」很重要，但没有解决「联合采样」的问题。

### 3.4 General Discrete Paths：任意腐蚀过程，都能变成流

**论文**：Flow Matching with General Discrete Paths: A Kinetic-Optimal Perspective（Shaul, Gat, Havasi, Severo, Sriram, Holderrieth, Karrer, Lipman, Chen；arXiv:2412.03487；ICLR 2025）。

**它解决什么问题**：离散扩散大多只会 masking。能不能设计任意的离散概率路径（uniform、insert-delete、词表替换），并得到相应的流？

**核心想法**：在 CTMC 上定义任意概率路径 $p_t$，通过最小化对称动能，构造一个与路径解耦的速度场。这个速度场是「kinetic-optimal」的：在给定路径下，它是最省力的传输方式。

**关键数字**：Wikitext103 PPL 41.83 vs SEDD 42.88；图像 FID 4.50 vs 5.72。它把「离散流」的设计空间从「masking」扩展到了「任意 corruption」，为后来的 FS-DFM、Logit-KL、Transition Matching 提供了理论基础。

### 3.5 Transition Matching：把扩散、流、连续 AR 放进同一个框架

**论文**：Transition Matching: Scalable and Flexible Generative Modeling（Shaul, Singer, Gat, Lipman；arXiv:2506.23589；NeurIPS 2025）。

**它解决什么问题**：扩散/流和连续 AR 看起来是两种东西，能不能统一？

**核心想法**：把生成拆成离散时间的连续状态马尔可夫转移；每个转移可以是非确定性的、可以是任意非连续的时间表。DTM（Diffusion Transition Matching）、ARTM（Autoregressive Transition Matching）、FHTM（Flow/Hybrid Transition Matching）是三个变体。它证明了扩散/流是「所有位置一起转移」的特例，连续 AR 是「每次只转移一个位置」的特例。

**意义**：它给了我们一个「设计空间坐标系」：你可以选择「一次转移多少位置」「转移是否连续」「时间是否连续」。FlowGemma 的块级流，本质上是「一次转移一个块、连续状态、连续时间」的一个点。

**局限**：论文主要在图像和 text-to-image 上评估，没有给出与 Lafa 同规模的文本 LM 对照。

### 3.6 2026 年的九篇新证据

#### 3.6.1 Lafa：8B 块级流，第一次把「规模」跑通

**论文**：Large Flow Language Models（Chavan, Lee, Bamba, Yoo, Hong, Raghunathan, Kim；arXiv:2610.28559v1；2026-10-20；代码 `github.com/lafa-gh/large-flow-lms`，模型 `huggingface.co/lafa-hf/models`）。

Lafa 是本报告最重要的工程证据。它的设计几乎就是 FlowGemma 的「稠密版」：

- **块级分解**：$p(y\mid c)=\prod_r p(y^{rB+1:(r+1)B}\mid c,y^{\le rB})$，块间因果，块内双向。
- **嵌入流**：用预训练词嵌入 $E\in\mathbb R^{|V|\times d}$ 代替 one-hot，把每 token 维度从 $|V|$ 降到 $d$；嵌入与前缀共享，**冻结范数、只学方向**。
- **异步时间**：每个位置有自己的 $\tau^i(t)$，靠左的 token 走得更快，匹配文本的方向性。
- **训练**：从 Qwen2.5 Instruct 0.5B/7B、Qwen3 8B Base 适配；Dolci-Instruct-SFT 5–15 epochs（9–27B tokens）；总训练 token <30B，比 Dream/LLaDA/Efficient-DLM 少至少 18×。
- **推理**：前缀 KV cache 跨步、跨块复用；块级并行解码；flow map 蒸馏到 1/few-step；**自投机验证**——用同一个模型的 AR 头验证流草稿，提交最长通过前缀。

**关键数字**：

| 规模 | 方法 | 平均准确率（6 benchmark） | TPF |
|---|---|---:|---:|
| 0.5B | AR SFT | 28.7 | 1.0 |
| 0.5B | Lafa B=4 | 31.6 | 2.9 |
| 0.5B | Lafa B=8 | 32.3 | 4.0 |
| 0.5B | Lafa B=16 | 30.8 | 5.0 |
| 7B | AR SFT | 58.4 | 1.0 |
| 7B | Lafa B=4 | 60.9 | 2.6 |
| 7B | Lafa B=8 | 59.3 | 4.3 |
| 7B | Lafa B=16 | 58.0 | 4.9 |
| 8B | AR SFT | 56.8 | 1.0 |
| 8B | Lafa B=4 | 63.1 | 2.9 |

在单张 H100、batch=1、bf16 下，Lafa 7B 的吞吐：

| 方法 | 平均准确率 | TPS |
|---|---:|---:|
| AR SFT | 73.9 | 39.5 |
| DeepSeek-MTP | 76.3 | 53.6 |
| MARS B=4 | 76.1 | 48.4 |
| Fast-dLLM v2 B=16 | 65.1 | 86.7 |
| Lafa B=4 | 76.5 | 79.9 |
| Lafa B=8 | 76.3 | 93.8 |
| Lafa B=16 | 74.5 | **100.2** |

B=16 时是 AR 的 **2.54×** 吞吐，准确率只低 1.4 个点；B=4 时约 2× 吞吐，准确率反而更高。这是「质量-吞吐帕累托」上第一次有连续流模型明确压过 MTP 和离散扩散基线。

**消融**（0.5B，B=4，32 Euler 步）非常关键：

| 配置 | 平均准确率 |
|---|---:|
| 完全因果注意力 | 32.7 |
| 块内双向注意力 | **38.0** |
| 同步时间 | 36.2 |
| 异步 tokenwise 时间 | **38.0** |
| 冻结嵌入 | 34.4 |
| 无约束嵌入 | 36.9 |
| 范数冻结嵌入 | **38.0** |
| 仅去噪 CE | 33.6 |
| 仅去噪 MSE | 29.7 |
| CE + MSE | 35.8 |
| CE + MSE + AR | **38.0** |
| 无 self-conditioning | 32.3 |
| 有 self-conditioning | 38.1 |
| 无 guidance | 34.3 |
| prefix guidance | 38.1 |

这张表说明：**块内双向、异步时间、范数冻结、CE+MSE+AR 联合损失、self-conditioning、prefix guidance**，每一个都不是装饰。尤其是「完全因果 32.7 → 块内双向 38.0」，+5.3 个点，直接验证了第 2 章的「联合」论点。

**局限**：Lafa 是 2026-10 的 preprint，尚未经过同行评审；长上下文、多模态、RL 后训练都没有验证；8B 只在 B=4 上报告了主结果；TPF 和 TPS 是在特定 H100 配置下测得，不能直接外推到其他硬件。

#### 3.6.2 RePlaid：连续扩散的第一个缩放律

**论文**：Continuous Diffusion Scales Competitively with Discrete Diffusion for Language（Yang, Guo, Zhang, Sahoo, Chen, Vahdat, Mardani, Thickstun；arXiv:2605.18530；NeurIPS 2026）。

RePlaid 把 Plaid 的架构对齐到现代离散 DLM，得到第一个能与离散扩散竞争的连续扩散缩放律：与 AR 的算力差距只有 **20×**（离散扩散通常更大），在 OWT 上达到连续 DLM 的新 SOTA PPL bound **22.1**，用更少参数超过 Duo，在 over-trained regime 超过 MDLM。它还从理论上说明：优化噪声 schedule 以最小化 ELBO 方差，会自然得到「线性交叉熵随 time 变化」，不需要 case-specific 时间重参数化。

**意义**：它反驳了「连续扩散不可缩放」的偏见。但它用的是 likelihood-based 训练，和 FMLM/Lafa 的 flow matching 路线不同；20× 算力差距仍然很大。

#### 3.6.3 LangFlow：嵌入空间连续扩散，生成 PPL 92.3/36.5

**论文**：LangFlow: Continuous Diffusion Rivals Discrete in Language Modeling（Chen, Liang, Sui, Guo, Cheng, You, Liu；arXiv:2604.11748；NeurIPS 2026）。

LangFlow 把嵌入空间 DLM 和 flow matching 连起来，提出三个组件：ODE-based NLL bound（用于原则性评估）、information-uniform 噪声 schedule（用 Gumbel 参数化可学习 scheduler）、self-conditioning。它在 LM1B 上 Gen PPL **92.3**，OWT **36.5**，与最强离散 DLM 竞争，并在 Sudoku 推理上超过离散对手。

**意义**：它证明「连续 + 嵌入空间」不仅能做少步，也能在似然和推理任务上竞争。它的 self-conditioning 分析与 FMLM★ 的 fixed-point 视角互相印证。

#### 3.6.4 S-FLM：超球面上的流

**论文**：Language Modeling with Hyperspherical Flows（Deschenaux, Gulcehre；arXiv:2605.11125）。

S-FLM 把状态放在超球面 $\mathbb S^{d-1}$ 上，用旋转（rotation）代替平移，避免 one-hot 的高维开销，并用 cross-entropy 训练速度场。它在大词表推理任务上明显改善连续流，缩小了与 masked diffusion 的差距；但在标准温度 $T=1$ 下仍有 gap。

**意义**：状态空间的几何选择还没有定论；sphere 是一个有前途的方向，尤其适合大词表。

#### 3.6.5 Categorical Flow Maps：分类数据的少步流映射

**论文**：Categorical Flow Maps（Roos, Davis, Eijkelboom, Bronstein, Welling, Ceylan, Ambrogioni, van de Meent；arXiv:2602.12233）。

它把 flow map 定义到单纯形，用自蒸馏和端点一致性训练，在图像、分子图、文本上都拿到 SOTA 的少步结果，甚至一步生成。它说明：**flow map 不是连续高斯流独有的**；分类数据也可以在单纯形上做流映射。

#### 3.6.6 DBTM：无教师的一步传输

**论文**：Discrete Beckmann Transport Models for One-Step Language Modeling and Reasoning（Tang, Wang；arXiv:2609.15903）。

DBTM 构造一个时间无关的传输映射，证明它能一步把任意点送到单纯形顶点，并用守恒方程直接从数据训练，不需要教师蒸馏。部分训练的地图等价于「截断的流」，生成就是「迭代地图到不动点」。它在语言建模和推理任务上超过离散扩散和连续流基线。

**意义**：如果 DBTM 的假设成立，少步生成可以不再依赖「先训教师、再蒸馏」的两阶段流程，训练成本会大幅下降。但它还处于早期，需要独立复现。

#### 3.6.7 ELF-REG：连续扩散到数学与代码推理

**论文**：ELF-REG: Scaling Continuous Diffusion Language Models to Reasoning Tasks（Li, Chen, Qian, Liu, Cheng；arXiv:2609.29102）。

ELF-REG 把 Embedded Language Flows 扩展到 GSM8K、MATH-500、HumanEval、MBPP，用 REPA+REG（冻结 AR 教师监督中间特征 + 全局表示联合去噪）提升学习。它在 64 NFE 下 GSM8K pass@1 **55.96%**，128 NFE 下 MATH-500 **13.39%**、HumanEval **22.56%**；16 NFE 下 HumanEval pass@10 **41.21%**。

**意义**：连续流不再只是「困惑度好看」，它开始在可验证的推理任务上有数字。但和 AR 的差距仍然明显（GSM8K 55.96 vs 同规模 AR 通常 70%+）。

#### 3.6.8 TTCD：每 token 的时间

**论文**：Token Time Continuous Diffusion for Language Modeling（Bansal, Sanghavi；arXiv:2607.14106）。

TTCD 在连续空间做确定性映射，并引入 per-token times：有些 token 从噪声到词走得更快，有些更慢。它用 160M 模型在 OWT 上训练并自蒸馏，在高加速比下无条件生成与离散模型相当，条件生成超过若干同规模基线，Sudoku 也有提升。

**意义**：per-token time 是 Lafa 异步时间的先驱之一；它说明「不是所有位置都该以同样速度去噪」。

#### 3.6.9 FMLM★、aFMLM、Posterior Refinement：把「一步」做得更稳

- **FMLM★**（Yoo, Kim, Eijkelboom, Lee, Boffi, Hong, Kim；arXiv:2607.00714）：把 self-conditioning 解释为不动点迭代，提出 fixed-point flow，把「流过程」和「不动点迭代」拆成两个维度；用 fixed-point distillation + flow map distillation 压缩，一步/少步生成在 OWT 上超过此前的自条件模型和少步模型。
- **aFMLM**（Lee, Kim, Pynadath, Yoo, Hayakawa, Zhang, Kim, Hong；arXiv:2610.42018）：把「预测顺序」编码进异步流映射，支持 prescribed 和 learned、state-adaptive 的 schedule；一步生成在 Sudoku 和 GSM8K 代码生成上拿到 SOTA。
- **Posterior Refinement**（Agarwal, Shah, Lee, Yoo, Huang, Hong, Raghunathan, Boffi；arXiv:2606.24773；代码 `github.com/MananAg007/posterior-refinement`）：给 FMLM 加上 masking-style 噪声，得到 FMLM+；一步生成整个序列，同时给每个 token 打「全局一致性」分数，再做后验修正；用 **32× 更少的 NFE** 匹配离散基线。

**意义**：这三篇把「一步生成」从「能跑」推进到「能修」。一步生成的最大问题不是速度，而是「错了不能改」；后验修正和不动点迭代提供了「生成后还能改」的机制。

### 3.7 证据强度分级

| 论文 |  venue/状态 | 代码/权重 | 关键数字是否可核 | 我的分级 |
|---|---|---|---|---|
| FMLM | NeurIPS 2026 | 代码 + 项目页 | 是（全文表格） | A |
| FS-DFM | ICLR 2026 | 代码 | 是 | A |
| Logit-KL | ICLR 2026 | 代码 | 是 | A− |
| General Discrete Paths | ICLR 2025 | 代码 | 是 | A− |
| Transition Matching | NeurIPS 2025 | 代码 | 是 | A− |
| Lafa | arXiv 2026-10 | 代码 + 模型 | 是（全文表格） | A− |
| DiffusionGemma | 技术报告 2026-07 | 开放权重 + vLLM/HF | 是 | A |
| RePlaid | NeurIPS 2026 | 未核 | 是（摘要 + 全文） | B+ |
| LangFlow | NeurIPS 2026 | 未核 | 是（摘要 + 全文） | B+ |
| S-FLM | arXiv 2026-05 | 未核 | 部分 | B |
| Categorical Flow Maps | arXiv 2026-02 | 未核 | 部分 | B |
| DBTM | arXiv 2026-09 | 未核 | 部分 | B |
| ELF-REG | arXiv 2026-09 | 未核 | 是（摘要数字） | B |
| TTCD | arXiv 2026-05 | 未核 | 部分 | B |
| FMLM★ | arXiv 2026-07 | 代码 | 部分 | B+ |
| aFMLM | arXiv 2026-10 | 未核 | 部分 | B+ |
| Posterior Refinement | arXiv 2026-06 | 代码 | 是（摘要） | B+ |

> 分级不是学术评价，只是「这份报告敢不敢拿它的数字做工程判断」的粗略标尺。A 级表示「同行评审 + 代码 + 全文表格都能对上」；B 级表示「有数字，但没有独立复现」。Lafa 虽然是 preprint，但代码、模型、表格都公开，所以我给了 A−。

### 3.8 调研方法：数字是怎么核的

这份报告的所有关键数字都来自论文的 arXiv HTML 全文或摘要页，逐表核对；没有使用二手博客的转述。具体做法：

1. 用 `curl` 直接抓取 arXiv HTML（避开本地代理导致的 TLS 重置），保存到临时目录。
2. 用正则剥离 script/style，保留 `<math alttext>`，把表格转成纯文本。
3. 对每个关键数字，回到上下文确认「是哪个模型、哪个数据集、哪个 NFE、哪个指标」。
4. 对代码/模型链接，至少确认 URL 可访问；对无法访问的，标注「未核」。
5. 所有引用在附录 C 的核验表里列出 arXiv ID、日期、venue、代码链接。

**没有编造引用，也没有把「摘要里的一句话」当成「全文的结论」。** 凡是本报告自己的推断，都会标「本报告判断」；凡是提案，都会标「提案」。

[[FIG:fig_lafa|图 3-1　Lafa 7B 的质量-吞吐帕累托前沿。B=4 在 79.9 TPS 下平均准确率 76.5%，高于 AR 的 73.9%；B=16 到 100.2 TPS，准确率 74.5%。数据来自 Lafa 论文 Table 8，单张 H100、batch=1、bf16。]]

---
