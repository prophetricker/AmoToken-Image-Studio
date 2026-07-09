# Nova Image Studio v0.10 候选能力灰测记录

日期：2026-07-08

## 结论

v0.10 进入“候选能力灰测 + v1.0 稳定性收口”阶段。普通用户默认仍只看到稳定主链路；GIF 和无限画布不会默认出现。测试者可以通过受控链接开启候选入口：

- 开启：`/?novaCandidateModes=1`
- 关闭：`/?novaCandidateModes=0`

开启后浏览器会把灰测偏好保存在本地；关闭链接会把偏好改回关闭。这个开关只影响当前浏览器，不改变服务器公开策略，也不移除 Basic Auth。

## 线上稳定性观察

本轮只读观察结果：

- Nova 镜像：`amotoken/nova-image-studio:v0.9-0469beb`
- Nova 端口：仍为 `127.0.0.1:3001->3000/tcp`
- Nova 内存：约 `41.7MiB / 1.918GiB`
- NewAPI 内存：约 `64.7MiB / 1.918GiB`
- 根分区：`39G` 总量，约 `7.9G` 可用，使用率约 `79%`
- Nova 数据目录：约 `15M`
- 提示词广场图片缓存：`29` 个文件
- 容器日志未见明显内存或磁盘异常

提示词图片缓存已有上限：

- 单张图片默认上限：`8MB`
- 缓存目录默认上限：`512MB`
- 超过上限时按最旧文件清理
- 当前无需继续改提示词广场主链路，后续只做运行观察

## 灰测开关

实现方式：

- 构建期开关 `NEXT_PUBLIC_NOVA_CANDIDATE_MODES=1` 仍然保留。
- 新增运行时开关 `novaCandidateModes`，便于同一个生产包内测。
- 普通用户默认关闭。
- 测试者访问开启链接后，标签栏会显示 `动图生成` 和 `无限画布`。
- 访问关闭链接后，候选标签消失；如果当前停留在候选标签，会自动回到生图工作台。

本地持久化键：

- `nova-candidate-modes`

## 4K 灰测

当前稳定模型仍是：

- `AmoToken GPT Image 2`
- 最大输出：`2K`
- 普通用户默认使用它

v0.10 增加一个运行时派生的 4K 灰测模型：

- `AmoToken GPT Image 2 4K 灰测`
- 只在候选开关开启时出现
- 实际请求仍走同一个 AmoToken 令牌和 `gpt-image-2`
- 不写入普通用户保存的模型配置
- 关闭候选开关后自动消失

计费策略仍保持：

- 前端只展示预估区间
- 实际以爱词元扣费记录为准
- 不在本阶段修改正式计费规则

4K 预估区间沿用当前灰测表：

- 文生图 4K：约 `¥0.15-0.20`
- 单图编辑 4K：约 `¥0.16-0.20`
- 多图融合 4K：约 `¥0.18-0.20`

## GIF 灰测

GIF 当前工作流：

- 先生成 `3264x2448` 的 `4x3` 网格图
- 单帧约 `816x816`
- 再由浏览器本地切帧并合成 GIF
- 支持预览、微调、下载

v0.10 前的阻塞点：

- GIF 只接受支持自定义尺寸的 4K image 模型。
- 稳定 AmoToken 模型被限制为 2K，所以之前打开入口也没有可选模型。

v0.10 变化：

- 开启候选开关后，GIF 会看到 4K 灰测模型。
- 关闭候选开关后，GIF 无可选模型，普通用户也看不到 GIF 入口。

灰测重点：

1. 填写 AmoToken 令牌。
2. 打开 `/?novaCandidateModes=1`。
3. 进入 `动图生成`。
4. 确认模型选择显示 4K 灰测模型。
5. 输入短动作提示词，先生成网格图。
6. 审查网格图是否包含 12 帧。
7. 合成 GIF 并下载。
8. 记录耗时、是否失败、是否扣费、生成质量。

## 无限画布灰测

无限画布仍是高级候选入口，不进入普通用户主流程。开启候选开关后可见。

灰测重点：

1. 打开宽屏模式。
2. 进入 `无限画布`。
3. 创建文字节点和图片节点。
4. 从素材库导入图片。
5. 从提示词广场导入提示词或示例图。
6. 用节点引用生成图片。
7. 把结果保存到素材库。
8. 观察浏览器是否卡顿、节点是否丢失、失败提示是否可理解。

## 验收边界

