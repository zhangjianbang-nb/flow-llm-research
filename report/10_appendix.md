## 第十章 附录：推导、术语、核验、复现

> 这一章是给「想自己算一遍」的读者准备的。前九章的所有结论，在这里都能找到对应的公式、代码或核验记录。如果只读一章，读第 4 章；如果想复现，读这一章。

### 附录 A　数学推导

#### A.1 离散扩散的 CTMC 与前向方程

设状态空间 $V^L$，$q_t(y)$ 是时刻 $t$ 的分布，$R_t(z,y)$ 是从 $z$ 跳到 $y$ 的速率。前向方程（Kolmogorov 前向）为

$$
\dot q_t(y)=\sum_{z}q_t(z)R_t(z,y).
$$

masking 过程取 $R_t(z,y)=0$ 除非 $y$ 是把 $z$ 的某个位置替换为 `[MASK]`；速率之和为 $\sigma(t)$。训练目标（ELBO 的等价形式）为

$$
\mathcal L=\mathbb E_{t\sim U[0,1]}\mathbb E_{y_0\sim p_{\text{data}}}\mathbb E_{y_t\sim q_{t\mid 0}(\cdot\mid y_0)}\left[\sum_{i:\,y_t^i=\text{MASK}}-\log p_\theta(y_0^i\mid y_t)\right].
$$

采样时从 $q_1$（全 mask）开始，按 schedule 逐步解 mask；每一步对多个位置独立采样，就引入了 A.2 的因子化误差。

#### A.2 因子化误差与 1/N 律

设有 $K$ 个强相关组合（城市对），第 $k$ 个的概率为 $p_k$，$\sum p_k=1$。两个位置必须来自同一对。若两个位置在同一步独立提交，各自从边缘分布采样，则它们碰巧相同的概率是

$$
\sum_{k=1}^{K}p_k^2,
$$

非法概率是

$$
q_{\text{invalid}}=1-\sum_{k=1}^{K}p_k^2.
$$

若两个位置的提交步在 $1..N$ 上独立均匀，碰撞概率为 $1/N$；因此

$$
q_{\text{invalid}}(N)=\frac{1}{N}\Big(1-\sum_k p_k^2\Big).
$$

这就是第 4 章实验里离散臂的解析曲线。注意两个假设：提交步独立均匀、碰撞时独立采样。真实离散扩散的提交顺序由置信度决定，可能相关；但**只要存在碰撞，非法质量的下界就由 $1-\sum p_k^2$ 决定**，与模型多强无关。

#### A.3 线性插值的条件速度

设 $x_t=(1-t)x_0+t x_1$，$x_0\sim\mathcal N(0,I)$，$x_1$ 是数据。对给定的 $x_t=x$，条件速度的期望为

$$
v_t(x)=\mathbb E[x_1-x_0\mid x_t=x].
$$

证明：由 $x_t=(1-t)x_0+t x_1$，两边取条件期望，

$$
x=(1-t)\mathbb E[x_0\mid x_t=x]+t\mathbb E[x_1\mid x_t=x].
$$

又 $\mathbb E[x_1-x_0\mid x_t=x]=\mathbb E[x_1\mid x_t=x]-\mathbb E[x_0\mid x_t=x]$。把 $\mathbb E[x_0\mid x_t=x]=(x-t\mathbb E[x_1\mid x_t=x])/(1-t)$ 代入，得

$$
v_t(x)=\frac{\mathbb E[x_1\mid x_t=x]-x}{1-t}.
$$

这就是「去噪器到速度」的恒等式。若去噪器输出词表分布 $D_t(x)$，则 $\mathbb E[x_1\mid x_t=x]=D_t(x)E$，于是

$$
v_t(x)=\frac{D_t(x)E-x}{1-t}.
$$

#### A.4 连续性方程

概率路径 $p_t$ 与速度场 $v_t$ 满足

$$
\frac{\partial p_t}{\partial t}+\nabla\cdot(p_t v_t)=0.
$$

流匹配的训练目标就是让神经网络 $v_\theta$ 逼近 $v_t$：

$$
\mathcal L_{\text{flow}}=\mathbb E_{t,x_0,x_1}\|v_\theta(x_t,t)-(x_1-x_0)\|^2.
$$

