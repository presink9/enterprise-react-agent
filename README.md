# 企业财税 ReAct Agent

基于 FastAPI、LangGraph 和本地混合检索的企业知识库助手。保留现有 OpenAI 兼容服务商接入方式，模型必须支持 `tools/tool_calls`。无需引入另一套 Agent 框架。

## 架构

```text
POST /api/v1/chat/stream
    → ChatService（会话串行化、超时、事件转换）
    → prepare（重置本轮预算、修复中断的工具消息）
    → agent（模型决定回答或调用工具）
        ├─ 最终回答 → END
        ├─ 超出工具轮数 → limit → END
        └─ tools（检索/其他工具）→ ToolMessage（观察）→ agent
```

- `app/api/v1/chat.py`：HTTP / SSE 适配，不承担业务编排。
- `app/agent/`：状态、提示词、工具工厂、ReAct 图、聊天服务。
- `app/core/`：配置、模型工厂、异步资源生命周期。
- `app/rag/`：DOCX 解析、增量入库、Dense + 中文 BM25 + CrossEncoder。
- `app/schemas/`：输入输出校验；`tests/`：离线测试及显式开启的集成测试。

ReAct 使用结构化工具调用：模型决定行动，工具结果以 ToolMessage 回传，模型结合观察继续检索或回答。不会要求或向客户端输出模型的内部思考。工具调用校验、未知工具和运行异常均形成错误观察；默认最多 4 轮工具执行，允许最后一次模型调用消化观察；若仍请求工具则补全消息并返回明确的停止提示。单轮中模型可以请求多个工具。

图通过 `build_agent(model, tools, checkpointer=...)` 注入依赖，模块导入不连接数据库、不下载模型。PostgreSQL 连接池由 FastAPI lifespan 打开并关闭；Embedding / Reranker 在第一次检索时加载。

实现参考：[LangGraph 官方工作流与 Agent 示例](https://github.com/langchain-ai/docs/blob/main/src/oss/langgraph/workflows-agents.mdx)、[ToolNode 参考](https://reference.langchain.com/python/langgraph.prebuilt/tool_node/ToolNode)。

## 本地运行

Python 3.12+；在项目根目录执行：

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -e ".[dev]"
# 仅首次配置且不存在 .env 时复制；已有配置无需覆盖
Copy-Item .env.example .env
```

在本地 `.env` 填写现有服务商的 Key、Base URL 和支持工具调用的模型/推理接入点。环境变量优先于 `.env`，相对数据路径以项目根目录为基准。

开发时可设置 `CHECKPOINT_BACKEND=memory` 跳过 PostgreSQL（重启后会话丢失）。持久化使用默认的 `postgres`，先启动：

```powershell
docker compose up -d postgres
.venv/Scripts/python.exe -m app.rag.ingest
.venv/Scripts/python.exe -m app
```

文档放在 `data/docs/*.docx`。第一次入库/检索可能需要下载 BGE 模型；离线部署需预先准备模型缓存或将模型配置为本地路径。API 文档位于 [本地 Swagger](http://localhost:8000/docs)。

Windows + PostgreSQL 使用 psycopg async 时需要 SelectorEventLoop；上述启动入口已显式配置。自行使用 Uvicorn 命令时加上 `--loop app.core.event_loop:loop_factory`；自定义 asyncio 程序也需显式选择 SelectorEventLoop。项目测试已配置这一策略。

## API 与 SSE

```http
POST /api/v1/chat/stream
Content-Type: application/json

{"message":"企业所得税如何申报？","thread_id":"user-123-session-1"}
```

省略 `thread_id` 将创建独立 ID；客户端从首个 `session` 事件取出后在后续请求复用。不再共享 `default_session`。

| 事件 | data | 用途 |
| --- | --- | --- |
| session | `{"thread_id":"..."}` | 确认会话 |
| intent | `{"intent":"rag_search"}` 或 `general_chat` | 根据本轮工具执行结果标记 |
| tool_start | `{"name":"...","run_id":"..."}` | 工具开始 |
| tool_end | `{"name":"...","run_id":"...","status":"success/error"}` | 工具结束 |
| message | `{"text":"最终答案"}` | 确认没有后续工具调用的最终回答 |
| error | `{"code":"timeout/agent_error","message":"..."}` | 服务错误，隐藏内部异常细节 |
| end | `[DONE]` | 流结束（不代表一定成功，先检查 error） |

工具进度实时推送。最终文本在一次模型输出确认完成后发送，不逐 token 转发中间模型内容，避免把工具选择文字当作最终答案。旧的 SSE 地址和 `message/end` 数据格式保持不变；客户端应忽略未知事件。

## 检索与入库

- 段落与表格按 Word 原始顺序解析，保留文件名和章节路径。
- Dense 与 BM25 都使用持久化向量库里的同一批片段，避免原先两套不同切分逻辑。
- 按来源、章节和内容去重，再经 CrossEncoder 排序；工具返回内容及引用来源。
- 按内容生成稳定 ID，先 upsert 成功再删除该来源的旧片段。重复入库不累加重复记录。
- 不删除整个数据库目录；本次未导入的文件、空文件对应的历史数据保留。彻底删除来源应单独管理。
- 服务第一次检索后会缓存 BM25；重新入库后重启服务以刷新索引。更换 Embedding 模型时使用新的 `PERSIST_DB_DIR` 或集合并重新入库。

## 开发与验证

```powershell
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/python.exe -m ruff check app tests
.venv/Scripts/python.exe -m ruff format --check app tests
# 外部服务就绪后才运行（模型调用会产生费用）
.venv/Scripts/python.exe -m pytest --run-integration -m integration -q
```

默认测试使用脚本模型、内存检查点和临时 DOCX，验证多轮工具反馈、查询改写、失败恢复、调用上限、会话隔离、SSE、取消/超时、入库幂等及表格归属。不调用真实模型、不修改现有知识库。PostgreSQL 测试会重新建立连接验证历史恢复，并删除测试会话。

新增工具：定义参数 Pydantic schema，创建 StructuredTool，加入 `build_agent` 的工具列表；图无需增加业务分支。新增模型：替换工厂返回的、支持 `bind_tools/ainvoke` 的 ChatModel。

## Docker 与迁移说明

`docker compose up --build` 启动数据库和应用；`docker compose run --rm app python -m app.rag.ingest` 入库。构建上下文排除 `.env`、虚拟环境、数据和缓存，运行时通过 env_file 注入配置。依赖统一在 pyproject.toml 声明，requirements.txt 仅保留兼容安装入口。

- 原来的模块级 `agent_app` 和 `llm` 改为显式工厂；脚本应使用 `create_chat_service` 异步上下文或注入依赖的 `build_agent`。
- 当前同会话并发锁仅在单个进程内有效。部署使用单 worker；多 worker / 多副本需要外部会话锁或按会话路由。
- `thread_id` 是会话路由标识，不是用户鉴权。对外提供服务前，应由网关/业务层认证用户并绑定会话归属。
- 历史消息当前完整保留；长会话的摘要/裁剪策略需结合模型上下文预算扩展。
- config.yaml 属于原有镜像代理配置，不参与应用设置。应用统一从环境变量和 .env 读取。
- Git 仓库仅包含源码、测试、文档和配置模板；`.env`、虚拟环境、缓存及本地知识库数据已排除。克隆后自行配置 `.env` 并放入 DOCX 文件，不要强制添加这些本地文件。