- Basic Auth 继续保留。
- Nova 继续只绑定 `127.0.0.1:3001`。
- 公网 `3001` 不开放。
- 普通用户默认不暴露 4K / GIF / 无限画布。
- 4K 灰测模型不会污染普通用户保存的模型配置。
- 不修改爱词元正式计费规则。
- 用户界面不暴露“上游”或“NewAPI”等内部词。

## 测试建议

部署 v0.10 后，测试者按以下顺序验证：

1. 普通打开首页：确认没有 `动图生成` 和 `无限画布`。
2. 访问 `/?novaCandidateModes=1`：确认出现候选标签。
3. 访问 `/?novaCandidateModes=0`：确认候选标签消失。
4. 开启灰测后，检查普通生图、单图编辑、多图融合仍正常。
5. 开启灰测后，测试 4K 文生图 1 张。
6. 开启灰测后，测试 GIF 网格图生成和 GIF 下载。
7. 开启灰测后，测试无限画布导入、节点生成、保存到素材库。
8. 灰测结束后运行爱词元扣费记录核对，继续校准 4K 和 GIF 的实际成本。

## 部署后补充验证

2026-07-09 追加本地浏览器级检查：

- 默认打开 `http://127.0.0.1:3000/`：`动图生成=false`，`无限画布=false`，本地灰测开关为空。
- 打开 `http://127.0.0.1:3000/?novaCandidateModes=1`：`动图生成=true`，`无限画布=true`，本地灰测开关为 `enabled`。
- 打开 `http://127.0.0.1:3000/?novaCandidateModes=0`：`动图生成=false`，`无限画布=false`，本地灰测开关为 `disabled`。

2026-07-09 追加服务器运行观察：

- 当前镜像：`amotoken/nova-image-studio:v0.10-265ee78`
- 运行时长：约 38 分钟
- 端口：`127.0.0.1:3001->3000/tcp`
- Nova 内存：约 `30.75MiB / 1.918GiB`
- 根分区：约 `39G` 总量，`6.8G` 可用，使用率约 `82%`
- Nova 数据目录：约 `18M`
- 提示词图片缓存：`40` 个文件
- 本机首页：`200`
- 队列：空闲，`processing=0`，`queued=0`
- 日志：启动正常；提示词图片缓存命中/创建日志较多，但未见报错或资源异常

2026-07-09 追加第二轮服务器运行观察：

- 当前镜像：`amotoken/nova-image-studio:v0.10-265ee78`
- 运行时长：约 2 小时
- 端口：`127.0.0.1:3001->3000/tcp`
- 公网 `3001`：连接失败，符合预期
- `https://img.amotoken.cc/`：未带 Basic Auth 返回 `401`
- Nova 内存：约 `66MiB / 1.918GiB`
- NewAPI 容器内存：约 `80MiB / 1.918GiB`
- 根分区：约 `39G` 总量，`6.8G` 可用，使用率约 `82%`
- Nova 数据目录：约 `20M`
- 任务数据库：仅 2 条任务，均为 `completed`
- 队列：空闲，`processing=0`，`queued=0`
- 提示词图片缓存：`40` 个文件，约 `13.6MB`，最大单文件约 `0.98MB`
- `nova-images`：约 `2.5MB`
- Docker 构建缓存：`docker system df` 显示约 `15.5GB` 可回收；暂不自动清理，后续若部署前空间紧张，可执行一次受控 builder cache 清理
- 日志：最近 2 个图生图任务均成功，耗时约 `73-75s`；未见失败堆积或缓存报错

2026-07-09 追加用户可见失败文案收口：

- 状态查询 toast 不再直接展示原始任务错误。
- GIF 失败面板和无限画布节点错误接入统一清洗函数。
- 泛化 `API 请求失败: xxx` 为“生图失败 / 生图服务”视角，避免用户看到内部服务词。
- 保留内部日志和调试信息，不影响管理员排查。

2026-07-09 部署 `db8722f` 后验证：

- 当前镜像：`amotoken/nova-image-studio:v0.10-db8722f`
- 服务器源码：`db8722f`
- Compose 镜像行：`amotoken/nova-image-studio:v0.10-db8722f`
- 本机首页：`200`
- 队列：空闲，`processing=0`，`queued=0`
- 端口：`127.0.0.1:3001->3000/tcp`
- 公网 `3001`：连接失败，符合预期
- `https://img.amotoken.cc/`：未带 Basic Auth 返回 `401`
- Nova 内存：约 `35.5MiB / 1.918GiB`
- NewAPI 容器内存：约 `73.4MiB / 1.918GiB`
- 根分区：约 `39G` 总量，`8.0G` 可用，使用率约 `79%`
- 提示词图片缓存：`40` 个文件，约 `14M`
- `nova-images`：约 `1.3M`