采样解 ODE $\dot x_t=v_\theta(x_t,t)$，从 $x_0$ 积分到 $x_1$。

#### A.5 流映射的半群与蒸馏

流映射 $X_{s,t}$ 满足半群性质：

$$
X_{s,t}(X_{r,s}(x))=X_{r,t}(x),\qquad 0\le r\le s\le t\le 1.
$$

蒸馏时，学生 $X_{s,t}$ 匹配教师的两步组合：

$$
\mathcal L_{\text{distill}}=\mathrm{KL}\Big(\delta_{s,t}(x)\,\Big\|\,\mathrm{sg}\big(\delta_{s,u}\circ\delta_{u,t}(x)\big)\Big),
$$

其中 $\mathrm{sg}$ 是 stop-gradient，$u$ 是中间时刻。对角项 $s=t$ 匹配教师，非对角项匹配两个短学生的组合；这就是 semigroup distillation。FMLM 的 two-time denoiser 就是在这个框架下做的。

#### A.6 时间重参数化

FMLM 的时间重参数化为

$$
\tau(t)=1-\frac{|V|}{|V|-1}P_e(t),
$$

其中 $P_e(t)$ 是模型在时间 $t$ 的解码错误率。当 $t=0$ 时 $P_e=1-1/|V|$，$\tau=0$；当 $t=1$ 时 $P_e=0$，$\tau=1$。直观上，错误率高的阶段走得慢，错误率低的阶段走得快；边界留 $p=1/32$ 的质量，避免 $t\to1$ 时 $1/(1-t)$ 的数值奇点。

#### A.7 玩具实验的联合后验

两个位置 $A,B$，城市对 $k$ 对应端点 $e_A=2k$、$e_B=2k+1$。给定噪声 $x_0^A,x_0^B$ 和数据端点，线性插值的条件分布为

$$
x_t^A\sim\mathcal N\big(t\,e_A,\,(1-t)^2 I\big),\qquad x_t^B\sim\mathcal N\big(t\,e_B,\,(1-t)^2 I\big).
$$

由贝叶斯公式，联合后验为

$$
p(k\mid x_0^A,x_0^B)\propto p_k\exp\left(-\frac{\|x_0^A-t e_A\|^2+\|x_0^B-t e_B\|^2}{2(1-t)^2}\right).
$$

对角后验则分别用 $x_0^A$ 和 $x_0^B$ 算边缘，再相乘。实验代码 `experiment/toy_flow_vs_diffusion.mjs` 里的 `jointPosterior` 和 `marginalPosterior` 就是这两个式子。

#### A.8 TPF/TPS

$$
\text{TPF}=\frac{\text{提交 token 数}}{\text{模型前向次数}},\qquad
\text{TPS}=\frac{\text{提交 token 数}}{\text{端到端时间}}.
$$

前向次数包括去噪步和验证步；端到端时间包括调度、KV 分配、验证、提交、网络。**只报去噪步的 TPF 是不公平的。**

### 附录 B　术语表

| 术语 | 一句话解释 |
|---|---|
| AR | 自回归，逐 token 生成 |
| DLM | Diffusion Language Model，扩散语言模型 |
| CTMC | 连续时间马尔可夫链 |
| ELBO | 证据下界，扩散训练目标 |
| Masking diffusion | 把 token 替换为 mask 的离散扩散 |
| Factorized commit | 多位置在同一步独立提交，产生因子化误差 |
| Flow matching | 学习概率路径的速度场，解 ODE 采样 |
| Conditional flow | 以数据端点为条件的流匹配训练目标 |
| Velocity field | 速度场 $v_t(x)$ |
| Denoiser | 去噪器，预测 $x_1$ 或词分布 |
| Flow map | 两时间映射 $X_{s,t}$，可一步生成 |
| Semigroup | 半群性质，流映射可组合 |
| Distillation | 把多步教师压成少步学生 |
| DFM | Discrete Flow Matching，离散流匹配 |
| CTMC path | 离散状态上的连续时间概率路径 |
| Kinetic-optimal | 最小化对称动能的速度场 |
| Transition Matching | 统一扩散/流/连续 AR 的框架 |
| DTM/ARTM/FHTM | Transition Matching 的三个变体 |
| Block-autoregressive | 块间因果、块内并行的生成 |
| Canvas | 画布，一次去噪的 token 块 |
| TPF | Tokens per forward，每次前向提交的 token 数 |
| TPS | Tokens per second |
| MFU | Model FLOPs Utilization |
| Speculative decoding | 草稿 + 验证的加速方法 |
| Self-speculative | 用同一个模型的 AR 头验证自己的草稿 |
| Acceptance length | 验证通过的最长前缀长度 |
| MoE | 混合专家 |
| Active parameters | 每次前向实际激活的参数 |
| Router | MoE 的专家选择器 |
| All-to-all | 专家并行的通信操作 |
| GQA | Grouped-Query Attention，减少 KV 头 |
| Paged KV | 分页 KV cache |
| FlowGemma | 本报告提出的 MoE + 块级连续流提案（不存在） |
| Oracle experiment | 用闭式后验代替学习模型的实验 |
| TV distance | Total variation，分布距离 |
| Mode collapse | 分布塌缩到少数模式 |

