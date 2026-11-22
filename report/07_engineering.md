## 第七章 工程：吞吐不是算出来的，[[BR]]是「少读一遍权重」省出来的

> 低 batch 解码的瓶颈不是算力，是内存带宽。生成一个 token，GPU 要把几 GB 的权重从 HBM 读进 SM，算完再扔掉；算力单元大部分时间在等数据。这就是「内存墙」。流生成之所以在低 batch 下有机会，不是因为它「算得更快」，而是因为它**一次前向能推进多个 token**，把「读一遍权重」的成本摊到更多 token 上。这一章算清楚三笔账：KV cache 的账、TPF/TPS 的账、batch 交叉点的账。

### 7.1 一笔 roofline 账：为什么 2 步流能赢

以 25B total / 3.8B active 的 MoE 为例，bf16 权重约 **7.6GB**（active 部分）。H100 的 HBM 带宽约 **3.35TB/s**，读一遍 active 权重需要

$$
\frac{7.6\text{ GB}}{3.35\text{ TB/s}} \approx 2.3\text{ ms}.
$$

而一次块前向的计算量（32 个 token）约

$$
2\times3.8\times10^9\times32 \approx 2.4\times10^{11}\text{ FLOPs},
$$

H100 bf16 峰值约 990 TFLOPS，按 40% MFU 算，计算时间约 **0.6ms**。也就是说，**内存读取是计算的 4 倍**——典型的 memory-bound。

AR 每生成 1 个 token 要读一遍权重（2.3ms），32 个 token 要 32 次，约 **74ms**。2 步流生成 32 个 token 只要 2 次前向，约 **4.6ms** 的权重读取（加注意力/KV/通信，实际更高）。这就是「一次前向推进多个 token」的物理意义：**不是算得更快，是读得更少。**

> 注意：这是理想化的 roofline，忽略了 attention、MoE all-to-all、KV 读取、kernel 启动、批调度。真实数字会差 2–5 倍；但数量级关系成立：低 batch 下，减少「权重读取次数」是吞吐的第一杠杆。

### 7.2 KV cache 的账：前缀是资产，块是负债

KV cache 的大小（bf16）近似为：

$$
\text{KV bytes} = 2 \times L \times H_{\text{kv}} \times d_{\text{head}} \times N \times 2,
$$

其中 $L$ 是层数，$H_{\text{kv}}$ 是 KV 头数（GQA 后远小于 $H$），$d_{\text{head}}$ 是头维度，$N$ 是序列长度。按「48 层、8 个 KV 头、head_dim=128」估算（这是假设，不是 Gemma 4 的确切配置）：

- 每 token：$2\times48\times8\times128\times2 \approx 196{,}608$ bytes ≈ **192KB/token**。
- 32k 上下文：约 **6.0GB**。
- 128k 上下文：约 **24GB**。

对一个 80GB H100 来说，25B bf16 权重 50GB + 128k KV 24GB = 74GB，已经接近上限；再叠加激活和块状态，128k 需要 2 张卡或 KV 量化。**长上下文是 FlowGemma 二期的事，不是一期。**

**前缀 vs 块的成本结构**：

- **前缀 K/V**：只依赖前缀，与块内噪声无关；每个请求算一次，跨所有块、所有去噪步复用。这是「资产」。
- **块内 K/V**：每个去噪步都要重算（因为块状态在变）；块提交后，它的 K/V 追加到 cache，成为下一块的前缀。这是「负债」，但只负 B 个位置。

对 B=32、N=8k 的前缀，每个去噪步的注意力要读约 $8k\times192\text{KB}=1.5\text{GB}$ 的 KV；2 步就是 3GB，按 3.35TB/s 约 **0.9ms**。这和权重读取的 4.6ms 叠加，是低 batch 延迟的主要构成。**优化前缀 KV 的读取（FlashAttention、paged KV、GQA、KV 量化）比优化块内注意力更重要**，因为前缀远长于块。

### 7.3 TPF/TPS 的账：把「接受长度」算进分母

定义要严格，否则数字会骗人：

- **TPF（tokens per forward）** = 提交的 token 数 / 模型前向次数（包括去噪步和验证步）。
- **TPS（tokens per second）** = 提交的 token 数 / 端到端时间。

以 B=32、2 步去噪、1 次验证、接受长度 $a=28$ 为例：

$$
\text{TPF} = \frac{28}{2+1} \approx 9.3.
$$

如果 $a=32$（全部接受），TPF = 32/3 ≈ 10.7；如果 $a=16$，TPF = 16/3 ≈ 5.3。**TPF 的分母是前向次数，不是去噪步数**；验证步也要算。很多论文只报「去噪步的 TPF」，把验证成本藏掉，这是不公平的。

TPS 还要除以端到端时间，包括：

- 块调度、KV cache 分配、验证、提交、下一块的前缀更新；
- MoE all-to-all、专家权重加载；
- 采样、argmax、温度、top-p；
- 网络/序列化（服务场景）。

一个常见的错误是「用去噪 kernel 的微基准推 TPS」。微基准只测了 kernel，没测调度和验证；真实 TPS 通常是微基准的 **50–70%**。

### 7.4 batch 交叉点：低 batch 是流的主场，高 batch 是 AR 的

- **batch=1**：memory-bound。AR 每 token 读一遍权重，流每块读一遍；流的 TPF 高，赢。
- **batch=8–16**：权重读取被摊薄，计算开始占主导；流每 token 的计算量是 AR 的 2–3 倍（2 步 + 验证），优势缩小。
- **batch≥32**：compute-bound。AR 的 MFU 更高（每 token 一次前向，计算/读取比更优），流的多步计算变成负担，AR 反超。