2026-07-09 追加生产浏览器入口验证：

- 通过 SSH 隧道访问生产 Nova 本机端口，不绕过前端构建包，只绕过 Basic Auth。
- 默认入口：`动图生成=false`，`无限画布=false`，`nova-candidate-modes=null`。
- 灰测开启链接：`/?novaCandidateModes=1` 后 `动图生成=true`，`无限画布=true`，`nova-candidate-modes=enabled`。
- 灰测关闭链接：`/?novaCandidateModes=0` 后 `动图生成=false`，`无限画布=false`，`nova-candidate-modes=disabled`。
- 使用仅用于 UI 验证的本地假令牌后，生图工作台正常展示主表单、预估费用和爱词元扣费核对文案。
- 4K 灰测模型出现在模型选择弹层，名称为 `AmoToken GPT Image 2 4K 灰测`。
- 选择 4K 灰测模型后，尺寸选择弹层包含 `1K / 2K / 4K / 自定义`。
- GIF 入口显示 `AmoToken GPT Image 2 4K 灰测`、提示词输入、生成网格图按钮、审查与导出面板。
- 无限画布入口在非宽屏时提示切换宽屏；切换宽屏后可进入画布列表，新建画布后出现图片节点、文本节点、编排节点、从提示词广场导入等工具。

2026-07-09 追加日志降噪修复：

- 观察到提示词图片代理每次访问都会打印 `[prompt-gallery-cache] cache dir`。
- 该日志不是功能错误，但长期运行会干扰排查并增加 Docker 日志增长。
- 已改为目录可用后只在首次成功时打印一次；后续访问仍保留目录存在性检查、缓存上限和清理策略。

2026-07-09 部署 `9ea12df` 后验证：

- 当前镜像：`amotoken/nova-image-studio:v0.10-9ea12df`
- 服务器源码：`9ea12df`
- Compose 镜像行：`amotoken/nova-image-studio:v0.10-9ea12df`
- 本机首页：`200`
- 队列：空闲，`processing=0`，`queued=0`
- 端口：`127.0.0.1:3001->3000/tcp`
- 公网 `3001`：连接失败，符合预期
- `https://img.amotoken.cc/`：未带 Basic Auth 返回 `401`
- Nova 内存：约 `18-50MiB / 1.918GiB`
- NewAPI 容器内存：约 `55MiB / 1.918GiB`
- 根分区：约 `39G` 总量，`8.0G` 可用，使用率约 `79%`
- 提示词图片缓存：`46` 个文件，约 `16M`
- `nova-images`：约 `4K`
- 图片代理路径触发后，`[prompt-gallery-cache] cache dir` 日志计数仍为 `1`，日志降噪生效。

2026-07-09 追加 4K/GIF 参数链路验证：

- 新增 `frontend/src/lib/__tests__/model-capabilities.test.ts`，锁定候选 4K 模型和 GIF 网格尺寸的边界。
- 4K 灰测模型仍由稳定 `AmoToken GPT Image 2` 运行态派生，普通用户默认不可见，关闭候选开关后不会保存在模型注册表里。
- `gpt-image-2` 的 4K 固定比例只暴露当前尺寸包络内可用的 `16:9`、`9:16`、`21:9`，不会暴露无效的 `1:1` 4K。
- 2K 仍保留较宽的布局选择，避免影响普通灰测链路和回退体验。
- GIF 网格使用的 `3264x2448` 自定义尺寸通过前端尺寸限制；`4096x4096` 这类超出当前自定义尺寸包络的方图会被拒绝。
- 本地验证命令：
  - `npm.cmd run test:run -- src/lib/__tests__/model-capabilities.test.ts`
  - `npm.cmd run test:run -- src/lib/__tests__/model-capabilities.test.ts src/lib/__tests__/gif-job-store.test.ts src/lib/__tests__/nova-models.test.ts src/lib/__tests__/image-cost-estimator.test.ts src/lib/__tests__/server-gpt-image-params.test.ts`
  - `npx.cmd eslint src/lib/model-capabilities.ts src/lib/__tests__/model-capabilities.test.ts src/lib/gif-job-store.ts src/lib/nova-models.ts`
- 验证结果：相关 `5` 个测试文件、`25` 条测试均通过；targeted eslint 无报错。

2026-07-09 追加第三轮服务器只读观察：