### 附录 C　论文核验表

| # | 论文 | arXiv | 日期 | venue | 代码/权重 | 关键数字核验 |
|---:|---|---|---|---|---|---|
| 1 | FMLM | 2602.16813 | 2026-02 | NeurIPS 2026 | 代码 + 项目页 | 是 |
| 2 | FS-DFM | 2509.20624 | 2025-09 | ICLR 2026 | 代码 | 是 |
| 3 | Logit-KL | 2411.16821 | 2024-11 | ICLR 2026 | 代码 | 是 |
| 4 | General Discrete Paths | 2412.03487 | 2024-12 | ICLR 2025 | 代码 | 是 |
| 5 | Transition Matching | 2506.23589 | 2025-06 | NeurIPS 2025 | 代码 | 是 |
| 6 | Lafa | 2610.28559 | 2026-10 | preprint | 代码 + 模型 | 是 |
| 7 | RePlaid | 2605.18530 | 2026-05 | NeurIPS 2026 | 未核 | 是（摘要 + 全文） |
| 8 | LangFlow | 2604.11748 | 2026-04 | NeurIPS 2026 | 未核 | 是（摘要 + 全文） |
| 9 | S-FLM | 2605.11125 | 2026-05 | preprint | 未核 | 部分 |
| 10 | Categorical Flow Maps | 2602.12233 | 2026-02 | preprint | 未核 | 部分 |
| 11 | DBTM | 2609.15903 | 2026-09 | preprint | 未核 | 部分 |
| 12 | ELF-REG | 2609.29102 | 2026-09 | preprint | 未核 | 是（摘要） |
| 13 | TTCD | 2607.14106 | 2026-07 | preprint | 未核 | 部分 |
| 14 | FMLM★ | 2607.00714 | 2026-07 | preprint | 代码 | 部分 |
| 15 | aFMLM | 2610.42018 | 2026-10 | preprint | 未核 | 部分 |
| 16 | Posterior Refinement | 2606.24773 | 2026-06 | preprint | 代码 | 是（摘要） |
| 17 | DiffusionGemma | 2608.00146 | 2026-07 | 技术报告 | 开放权重 | 是 |
| 18 | DLM Survey | alphaXiv | 2026-11-08 | 综述 | — | 是（目录） |
| 19 | DDPM | 2006.11239 | 2020-06 | NeurIPS 2020 | 代码 | 是（经典） |
| 20 | Score SDE | 2011.13456 | 2020-11 | NeurIPS 2021 | 代码 | 是（经典） |
| 21 | Flow Matching | 2210.02747 | 2022-10 | ICLR 2023 | 代码 | 是（经典） |
| 22 | Stochastic Interpolants | 2209.03003 | 2022-09 | ICLR 2023 | 代码 | 是（经典） |
| 23 | Consistency Models | 2303.01469 | 2023-03 | ICML 2023 | 代码 | 是（经典） |
| 24 | Speculative Decoding | 2211.17192 | 2022-11 | ICML 2023 | 代码 | 是（经典） |
| 25 | Medusa | 2401.10774 | 2024-01 | ICML 2024 | 代码 | 是（经典） |
| 26 | EAGLE | 2401.15077 | 2024-01 | ICML 2024 | 代码 | 是（经典） |
| 27 | DeepSeek-V3 | 2412.19437 | 2024-12 | 技术报告 | 开放权重 | 是（MTP） |
| 28 | MDLM | 2406.07524 | 2024-06 | NeurIPS 2024 | 代码 | 是（基线） |
| 29 | SEDD | 2310.16834 | 2023-10 | NeurIPS 2024 | 代码 | 是（基线） |