DiffusionGemma 的报告说交叉点大约在 **32 个并发请求**。FlowGemma 的 2 步流每 token 计算量约为 AR 的 2 倍（2 次块前向 / 32 token vs 1 次 token 前向），所以交叉点可能更早，**预计 16–32 并发**，需要 E3 实测。这也意味着 FlowGemma 的商业定位是「低并发、低延迟、高质量」场景，而不是「高并发批处理」。

### 7.5 内核：五个必须自己写或深度改的地方

1. **per-token 时间条件的 adaLN 融合**。标准 adaLN 是 per-sample 的 scale/shift；FlowGemma 是 per-token 的 $\tau^i$，每个位置的调制参数不同。需要把「时间嵌入 → scale/shift → 归一化」融合成一个 kernel，避免每个 token 一次小 kernel 启动。
2. **前缀 KV + 块双向注意力的融合 mask**。前缀因果、块内双向、块可看前缀；标准 FlashAttention 的 causal mask 不够用。需要自定义 mask（或把块内双向拆成「块内全注意力 + 前缀 causal」两次调用），并支持 paged KV。
3. **MoE 冻结路由的 all-to-all**。每块只路由一次，意味着 all-to-all 只发生一次；可以把「按专家分组 → 计算 → 还原」与去噪步解耦，甚至预取专家权重。这是 FlowGemma 相对「每步路由」的最大系统优势。
4. **验证 kernel**。AR 验证是对 B 个 token 的一次 teacher-forcing 前向，causal mask + 前缀 KV；可以和块去噪共享前缀 KV，但 mask 不同。需要单独的验证 kernel，避免重新计算前缀。
5. **KV 量化 / 分页**。前缀 KV 是长上下文的主要成本；fp8 KV 能把 128k 的 24GB 压到 12GB，但会掉点。第一期先用 bf16 + paged KV，二期再评估 fp8。

**一个不能做的优化**：把 2 步 Euler 融合成「一层内跑两步」。因为第 2 步依赖第 1 步的**全部层**输出，不能在单层内完成。除非做「层间近似流」（每层自己的小流），否则步与步之间必须串行。这意味着 2 步流的延迟下限是「2 次完整前向」，不能靠 kernel 融合消掉。

### 7.6 服务策略：一个模型，两种队列

- **延迟队列**：质量优先模式（4 步 + 验证），SLO 是 p99 < 1.5× AR；适合对话、代码补全。
- **吞吐队列**：极速模式（1–2 步 + 验证/置信阈值），SLO 是 TPS ≥2× AR；适合摘要、分类、批量生成。
- **混合路由**：当并发 > 交叉点（预计 16–32），把新请求路由到 AR 后端；当并发低，路由到 FlowGemma。这不是「谁替代谁」，是「按负载选引擎」。
- **自适应 NFE**：根据块内后验熵决定步数：熵高（不确定）用 4 步，熵低用 2 步；这是 DiffusionGemma 熵约束采样的连续流版本。
- **验证回退**：若 $a<2$，该块直接用 AR 逐 token 生成，避免「流草稿全错 + 验证全拒」的死循环。
- **前缀缓存共享**：系统 prompt、few-shot 示例、长文档前缀可以跨请求共享 KV；这是服务端最大的成本杠杆之一。

### 7.7 成本模型：每百万 token 多少钱

一个简化的成本公式：

$$
\text{cost per 1M tokens} = \frac{\text{GPU \$/hr}\times10^6}{\text{TPS}\times3600\times\text{utilization}}.
$$

以 H100 \$2/hr、TPS=1000、利用率 70% 为例：

$$
\frac{2\times10^6}{1000\times3600\times0.7} \approx \$0.79\text{/M tokens}.
$$

如果 AR 的同规模 TPS=500，成本约 \$1.59/M；FlowGemma 2× 吞吐 → \$0.79/M，约 **0.5×**。如果考虑训练成本（25B MoE × 100B tokens，按 128×H100×3 天 ≈ \$18k），分摊到 10B 输出 token 上是 \$0.0018/M，可以忽略；分摊到 100M 输出 token 上是 \$0.18/M，仍然小于推理成本。**训练成本不是主要矛盾，推理吞吐才是。**

但要注意：这个模型假设 GPU 满负荷、请求同质、无长尾。真实服务的利用率通常 30–50%，长尾请求会拉低 TPS；FlowGemma 的低 batch 优势在「高利用率」场景下会被摊薄。**成本模型必须按真实流量分布跑，不能用峰值 TPS。**

### 7.8 测量清单：报数字时必须带的上下文

任何 TPS/TPF 数字，必须同时报告：

- GPU 型号、显存、功耗上限；
- dtype（bf16/fp8/int8）、KV dtype；
- batch size、输入长度、输出长度、并发数；
- 去噪步数、验证步数、接受长度分布；
- 是否含 tokenization、调度、网络；
- p50/p99 延迟、TTFT；
- MFU、HBM 带宽利用率；
- warmup 次数、重复次数、方差。

缺任何一项，数字都不可比。**「1500 TPS」如果没有 batch/长度/步数，就是一个营销数字，不是工程数字。**

> **工匠笔记 7：先优化「读权重」和「读前缀 KV」，再优化「算」。** 低 batch 下，90% 的时间在等内存；把权重读一遍的次数从 32 次降到 2 次，比把矩阵乘从 40% MFU 提到 60% MFU 更有效。流生成的工程价值，本质上就是「把权重读取次数除以 TPF」。

---