- 当前线上镜像仍为 `amotoken/nova-image-studio:v0.10-9ea12df`，本轮测试/文档提交未改变生产运行包，因此无需替换容器。
- Nova 端口仍为 `127.0.0.1:3001->3000/tcp`。
- Nova 内存约 `21.54MiB / 1.918GiB`；NewAPI 容器内存约 `49.95MiB / 1.918GiB`。
- 根分区约 `39G` 总量，`8.0G` 可用，使用率约 `79%`。
- Nova 数据目录约 `20M`，共 `49` 个文件；任务数据库主文件约 `48K`，WAL 约 `4.0M`。
- 提示词图片缓存目录为 `/root/nova-image-studio/data/prompt-gallery-images`，约 `46` 个文件、`16M`，未见无上限膨胀。
- 队列接口 `/api/nova/queue-status` 返回空闲：`processingCount=0`、`queuedCount=0`、`remainingQueueSlots=40`、`acceptingNewTasks=true`。
- 最近 30 分钟 Nova 日志仅见启动、图片目录、提示词缓存目录、监听地址和内部 Base URL 配置日志，未见失败堆积或缓存错误。

2026-07-09 追加只读运行状态采集脚本：

- 新增 `scripts/collect-nova-runtime.ps1`，用于反复采集 Nova 灰测期间的服务器运行状态。
- 脚本只读采集 Docker 容器、内存、端口、磁盘、Docker build cache、Nova 数据目录、提示词图片缓存、任务数据库文件、队列接口和最近 Nova 日志。
- 脚本不写入服务器、不重启容器、不清理缓存、不保存密码或 Basic Auth。
- Windows 本地建议用 `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\collect-nova-runtime.ps1 -SshTarget root@<server-ip> -IdentityFile "$env:USERPROFILE\.ssh\amotoken_nova_deploy" -OutputPath "output\nova-runtime-$(Get-Date -Format yyyyMMdd-HHmmss).md"` 运行。
- 脚本已在当前生产服务器只读试跑通过；报告输出目录 `output/` 已被 `.gitignore` 忽略。
- 本次脚本快照显示：当前镜像仍为 `amotoken/nova-image-studio:v0.10-9ea12df`，Nova 端口仍为 `127.0.0.1:3001->3000/tcp`，Nova 内存约 `22.03MiB / 1.918GiB`，提示词图片缓存仍为 `46` 个文件、约 `16M`，队列空闲。
- `docker system df` 显示 Docker build cache 约 `14.17GB` 可回收；当前根分区仍有约 `8.0G` 可用，暂不自动清理，后续若部署空间紧张再人工确认后处理。

2026-07-09 追加用户可见失败文案收口：

- 审计前端用户可见路径，发现 `后端任务失败`、`后端未返回图片`、`后端返回的图片为空`、`创建任务失败：后端未返回任务 ID` 等极端失败文案可能透出技术词。
- 已统一改为 `生图任务失败`、`生图服务未返回图片`、`生图服务返回的图片为空`、`创建任务失败：生图服务未返回任务编号`。
- 设置页 `连接 AmoToken` 辅助文案从“后端会自动连接爱词元生图服务”改为“爱词元生图服务已预置完成”，避免普通用户看到内部实现词。
- 新增 `frontend/src/lib/__tests__/ccode-task-client.test.ts`，并补强 `task-failure` 文案清洗测试。
- 本地验证命令：
  - `npm.cmd run test:run -- src/lib/__tests__/task-failure.test.ts src/lib/__tests__/ccode-task-client.test.ts src/lib/__tests__/workspace-task-service.test.ts src/components/workspace/results/__tests__/HistoryJobList.test.tsx src/components/workspace/results/__tests__/CompletedJobCard.test.tsx src/components/__tests__/ImageGenerationWorkbench.test.tsx`
  - `npx.cmd eslint src/lib/task-failure.ts src/lib/ccode-task-client.ts src/lib/__tests__/task-failure.test.ts src/lib/__tests__/ccode-task-client.test.ts src/hooks/useAgentChat.ts src/hooks/useGifWorkflow.ts src/hooks/useServerTaskPolling.ts src/lib/workspace-task-service.ts src/components/SettingsModal.tsx`
  - `npm.cmd run build`
- 验证结果：相关 `6` 个测试文件、`48` 条测试均通过；targeted eslint 无报错；Next 生产构建通过。

2026-07-09 部署 `658a617` 后验证：