> 「关键数字核验」= 本报告是否回到 arXiv 全文/摘要逐表核对过。标「部分」的，表示只核对了摘要或部分表格；标「未核」的代码链接表示没有确认可访问，不代表论文不可信。

### 附录 D　玩具实验复现

**环境**：Node.js（本机 v22+）；无外部依赖；纯 ESM。

**运行**：

```bash
cd flow-llm-research-20261121
node experiment/toy_flow_vs_diffusion.mjs
```

**输出**：`experiment/results.json`（曲线、trace、样本、解析值）。

**运行时间**：本机实测 **3.54 秒**（Apple Silicon，单线程）。

**确定性**：三个随机种子（11/23/37），每个配置 5000 条序列；固定种子后结果可复现。`results.json` 里的 `perSeed` 记录了每个种子的单独结果，`mean/std` 是三个种子的均值/标准差。

**参数**：

- 城市对：new–york 0.30、san–diego 0.24、los–angeles 0.16、hong–kong 0.12、tel–aviv 0.10、rio–janeiro 0.08。
- $|V|=12$，$K=6$，$\sum p_k^2=0.204$。
- $N\in\{1,2,4,8,16,32,64\}$。
- 每条序列 2 个对（4 个 token）；每个配置 3 seeds × 5000 序列 = 15,000 序列 / 30,000 对。

**已知偏差**：

- 离散臂的提交顺序是随机均匀的，不是置信度驱动的；真实离散扩散可能更好，但 1/N 律的下界仍成立。
- 连续臂用精确闭式后验，没有学习误差；真实模型的联合后验是近似的。
- 只有两个位置；块内 32/256 个位置的联合后验维度更高，结论只能定性地外推。

### 附录 E　伪代码

**训练（单步）**：

```python
# x1: clean token ids [B, L]; E: embedding [V, d]
# prefix: [B, N]; block: [B, Bk]
z1 = E[x1_block]                       # [B, Bk, d]
z0 = randn_like(z1)                    # noise
t = sample_time()                      # per-token, asynchronous
tau = clamp(t + alpha * (arange(Bk)/Bk - 0.5), 0, 1)
zt = (1 - tau) * z0 + tau * z1
h = backbone(prefix, zt, tau, mask="prefix_causal_block_bidirectional")
logits = flow_head(h)                  # [B, Bk, V]
v_pred = (softmax(logits) @ E - zt) / (1 - tau)
loss = CE(logits, x1_block) + lam_mse * MSE(v_pred, z1 - z0)
loss += lam_ar * CE(ar_head(h_causal), x1_block)
loss += lam_fm * KL(flow_map(zt, s, t), stopgrad(two_step_teacher(zt, s, u, t)))
loss.backward()
```

**推理（一个块）**：

```python
z = randn(B, Bk, d)
for step in range(NFE):
    tau = schedule(step)
    logits = model(prefix, z, tau)
    v = (softmax(logits) @ E - z) / (1 - tau)
    z = z + dt * v
draft = argmax(logits, dim=-1)          # [B, Bk]
# AR verification: teacher forcing, causal mask
ar_logits = ar_head(prefix, draft)
accept = 0
for i in range(Bk):
    if argmax(ar_logits[:, i]) == draft[:, i]:
        accept += 1
    else:
        draft[:, i] = argmax(ar_logits[:, i])
        break
commit(draft[:, :accept])
append_kv(prefix, draft[:, :accept])
```

### 附录 F　局限

1. **FlowGemma 是提案，不是已存在的模型。** 所有参数、算力、TPF 目标都是估算；没有训练验证。
2. **玩具实验是 oracle，不是学习实验。** 它证明「联合有用」，不证明「联合可学、可算」。
3. **论文数字来自作者的环境。** 本报告没有独立复现 Lafa/FMLM/FS-DFM；E0 就是为了补这一课。
4. **长上下文、多模态、RL 后训练没有覆盖。** 这三块是 FlowGemma 二期的事，不是这份报告能回答的。
5. **MoE 路由稳定性没有公开证据。** 冻结路由是提案的工程猜测，不是论文结论。
6. **TPF/TPS 的口径不统一。** 本报告尽量按「提交 token / 前向次数」定义，但不同论文的测量方式可能不同。
7. **证据分级是主观的。** A/B/C 是本报告的工程标尺，不是学术评价。

### 附录 G　参考文献

按首次出现顺序：

1. Lee et al. *Flow Map Language Models: One-step Language Modeling via Continuous Denoising.* arXiv:2602.16813, NeurIPS 2026.
2. Monsefi et al. *FS-DFM: Fast and Accurate Long Text Generation with Few-Step Diffusion Language Models.* arXiv:2509.20624, ICLR 2026.
3. Sevriugov et al. *Logit-KL Flow Matching: Non-Autoregressive Text Generation via Sampling-Hybrid Inference.* arXiv:2411.16821, ICLR 2026.
4. Shaul et al. *Flow Matching with General Discrete Paths: A Kinetic-Optimal Perspective.* arXiv:2412.03487, ICLR 2025.
5. Shaul et al. *Transition Matching: Scalable and Flexible Generative Modeling.* arXiv:2506.23589, NeurIPS 2025.
6. Chavan et al. *Large Flow Language Models.* arXiv:2610.28559, 2026.
7. Yang et al. *Continuous Diffusion Scales Competitively with Discrete Diffusion for Language.* arXiv:2605.18530, NeurIPS 2026.
8. Chen et al. *LangFlow: Continuous Diffusion Rivals Discrete in Language Modeling.* arXiv:2604.11748, NeurIPS 2026.
9. Deschenaux & Gulcehre. *Language Modeling with Hyperspherical Flows.* arXiv:2605.11125, 2026.
10. Roos et al. *Categorical Flow Maps.* arXiv:2602.12233, 2026.
11. Tang & Wang. *Discrete Beckmann Transport Models for One-Step Language Modeling and Reasoning.* arXiv:2609.15903, 2026.
12. Li et al. *ELF-REG: Scaling Continuous Diffusion Language Models to Reasoning Tasks.* arXiv:2609.29102, 2026.
13. Bansal & Sanghavi. *Token Time Continuous Diffusion for Language Modeling.* arXiv:2607.14106, 2026.
14. Yoo et al. *FMLM★: Fixed-Point Flow.* arXiv:2607.00714, 2026.
15. Lee et al. *aFMLM: Asynchronous Flow Map Language Models.* arXiv:2610.42018, 2026.
16. Agarwal et al. *Posterior Refinement for One-Step Language Modeling.* arXiv:2606.24773, 2026.
17. Google DeepMind. *DiffusionGemma Technical Report.* arXiv:2608.00146, 2026.
18. Tang et al. *A Survey of Diffusion Language Models.* alphaXiv, 2026-11-08.
19. Ho et al. *Denoising Diffusion Probabilistic Models.* arXiv:2006.11239, NeurIPS 2020.
20. Song et al. *Score-Based Generative Modeling through Stochastic Differential Equations.* arXiv:2011.13456, NeurIPS 2021.
21. Lipman et al. *Flow Matching for Generative Modeling.* arXiv:2210.02747, ICLR 2023.
22. Albergo & Vanden-Eijnden. *Stochastic Interpolants.* arXiv:2209.03003, ICLR 2023.
23. Song et al. *Consistency Models.* arXiv:2303.01469, ICML 2023.
24. Leviathan et al. *Fast Inference from Transformers via Speculative Decoding.* arXiv:2211.17192, ICML 2023.
25. Cai et al. *Medusa: Simple LLM Inference Acceleration Framework with Multiple Decoding Heads.* arXiv:2401.10774, ICML 2024.
26. Li et al. *EAGLE: Speculative Sampling Requires Rethinking Feature Uncertainty.* arXiv:2401.15077, ICML 2024.
27. DeepSeek-AI. *DeepSeek-V3 Technical Report.* arXiv:2412.19437, 2024.
28. Sahoo et al. *Simple and Effective Masked Diffusion Language Models.* arXiv:2406.07524, NeurIPS 2024.
29. Lou et al. *Discrete Diffusion Modeling by Estimating the Ratios of the Data Distribution.* arXiv:2310.16834, NeurIPS 2024.

---