- 当前镜像：`amotoken/nova-image-studio:v0.10-658a617`
- 服务器源码：`658a617`
- Compose 镜像行：`amotoken/nova-image-studio:v0.10-658a617`
- 本机首页：`200`
- 队列：空闲，`processingCount=0`、`queuedCount=0`、`remainingQueueSlots=40`
- 端口：`127.0.0.1:3001->3000/tcp`
- 公网 `3001`：连接失败，符合预期
- `https://img.amotoken.cc/`：未带 Basic Auth 返回 `401`
- Nova 内存：约 `19.08MiB / 1.918GiB`
- 根分区：约 `39G` 总量，`6.6G` 可用，使用率约 `83%`
- 提示词图片缓存：`46` 个文件，约 `16M`，未见膨胀
- Docker build cache：约 `15.6GB` 可回收；本次仍未自动清理，若后续部署空间紧张再确认后处理。
- 部署包检查：新设置页文案 `爱词元生图服务已预置完成` 已在前端包中，旧文案 `后端会自动连接` 不存在。

2026-07-09 追加运行状态告警阈值：

- `scripts/collect-nova-runtime.ps1` 新增 `Runtime Warnings` 段，只读输出资源风险，不执行清理。
- 默认阈值：根分区使用率 `>=85%`、根分区可用空间 `<=5GB`、Docker build cache 可回收 `>=12GB`、提示词图片缓存 `>=512MB`。
- 提示词图片缓存告警按 `prompt-gallery-images`、`prompt-gallery-cache`、`prompt-image-cache` 多目录总量计算，避免后续目录拆分时漏报。
- 当前服务器触发 `runtime_warning=build_cache_reclaimable value=15.6GB threshold=12GB action=confirm_before_docker_builder_prune`。
- 提示词图片缓存仍约 `16M`，没有触发缓存膨胀告警。
- 清理 Docker build cache 属于可恢复构建缓存清理，不涉及 `/root/new-api-data` 或 `/root/nova-image-studio/data`，但仍需人工确认后执行；本轮没有自动清理。
- 本地新增 `scripts/test-collect-nova-runtime.ps1`，覆盖多个提示词缓存目录合计超过阈值时必须输出 `runtime_warning=prompt_gallery_cache`。

2026-07-09 追加多图融合预估费用修正并部署 `3965a1c`：

- 修正生图工作台顶部实时预估费用：当已加载多张参考图时，将参考图数量传给 `estimateImageCost`，使用多图融合估算表，而不是单图编辑估算表。
- 新增 `ImageGenerationWorkbench` 用例：2 张参考图、2K 输出时，页面预估费用应显示 `约 ¥0.12-0.13`。
- 本地验证命令：
  - `npm.cmd run test:run -- src/components/__tests__/ImageGenerationWorkbench.test.tsx`
  - `npm.cmd run test:run -- src/lib/__tests__/image-cost-estimator.test.ts src/lib/__tests__/workspace-task-service.test.ts src/components/workspace/results/__tests__/CompletedJobCard.test.tsx src/components/workspace/results/__tests__/HistoryJobList.test.tsx src/components/__tests__/ImageGenerationWorkbench.test.tsx`
  - `npx.cmd eslint src/components/ImageGenerationWorkbench.tsx src/components/__tests__/ImageGenerationWorkbench.test.tsx src/lib/image-cost-estimator.ts src/lib/__tests__/image-cost-estimator.test.ts`
  - `npm.cmd run build`
- 验证结果：相关 `5` 个测试文件、`29` 条测试通过；targeted eslint 无报错；Next 生产构建通过。
- 部署镜像：`amotoken/nova-image-studio:v0.10-3965a1c`
- 服务器源码：`3965a1c fix: estimate fusion costs in workbench`
- Compose 镜像行：`amotoken/nova-image-studio:v0.10-3965a1c`
- 本机首页：`200`
- 队列：空闲，`processingCount=0`、`queuedCount=0`、`remainingQueueSlots=40`
- 端口：`127.0.0.1:3001->3000/tcp`
- 公网 `3001`：连接失败，符合预期
- `https://img.amotoken.cc/`：未带 Basic Auth 返回 `401`
- Nova 内存：约 `19.08MiB / 1.918GiB`
- NewAPI 内存：约 `55.38MiB / 1.918GiB`
- 根分区：约 `39G` 总量，`7.9G` 可用，使用率约 `79%`
- 提示词图片缓存：`46` 个文件，约 `16M`，未见膨胀
- Docker build cache：约 `14.22GB` 可回收；仍只记录告警，不自动清理。
