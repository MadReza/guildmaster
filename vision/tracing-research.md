# Tracing research

What is out there for tracing a multi-agent system built on Claude Code, read on 2026-09-30 for [tracing-design.md](tracing-design.md): the standards, what Claude Code itself emits, the tools people use, and how other orchestrators trace.
It ends with a local test of Claude Code 2.1.286's telemetry.
Vocabulary is [TERMINOLOGY.md](../TERMINOLOGY.md)'s.

**Evidence.** Every web source was read on 2026-09-30; where a source carries its own date or version, it is given.
Links use short keys, listed under [Sources](#sources).
Firstmate citations are paths in the Firstmate repository at commit `29213a09` (2026-09-28), read-only; this repository's [trace context page](../firstmate/components/observability/trace-context.html) covers the same ground, read at an older commit.
"Development", "beta" and "preview" are the sources' own labels; where a source is thin or a claim could not be checked, the text says so.
Statements under "What it means" are inference, not fact.

## In brief

- **The standard exists but is young.** The OpenTelemetry GenAI conventions name agent, model-call and tool spans (`invoke_agent`, `chat`, `execute_tool`) and now have attributes for effort (`gen_ai.request.reasoning.level`) and reasoning tokens. Every part is in Development status, the conventions moved to their own repository in June 2026, and that repository has no release yet ([semconv-1.42], [genai-registry]).
- **Claude Code emits a lot, locally, with content redacted by default.** Metrics, log events and beta traces over OTLP: per model call the model, effort, four token counts, cost, duration and time to first token; per tool call the name, duration and outcome; hook runs, subagents, compaction, retries ([cc-monitoring]).
- **Its trace context reaches some places and not others.** Headless `claude -p` runs read `TRACEPARENT`; interactive sessions ignore it; Bash subprocesses and hooks receive one; MCP servers over HTTP get a `traceparent` header; stdio MCP servers get none per call ([cc-monitoring]; local test).
- **The local test found two gaps the documentation does not mention.** On 2.1.286 a headless run's first prompt had no interaction span, so its spans were not parented under `TRACEPARENT` (its log events were); and a short run lost its last spans at exit ([Local test](#local-test-of-claude-code-21286)).
- **Effort is in the telemetry for models that take it.** Claude Code adds `effort` to model-call events and spans (since 2.1.274), and hooks and the status line expose it too; the test's Haiku calls carried none ([cc-monitoring], [cc-hooks], [cc-statusline]).
- **Tracing tools split in two.** General OpenTelemetry backends (Jaeger, Tempo, SigNoz, Honeycomb) show any trace; LLM tools (Langfuse, Phoenix, LangSmith, Weave, Laminar, Braintrust, Helicone, AgentOps) add sessions, token and cost views. Several self-host, and several already have Claude Code integrations built on its telemetry or its hooks ([Tools](#tools)).
- **Other orchestrators agree on the shape.** One trace per unit of work, a separate grouping key for a conversation, links rather than parents for work that is not nested, and content off by default. Firstmate's own rule, that a long-lived supervisor is never a shared trace root, matches it (`docs/trace-context.md:46-47`).

## Standards

### OpenTelemetry GenAI semantic conventions

**Where and how stable.** Semantic conventions v1.42.0 (2026-06-12) moved "all `gen_ai.*` attributes, metrics, events, and spans" out of the core repository into `open-telemetry/semantic-conventions-genai` ([semconv-1.42]); the core registry (v1.44.0, 2026-08-04) now marks them deprecated and moved ([semconv-1.44-genai]).
The new repository has no release or tag; its manifest declares stability `development` and a schema URL of `gen-ai-dev/1.42.0-dev`, and its README says "Schema URL: TODO" ([genai-readme]).
Every GenAI document is in Development status; stabilisation is only scoped, in a working-draft issue opened 2026-09-11 ([genai-511]).
The core transition plan asked instrumentations to keep their old output by default and offer `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` ([semconv-1.41-genai]); the new repository does not mention that variable (searched at commit `b31e9e8`).
This research read the new repository at commit `b31e9e8` (2026-09-30).

**Spans** ([genai-spans], [genai-agent-spans]):

| Span | Name | Kind | Notes |
| --- | --- | --- | --- |
| Inference | `{gen_ai.operation.name} {gen_ai.request.model}`, operation `chat`, `text_completion` or `generate_content` | CLIENT | Required: `gen_ai.operation.name`, `gen_ai.provider.name` |
| Execute tool | `execute_tool {gen_ai.tool.name}` | INTERNAL | Skill refinements (`load_skill`, `command`) name Anthropic's client `bash` tool as an example |
| Create agent | `create_agent {gen_ai.agent.name}` | CLIENT | |
| Invoke agent | `invoke_agent {gen_ai.agent.name}` | CLIENT for a remote agent, INTERNAL for an in-process one | Pending changes drop `gen_ai.provider.name`, `gen_ai.agent.id` and `gen_ai.agent.version` from the internal variant |
| Invoke workflow | `invoke_workflow {gen_ai.workflow.name}` | INTERNAL | For "a coordinated process composed of multiple agents"; not for a sub-agent runner inside another operation |
| Plan | `plan {gen_ai.agent.name}` | INTERNAL | |

There is no task, team or turn span type.
Open work includes agent-transfer refinements ([genai-447]), a turn count ([genai-451]), an invocation id ([genai-250]) and stable agent ids on internal spans ([genai-546]); whether a separate agent process is a CLIENT or INTERNAL `invoke_agent` is unresolved ([genai-477], [genai-493]).

**Attributes that matter here** (all Development, [genai-registry]):

| Attribute | Meaning |
| --- | --- |
| `gen_ai.operation.name` | Required on every span |
| `gen_ai.provider.name` | `anthropic` exists; replaces the deprecated `gen_ai.system` |
| `gen_ai.request.model`, `gen_ai.response.model` | Requested and answering model |
| `gen_ai.request.reasoning.level` | "The reasoning or thinking effort level requested", the exact string sent; added 2026-06-18 ([genai-258]) |
| `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens` | Input includes cached tokens; output includes reasoning tokens |
| `gen_ai.usage.cache_read.input_tokens`, `gen_ai.usage.cache_write.input_tokens` | `cache_write` was renamed from `cache_creation` on 2026-08-20, a breaking change not yet released ([genai-440]) |
| `gen_ai.usage.reasoning.output_tokens` | Reasoning tokens, when the provider reports them |
| `gen_ai.agent.name`, `gen_ai.agent.id` | The id is a provider's stable id; it is "NOT RECOMMENDED to record in-memory agent instance ids" |
| `gen_ai.conversation.id` | Conditionally required when available; must not be a made-up fallback such as a trace id |
| `gen_ai.conversation.compacted` | `true` when context compaction was applied |
| `gen_ai.tool.name`, `gen_ai.tool.call.id`, `gen_ai.tool.type` | Type is `function`, `extension` or `datastore` |
| `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result`, `gen_ai.input.messages`, `gen_ai.output.messages` | Opt-in content |
| `error.type` | Stable, from the core conventions |

No attribute exists for a thinking budget, and none for cost.

**Content capture** is off by default: instrumentations "SHOULD NOT capture them by default, but SHOULD provide an option for users to opt in"; the spec names `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` only as an example ([genai-spans]), and Python's `opentelemetry-util-genai` implements it ([otel-util-genai]).
An opt-in `gen_ai.client.inference.operation.details` event carries the same data apart from traces ([genai-events]).

**Metrics.** `gen_ai.client.operation.duration`, agent and tool durations and call counts (`gen_ai.invoke_agent.duration`, `gen_ai.invoke_agent.tool_calls`, `gen_ai.execute_tool.duration`); `gen_ai.client.token.usage` was replaced on 2026-09-22 by `gen_ai.client.inference.usage.*` counters, another unreleased breaking change ([genai-metrics]).

**Anthropic.** One refinement, `anthropic.inference.client`, requires `gen_ai.provider.name="anthropic"`; it maps `gen_ai.request.reasoning.level` to Anthropic's effort setting and defines `gen_ai.usage.input_tokens` as Anthropic's `input_tokens` plus cache reads plus cache writes, because Anthropic's count excludes cached tokens ([genai-anthropic]).
There are no `anthropic.*` attributes.

### OpenTelemetry MCP conventions

MCP conventions were added in core v1.39.0 (2026-01-12) and moved with the rest; they are in Development status ([semconv-1.39], [genai-mcp]).
Spans are `mcp.client` and `mcp.server`, named `{mcp.method.name} {target}`, for example `tools/call get-weather`; attributes include `mcp.method.name`, `mcp.session.id`, `mcp.protocol.version` and `jsonrpc.request.id`.
When an outer GenAI instrumentation already traces the tool call, an MCP instrumentation "SHOULD NOT create a separate span" and should add its attributes to the existing one.
Context is propagated in `params._meta` under the unprefixed keys `traceparent`, `tracestate` and `baggage`.

### W3C Trace Context and `TRACEPARENT`

Trace Context Level 1 is a W3C Recommendation of 23 November 2021 ([w3c-tc1]); Level 2 is a Candidate Recommendation Draft of 28 March 2024 that adds a "random trace id" flag ([w3c-tc2]).
`traceparent` is `00-<32 hex trace id>-<16 hex parent id>-<2 hex flags>`, sampled being `01`; `tracestate` is up to 32 vendor `key=value` members.

Carrying it to a child process in an environment variable is now OpenTelemetry's own convention, not only Firstmate's: "Environment Variables as Context Propagation Carriers" normalises `traceparent` to `TRACEPARENT`, advises injecting into a separate copy of the environment for each child, and says it is "not appropriate for sensitive information" ([otel-env-carriers]).
It reached Release Candidate in specification v1.59.0 (released 2026-07-10, [otel-spec-1.59]), and .NET, C++, Go, Java, JavaScript (experimental `@opentelemetry/propagator-env-carrier`, first published 2026-07-02, [npm-env-carrier]) and Python implement it ([otel-env-carriers]).
Firstmate's own document, written before that, still says OpenTelemetry SDKs "do not read it from the environment automatically" (`docs/trace-context.md:22`).

### MCP and trace context

The MCP specification of 2026-07-28 reserves `traceparent`, `tracestate` and `baggage` in `_meta` "for OpenTelemetry trace context propagation", with a `tools/call` example, but does not require clients to send them ([mcp-2026-07-28-basic]); the 2025-11-25 specification's page has no such text ([mcp-2025-11-25-basic]).
That is SEP-414, final, merged 2026-02-26 ([mcp-sep-414]); a proposal to forward the keys to HTTP headers is open ([mcp-sep-2028]).
The Python SDK 2.x traces every message and injects context into `_meta`; its client span is named `MCP send {method} {target}`, which does not match the convention ([mcp-python-otel]).
The TypeScript SDK only defines the key names and passes them through untouched ([mcp-ts-2270]).
Claude Code does not send them: four issues asking for `_meta` propagation were closed unimplemented ([cc-issue-54010], [cc-issue-54629], [cc-issue-61517], and [cc-issue-76391] on 2026-09-19), and one user on 2.1.280 saw `_meta` hold only `claudecode/toolUseId` and `progressToken` ([cc-issue-41836]); the local test saw the same on 2.1.286.

## What Claude Code emits

All from [cc-monitoring] unless another source is named.
Traces are beta: "Span names and attributes may change between releases" ([cc-sdk-observability]).

### Turning it on

| Variable | Effect |
| --- | --- |
| `CLAUDE_CODE_ENABLE_TELEMETRY=1` | Required for any export |
| `OTEL_METRICS_EXPORTER`, `OTEL_LOGS_EXPORTER`, `OTEL_TRACES_EXPORTER` | `otlp`, `console`, `none`; metrics also `prometheus` |
| `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1` | Required for spans |
| `OTEL_EXPORTER_OTLP_PROTOCOL`, `_ENDPOINT`, `_HEADERS` | `grpc`, `http/json` or `http/protobuf`; there is no default protocol |
| `OTEL_METRIC_EXPORT_INTERVAL`, `OTEL_LOGS_EXPORT_INTERVAL`, `OTEL_TRACES_EXPORT_INTERVAL` | 60 s, 5 s, 5 s by default |
| `OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_ASSISTANT_RESPONSES`, `OTEL_LOG_TOOL_DETAILS`, `OTEL_LOG_TOOL_CONTENT`, `OTEL_LOG_RAW_API_BODIES` | Content capture, all off by default; without `OTEL_LOG_TOOL_DETAILS` MCP server and custom agent names are redacted |
| `OTEL_RESOURCE_ATTRIBUTES` | Attached to every metric and event |
| `ENABLE_BETA_TRACING_DETAILED` with `BETA_TRACING_ENDPOINT` | Adds `claude_code.hook` spans and content attributes; an interactive session needs its organisation allowlisted, `-p` does not |
| `CLAUDE_CODE_OTEL_FLUSH_TIMEOUT_MS`, `CLAUDE_CODE_OTEL_SHUTDOWN_TIMEOUT_MS` | 5000 and 2000 ms ([cc-env-vars]) |

Two constraints shape any design.
Since 2.1.282, Claude Code ignores the variables that turn on export, set the destination or capture content when they appear in a repository's `.claude/settings.json` or `.claude/settings.local.json`.
And "Claude Code doesn't pass `OTEL_*` environment variables to the subprocesses it spawns, including the Bash tool, hooks, MCP servers, and language servers", so a worker started from a Bash tool must be given its own exporter settings.

### Metrics

`claude_code.session.count`, `lines_of_code.count`, `pull_request.count`, `commit.count`, `cost.usage` (USD), `token.usage` (by `type`: input, output, cacheRead, cacheCreation), `code_edit_tool.decision` and `active_time.total`.
Cost and token metrics carry `model`, `effort`, `speed`, `query_source` (`main`, `subagent`, `auxiliary`), `agent.name`, `skill.name` and `mcp_server.name`.
`session.id` is on every metric by default, which costs cardinality in a metrics store.

### Log events

Every event carries `event.name`, `event.timestamp`, `event.sequence` (per process) and `prompt.id`, "linking all events produced while processing a single user prompt"; it is the same value as the hooks' `prompt_id` (since 2.1.196, [cc-hooks]).

| Event | What it adds |
| --- | --- |
| `user_prompt` | `prompt_length`; the prompt only with `OTEL_LOG_USER_PROMPTS` |
| `assistant_response` | `response_length`, `model`; the response only when enabled |
| `api_request` | `model`, `effort`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `cost_usd`, `duration_ms`, `ttft_ms`, `request_id`, `query_source` |
| `api_error`, `api_retries_exhausted`, `api_refusal` | Status, attempts, retry time; intermediate retries are not separate events |
| `tool_decision`, `tool_result` | Tool name, `tool_use_id`, success, duration, decision source; MCP tools appear as `mcp_tool` unless tool details are on |
| `hook_execution_start`, `hook_execution_complete` | Hook event and name, successes, blocks, total duration |
| `subagent_completed` | Agent type, model, async or not, tool uses, duration; `total_tokens` covers the final request only |
| `compaction` | Trigger, tokens before and after, duration |
| `skill_activated`, `mcp_server_connection`, `permission_mode_changed` | As named |

No session-end event exists.

### Traces (beta)

```
claude_code.interaction              one per prompt
├── claude_code.llm_request          one per model call
├── claude_code.hook                 detailed beta tracing only
└── claude_code.tool
    ├── claude_code.tool.blocked_on_user
    ├── claude_code.tool.execution
    └── a subagent's llm_request and tool spans (Agent tool)
```

`llm_request` carries `model`, `gen_ai.request.model`, `effort` (2.1.274+), the four token counts, `duration_ms` "including retries", `ttft_ms`, `attempt`, `stop_reason`, `request_id`, `agent_id` and `parent_agent_id`, with a `gen_ai.request.attempt` event per retry; `tool` carries `tool_name`, `tool_use_id` and `duration_ms` (permission wait plus execution).
Claude Code's names are its own, not the GenAI conventions', and it still uses the deprecated `gen_ai.system`.

**Trace context.** `-p` runs and Agent SDK sessions read `TRACEPARENT` and `TRACESTATE` "when starting each interaction span"; "Interactive sessions ignore inbound `TRACEPARENT`"; with `TRACEPARENT` set, a `-p` run's events carry `trace_id` and `span_id` "even when the traces exporter isn't configured".
Outbound, Bash and PowerShell subprocesses inherit `TRACEPARENT` set to the active tool-execution span, hook subprocesses are covered too per [cc-env-vars], and HTTP MCP requests and model requests carry a `traceparent` header.

**Identity on every signal.** `session.id`, `user.id`, and when available `user.email`, `user.account_uuid`, `user.account_id` and `organization.id`; `user.email` is "always included when available".

### Hooks

Hooks are commands Claude Code runs at 33 lifecycle events ([cc-hooks]).
Every hook gets `session_id`, `prompt_id`, `transcript_path`, `cwd` and `hook_event_name`; events in a tool-use context (`PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`) also get `effort.level`, and `$CLAUDE_EFFORT` holds it; inside a subagent, `agent_id` and `agent_type`.
"Only `SessionStart` hooks can receive a `model` field, and Claude Code doesn't always include it"; no hook fires once per model call, and no input carries a timestamp, so a hook must read its own clock.

| Event | Fields that matter for tracing |
| --- | --- |
| `UserPromptSubmit` | `prompt` |
| `PreToolUse`, `PostToolUse` | `tool_name`, `tool_input`, `tool_use_id`, `mcp_server` (2.1.274+); Post adds `tool_response` and `duration_ms`; for the `Agent` tool, the resolved model, total tokens, tool uses and duration |
| `PostToolUseFailure` | `error`, `is_interrupt`, `duration_ms` |
| `SubagentStart`, `SubagentStop` | `agent_id`, `agent_type`; Stop adds `agent_transcript_path` and `last_assistant_message` |
| `Stop`, `StopFailure` | `background_tasks`; StopFailure's `error` (`rate_limit`, `overloaded`, …) |
| `PreCompact`, `PostCompact` | `trigger`; Post adds `compact_summary` |
| `SessionStart`, `SessionEnd` | `source`; `reason` (SessionEnd's default timeout is 1.5 s) |
| `PreModelSwitch`, `PostModelSwitch` | `from_model`, `to_model` |

### Other local sources

- **The status line** receives `model.id`, `effort.level`, `cost.total_cost_usd`, `cost.total_duration_ms`, `session_id` and `prompt_id` on every refresh ([cc-statusline]).
- **The headless result.** `claude -p --output-format json` or `stream-json` ends with `total_cost_usd`, `duration_ms`, `duration_api_ms`, `num_turns`, `usage` and `modelUsage` per model (with `thinkingTokens` and `costUSD`) ([cc-headless], [cc-sdk-ts]). The cost is a client-side estimate, "not authoritative billing data", and a resumed run reports the session's running total ([cc-sdk-cost]).
- **Transcripts** under `~/.claude/projects/` hold model, usage and effort per assistant entry, but "The entry format is internal to Claude Code and changes between versions" ([cc-sessions]); several entries share one message id, which made MLflow's Claude Code integration record only 20.8% of cache-read tokens until fixed ([mlflow-25839]).

### Local test of Claude Code 2.1.286

On 2026-09-30, on the patron's Mac, three short headless runs exported Claude Code's telemetry to a throwaway receiver on `127.0.0.1:4318` (a 25-line Python program writing OTLP/HTTP JSON to files; Docker was not running, and nothing needed an account).
Run 1 used Haiku 4.5 with `--effort low`, a preassigned `--session-id`, a hook on 11 events recording its input and environment, a one-tool stdio MCP server recording every message, and a prompt that ran one Bash command, called the MCP tool and started a subagent; it cost $0.052.
Runs 2 and 3 were one-line prompts, by argument and by `stream-json` input, without content capture.
The receiver was stopped afterwards; the runs' own transcripts remain in Claude Code's store under `~/.claude/projects/`.

What arrived, and how it compares with the documentation:

| Finding | Documented? |
| --- | --- |
| Spans `claude_code.interaction`, `llm_request`, `tool`, `tool.blocked_on_user`, `tool.execution`, with the attributes listed above; `session.id` equal to the `--session-id` passed in | Yes |
| The subagent's model call nested under the `Agent` tool's execution span, with `agent_id` and `query_source_safe=agent.builtin.general-purpose`; a `subagent_completed` event | Yes |
| **The first prompt of each run had no `claude_code.interaction` span.** Its model and tool spans were roots of their own random traces, not children of `TRACEPARENT`. Only run 1's second interaction (the internal notice that the background subagent had finished) got an interaction span, correctly parented, with `parent.source=env` | No: the documentation says `-p` reads `TRACEPARENT` for each interaction span |
| **Every log event carried the inbound trace id** (and the parent span id) during the first prompt | Yes |
| **Spans still open at exit were lost**: run 2 made two model calls and exported one `llm_request` span; run 3 exported no spans; logs and metrics all arrived | No |
| The Bash command's environment held `TRACEPARENT` set to its own `tool.execution` span | Yes |
| Hook processes got `TRACEPARENT` for the active interaction (the inbound value during the first prompt); `SubagentStart` and `SubagentStop` got the `Agent` tool's execution span; hooks also got `CLAUDE_CODE_SESSION_ID` | Partly (the env-vars page names hooks; the monitoring page does not) |
| The stdio MCP server's `tools/call` `_meta` held only `claudecode/toolUseId` and `progressToken`; its process inherited `TRACEPARENT` at start | Undocumented |
| No `effort` on any Haiku call (events, spans, metrics, hooks, transcript's `perTurnEffort` null), although `--effort low` was given; this session's own Opus transcript has `"effort":"xhigh"` on every assistant entry | Consistent with "absent when Claude Code sends no effort level" |
| `hook_execution_start` and `hook_execution_complete` events for each hook, with durations; no hook spans (detailed tracing was off) | Yes |
| Without content flags, `prompt` and `response` were `<REDACTED>` | Yes |
| `user.email`, `user.account_uuid`, `user.account_id` and `organization.id` on every span, event and metric | Yes |
| The `Agent` tool ran in the background by default in `-p`; its completion arrived as a new turn | Partly |

What it means: for headless runs, Claude Code's log events (`api_request` with model, tokens and cost) can be relied on to carry the posting's trace id; its spans, on 2.1.286, cannot yet.
Whether a shorter trace export interval or a longer shutdown timeout saves the last spans was not tested.

### Coverage of the patron's list

| Wanted | Native telemetry | Hooks | Headless result | Status line |
| --- | --- | --- | --- | --- |
| The patron wrote something | `user_prompt` | `UserPromptSubmit` | | |
| Reply latency | `interaction.duration_ms` | Time `UserPromptSubmit` to `Stop` | `duration_ms` | |
| Model per call | `api_request.model` | `SessionStart` only, sometimes | `modelUsage` keys | `model.id` |
| Effort per call | `api_request.effort` | `effort.level` | | `effort.level` |
| Tokens and cost per call | `api_request` | | Totals only | Running cost |
| Tool and MCP calls | `tool_result`, `tool` spans | `PreToolUse`, `PostToolUse` | | |
| Subagents | `subagent_completed`, spans | `SubagentStart`, `SubagentStop` | | |
| Hook runs | `hook_execution_*` | | | |
| Retries and errors | `api_error`, `attempt` | `StopFailure`, `PostToolUseFailure` | | |
| Compaction | `compaction` | `PreCompact`, `PostCompact` | | |
| Session start and end | `session.count` (start only) | `SessionStart`, `SessionEnd` | | |

## Tools

Prices and features are what each page said on 2026-09-30; none of these stacks was run for this research.

**First, a limit every tool shares.** Claude Code's span and token names are its own (`claude_code.llm_request`, `input_tokens`, `cache_read_tokens`), not the GenAI conventions'.
Honeycomb says Claude Code "does not yet use the OpenTelemetry semantic conventions" and publishes a collector recipe that renames `llm_request` to `chat {model}`, `tool` to `execute_tool`, `interaction` to `invoke_agent`, `session.id` to `gen_ai.conversation.id` and `input_tokens` to `gen_ai.usage.input_tokens` ([honeycomb-agents]).
So a viewer that computes tokens and cost from `gen_ai.usage.*` would show Claude Code's model calls without them unless something renames them first (inference; not tested).

**Second, most Claude Code integrations are hooks plus transcripts, and capture content by default.** Phoenix's plugin: "By default, everything is captured" ([phoenix-cc]); Weave's: PII scrubbing is not implemented ([weave-cc]); Langfuse's reads the transcript from a `Stop` hook and sends prompts, responses and tool input and output ([langfuse-cc]).
Only Braintrust documents ingesting Claude Code's own OTLP traces ([braintrust-cc-otel]), and SigNoz and OpenObserve publish guides for its native metrics, events and traces ([signoz-cc], [openobserve-cc]).

| Tool | Self-host, and how heavy | Licence | Cost | OTLP in | Understands `gen_ai.*` | Claude Code integration | Local only? | Best views |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Jaeger v2 | One binary or container, built on the OTel Collector; in-memory by default, Badger or ClickHouse to persist ([jaeger-arch], [jaeger-start]) | Apache-2.0 | Free | Traces, gRPC and HTTP | A GenAI tab and agent, LLM and tool span icons are new in the UI (v2.20 and v2.21); gaps still open ([jaeger-ui-releases], [jaeger-ui-4433]) | Any OTLP source | Yes | Waterfall, tag search, span links |
| Grafana Tempo + Grafana | Tempo monolithic on local disk; or `grafana/otel-lgtm`, one container with Collector, Tempo, Loki, Prometheus and Grafana, "intended for development, demo, and testing" ([tempo-config], [otel-lgtm]) | AGPL-3.0 (the lgtm image Apache-2.0) | Free | All three signals (lgtm) | No LLM trace view in open-source Grafana; GenAI dashboards are a Grafana Cloud product ([grafana-ai-obs]) | Grafana Cloud integration, metrics and logs only ([grafana-cc]); community stacks such as claude-code-otel, which has no traces ([claude-code-otel]) | Yes, after turning off usage reporting and update checks in both ([tempo-config], [grafana-config]) | Dashboards, TraceQL, waterfall |
| SigNoz | Docker Compose with ClickHouse, Keeper and an OTel Collector ([signoz-repo]) | MIT, plus `ee/` | Community free; cloud from $49 a month ([signoz-pricing]) | All three signals | Yes: AI views read `gen_ai.request.model`, `gen_ai.usage.*`, `gen_ai.tool.name`, `gen_ai.agent.name` and compute cost ([signoz-ai]) | Official guide for native metrics, events and traces, with a dashboard ([signoz-cc]) | Yes, with the stats reporter off ([signoz-telemetry]) | Flame graph, AI cost panels, logs |
| Honeycomb | No: SaaS ([honeycomb-pricing]) | Proprietary | Free to 20M events a month; Pro from $150 ([honeycomb-pricing]) | All three signals ([honeycomb-otel]) | Yes: an agent timeline by `gen_ai.agent.name`, needing `gen_ai.conversation.id` ([honeycomb-agents]) | Native OTLP plus the rename recipe | No | Agent timeline, boards |
| Langfuse | Docker Compose with Postgres, ClickHouse, Redis and S3-style storage; "at least 4 cores and 16 GiB" ([langfuse-selfhost], [langfuse-compose]) | MIT, except `ee/` | Self-host free; cloud $0 to $2,499 a month ([langfuse-pricing]) | Traces only, HTTP only ([langfuse-otel]) | Yes, and OpenInference; sessions from `langfuse.session.id` or `session.id` | `Stop`-hook transcript parser ([langfuse-cc]) | Yes, with `TELEMETRY_ENABLED=false` (it otherwise reports counts to PostHog) ([langfuse-telemetry]) | Sessions, agent graphs, cost dashboards, evaluations. Retention management and server-side masking are Enterprise ([langfuse-selfhost-pricing]) |
| Arize Phoenix | One container or `pip`; SQLite or Postgres; UI and OTLP HTTP on 6006 ([phoenix-docker]) | Elastic License 2.0 ([phoenix-license]) | Free; Arize AX cloud $0 or $50 ([arize-pricing]) | Traces only, gRPC and HTTP | Since 15.10.0 converts `gen_ai.*` to its OpenInference format at ingest ([phoenix-semconv]); sessions by `session.id` ([phoenix-sessions]) | Hook plugin, subagents nested, content captured by default ([phoenix-cc]) | Yes, with `PHOENIX_TELEMETRY_ENABLED=false` ([phoenix-repo]) | Traces, sessions, cost from a price table, evaluations |
| LangSmith | Enterprise add-on only, on Kubernetes ([langsmith-selfhost]) | Proprietary | $0, or $39 a seat ([langsmith-pricing]) | Traces ([langsmith-otel]) | Yes ([langsmith-otel]) | Hook plugin ([langsmith-claude-code]) | No, for one developer | Threads, evaluations |
| W&B Weave | Licensed, Kubernetes with ClickHouse ([weave-selfhost]) | SDK Apache-2.0; server proprietary | Free 1 GB; Pro from $60 ([weave-pricing]) | Traces, HTTP protobuf ([weave-otel]) | Yes ([weave-otel]) | Plugin emitting `invoke_agent`, `chat`, `execute_tool`; no redaction ([weave-cc]) | Not practically | Traces, threads |
| AgentOps | Compose with Supabase, ClickHouse, a collector ([agentops-app]) | SDK MIT; app ELv2 | Free to 5,000 events; $40 ([agentops-site]) | "Built on OpenTelemetry"; no generic OTLP endpoint found ([agentops-concepts]) | Not documented | None found | Possibly, heavily | Session waterfall. Thin evidence |
| Laminar | Compose with Postgres, ClickHouse, Quickwit ([laminar-selfhost]) | Apache-2.0 | Free 1 GB; $30 or $150 ([laminar-pricing]) | Traces, gRPC and HTTP ([laminar-otel]) | Yes ([laminar-attrs]) | Plugin, can target a self-hosted instance; mechanism and redaction undocumented ([laminar-cc]) | Yes, with `LAMINAR_TELEMETRY_DISABLED=true` ([laminar-repo]) | Traces, sessions, SQL dashboards |
| Helicone | All-in-one container plus a separate gateway ([helicone-docker]) | Apache-2.0 | Free to 10k requests; $79 or $799 ([helicone-pricing]) | No: a proxy in front of the model API | Not applicable | `ANTHROPIC_BASE_URL` pointed at the proxy ([helicone-cc]), which also turns off Claude Code's default `traceparent` propagation ([cc-monitoring]) | Yes, but in "maintenance mode" since its acquisition on 2026-03-03 ([helicone-blog]) | Requests, cost |
| Braintrust | Enterprise hybrid: the data plane in your cloud, the control plane at Braintrust ([braintrust-selfhost]) | Proprietary | $0 or $249 ([braintrust-pricing]) | Traces and logs, HTTP ([braintrust-otel]) | Yes ([braintrust-otel]) | Native Claude Code traces as typed spans ([braintrust-cc-otel]); also a hook plugin ([braintrust-cc]) | No | Typed agent spans, evaluations |

**Also relevant.**
MLflow is one process on SQLite with `mlflow autolog claude` (hooks) and GenAI-aware OTLP ingest over HTTP; its telemetry is on until `MLFLOW_DISABLE_TELEMETRY=true` ([mlflow-cc], [mlflow-semconv], [mlflow-usage]).
OpenObserve is one AGPL binary for all three signals and documents native Claude Code tracing ([openobserve-repo], [openobserve-cc]).
otel-desktop-viewer is one Apache-2.0 binary on the OTel Collector with DuckDB storage, for all three signals, with no LLM views ([otel-desktop-viewer]).
The standalone Aspire dashboard is one container, keeps nothing by default, and renders `gen_ai.*` messages as a chat ([aspire-standalone], [otel-blog-genai]).

**Claude Code's own traffic is separate.** Whatever the viewer, Claude Code sends operational metrics and error reports to Anthropic unless `DISABLE_TELEMETRY`, `DISABLE_ERROR_REPORTING` or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` is set, and keeps transcripts in plain text under `~/.claude/projects/` ([cc-data-usage]).

**What it means for Guildmaster** (inference):

- For a waterfall of `gm`'s own spans, Jaeger v2 is the smallest choice: one Apache-2.0 binary, OTLP in, links shown, and the waterfall the patron named in requirement 6.2. It stores traces only.
- For LLM views (sessions, tokens, cost) on one machine, Phoenix is the lightest: one container, `session.id` grouping, `gen_ai.*` conversion. It also stores traces only, under the Elastic License.
- Langfuse has the richest LLM views but four stateful services and Enterprise-only retention controls; SigNoz and `otel-lgtm` are the options that keep all three of Claude Code's signals.
- Because Claude Code's richest numbers (cost, effort, model per call) arrive as log events, and because its names need renaming for any LLM view, a step that receives all three signals and renames them is needed whichever viewer is chosen; in the design that step is `gm trace import`.

## How other orchestrators trace

| System | Trace and span model | Conversation grouping | Per model call | Privacy default |
| --- | --- | --- | --- | --- |
| Firstmate | A W3C `traceparent` minted per task, injected as `TRACEPARENT` and recorded in the task's metadata; no spans of its own | None | Nothing; an opt-in fleet ledger records dispatch, status, PR and merge events | Default-off |
| Claude Agent SDK | Produces no telemetry itself; the Claude Code child exports, and the SDK injects `TRACEPARENT` from the caller's active span | `session.id`, `prompt.id` | As Claude Code | As Claude Code |
| OpenAI Agents SDK | One trace per run, spans for agent, generation, function, handoff, guardrail; non-W3C ids | `group_id` "to link multiple traces from the same conversation" | Model, config, usage; no cost | On by default, exporting to OpenAI's backend, with sensitive data included by default |
| LangSmith (LangGraph, LangChain) | Runs nested in traces, at most 25,000 runs per trace | Threads, by `thread_id` or `session_id` metadata on every run | Tokens; cost from price tables | Inputs and outputs sent unless hidden |
| CrewAI | Anonymous telemetry to CrewAI's server by default (roles and tool names, no prompts); a separate opt-in tracing service | Telemetry session | Tokens and cost in its tracing service | Telemetry on by default |
| AutoGen, Microsoft Agent Framework | OpenTelemetry GenAI spans (`invoke_agent`, `chat`, `execute_tool`); messages between agents are **linked**, not parented, "because the execution is not nested" | Workflow run spans | GenAI token attributes and metrics | Sensitive data off by default |
| Google ADK, Pydantic AI | GenAI spans; Pydantic AI keeps agent-run token totals in its own namespace so backends do not double count | `gen_ai.conversation.id` from the session | Tokens; Pydantic AI records cost when the price is known | ADK unverified; Pydantic AI captures content unless disabled |

Sources: Firstmate `docs/trace-context.md:16-28` and `docs/trace-context.md:42-66`, `docs/fleet-ledger.md:28-38`; [cc-sdk-observability]; [openai-tracing]; [langsmith-concepts], [langsmith-threads]; [crewai-telemetry], [crewai-tracing]; [autogen-telemetry], [maf-observability], [maf-workflows]; [adk-traces], [pydantic-logfire].

**Firstmate's rule, in its own words.** A task's carrier is minted once and reused verbatim on relaunch; the spawning process's own `TRACEPARENT` is never adopted, because a persistent Secondmate keeps it "for its whole life while unrelated requests are routed through it" and adopting it "would chain every routed task into one ever-growing trace per Secondmate" (`docs/trace-context.md:44-48`).
Firstmate emits no spans and deliberately defers "any embedded OTLP" until an observer shows a gap (`docs/trace-context.md:113`).

**Claude Code exporters others have built.** Langfuse reads the transcript from a `Stop` hook, one trace per turn grouped by session ([langfuse-claude-code]); LangSmith's plugin is hook-based too, groups a session's turns by `thread_id`, can nest `claude -p` traces under an existing run, and has a "mute" mode that keeps structure and tokens without content ([langsmith-claude-code]); MLflow's `Stop`-hook integration undercounted tokens until fixed, because of repeated transcript entries ([mlflow-25839]); a community project sends every hook event to a local SQLite database and a live web view, without OpenTelemetry ([disler-hooks-observability]).

**What it means for Guildmaster** (inference):

- Mint one trace per posting and record it before launch; never adopt an ambient `TRACEPARENT` in a supervisor (Firstmate).
- Keep a grouping key apart from the trace id, as OpenAI's `group_id`, LangSmith's `thread_id` and `gen_ai.conversation.id` do: the posting reference on every span.
- Join long-lived supervisors to the work they routed by links, as Microsoft Agent Framework does for work that is not nested.
- Take per-call numbers from Claude Code's telemetry, not from transcripts.
- Sum usage carefully: subagent and agent-run totals double count unless one level owns them.
- Keep content off by default; redaction by pattern is "a safety net rather than a guarantee" ([langsmith-claude-code]).
- Keep high-cardinality ids off metric labels.

## Sources

[cc-monitoring]: https://code.claude.com/docs/en/monitoring-usage
[cc-env-vars]: https://code.claude.com/docs/en/env-vars
[cc-hooks]: https://code.claude.com/docs/en/hooks
[cc-statusline]: https://code.claude.com/docs/en/statusline
[cc-headless]: https://code.claude.com/docs/en/headless
[cc-sessions]: https://code.claude.com/docs/en/sessions
[cc-sdk-observability]: https://code.claude.com/docs/en/agent-sdk/observability
[cc-sdk-cost]: https://code.claude.com/docs/en/agent-sdk/cost-tracking
[cc-sdk-ts]: https://code.claude.com/docs/en/agent-sdk/typescript
[cc-issue-54010]: https://github.com/anthropics/claude-code/issues/54010
[cc-issue-54629]: https://github.com/anthropics/claude-code/issues/54629
[cc-issue-61517]: https://github.com/anthropics/claude-code/issues/61517
[cc-issue-76391]: https://github.com/anthropics/claude-code/issues/76391
[cc-issue-41836]: https://github.com/anthropics/claude-code/issues/41836#issuecomment-5823539274
[semconv-1.39]: https://github.com/open-telemetry/semantic-conventions/releases/tag/v1.39.0
[semconv-1.41-genai]: https://github.com/open-telemetry/semantic-conventions/blob/v1.41.0/docs/gen-ai/README.md
[semconv-1.42]: https://github.com/open-telemetry/semantic-conventions/releases/tag/v1.42.0
[semconv-1.44-genai]: https://github.com/open-telemetry/semantic-conventions/blob/v1.44.0/docs/registry/attributes/gen-ai.md
[genai-readme]: https://github.com/open-telemetry/semantic-conventions-genai/blob/b31e9e8ea26ac1c086d3313d474e31d7c3f391ae/README.md
[genai-registry]: https://github.com/open-telemetry/semantic-conventions-genai/blob/b31e9e8ea26ac1c086d3313d474e31d7c3f391ae/docs/registry/attributes/gen-ai.md
[genai-spans]: https://github.com/open-telemetry/semantic-conventions-genai/blob/b31e9e8ea26ac1c086d3313d474e31d7c3f391ae/docs/gen-ai/gen-ai-spans.md
[genai-agent-spans]: https://github.com/open-telemetry/semantic-conventions-genai/blob/b31e9e8ea26ac1c086d3313d474e31d7c3f391ae/docs/gen-ai/gen-ai-agent-spans.md
[genai-events]: https://github.com/open-telemetry/semantic-conventions-genai/blob/b31e9e8ea26ac1c086d3313d474e31d7c3f391ae/docs/gen-ai/gen-ai-events.md
[genai-metrics]: https://github.com/open-telemetry/semantic-conventions-genai/blob/b31e9e8ea26ac1c086d3313d474e31d7c3f391ae/docs/gen-ai/gen-ai-metrics.md
[genai-anthropic]: https://github.com/open-telemetry/semantic-conventions-genai/blob/b31e9e8ea26ac1c086d3313d474e31d7c3f391ae/docs/gen-ai/anthropic.md
[genai-mcp]: https://github.com/open-telemetry/semantic-conventions-genai/blob/b31e9e8ea26ac1c086d3313d474e31d7c3f391ae/docs/gen-ai/mcp.md
[genai-440]: https://github.com/open-telemetry/semantic-conventions-genai/blob/b31e9e8ea26ac1c086d3313d474e31d7c3f391ae/changelog.d/440.breaking.md
[genai-258]: https://github.com/open-telemetry/semantic-conventions-genai/pull/258
[genai-447]: https://github.com/open-telemetry/semantic-conventions-genai/pull/447
[genai-511]: https://github.com/open-telemetry/semantic-conventions-genai/issues/511
[genai-451]: https://github.com/open-telemetry/semantic-conventions-genai/issues/451
[genai-250]: https://github.com/open-telemetry/semantic-conventions-genai/issues/250
[genai-546]: https://github.com/open-telemetry/semantic-conventions-genai/issues/546
[genai-477]: https://github.com/open-telemetry/semantic-conventions-genai/issues/477
[genai-493]: https://github.com/open-telemetry/semantic-conventions-genai/issues/493
[otel-util-genai]: https://github.com/open-telemetry/opentelemetry-python-contrib/blob/main/util/opentelemetry-util-genai/README.rst
[otel-env-carriers]: https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/context/env-carriers.md
[otel-spec-1.59]: https://github.com/open-telemetry/opentelemetry-specification/releases/tag/v1.59.0
[npm-env-carrier]: https://registry.npmjs.org/@opentelemetry%2fpropagator-env-carrier
[w3c-tc1]: https://www.w3.org/TR/trace-context-1/
[w3c-tc2]: https://www.w3.org/TR/trace-context-2/
[mcp-2026-07-28-basic]: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/index.mdx
[mcp-2025-11-25-basic]: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-11-25/basic/index.mdx
[mcp-sep-414]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/414
[mcp-sep-2028]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2028
[mcp-python-otel]: https://github.com/modelcontextprotocol/python-sdk/blob/main/docs/run/opentelemetry.md
[mcp-ts-2270]: https://github.com/modelcontextprotocol/typescript-sdk/pull/2270
[openai-tracing]: https://openai.github.io/openai-agents-python/tracing/
[langsmith-concepts]: https://docs.langchain.com/langsmith/observability-concepts
[langsmith-threads]: https://docs.langchain.com/langsmith/threads
[langsmith-claude-code]: https://docs.langchain.com/langsmith/trace-claude-code
[langsmith-otel]: https://docs.langchain.com/langsmith/trace-with-opentelemetry
[crewai-telemetry]: https://docs.crewai.com/en/telemetry
[crewai-tracing]: https://docs.crewai.com/en/observability/tracing
[autogen-telemetry]: https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/framework/telemetry.html
[maf-observability]: https://learn.microsoft.com/en-us/agent-framework/agents/observability
[maf-workflows]: https://learn.microsoft.com/en-us/agent-framework/workflows/observability
[adk-traces]: https://adk.dev/observability/traces/
[pydantic-logfire]: https://pydantic.dev/docs/ai/integrations/logfire/
[langfuse-claude-code]: https://langfuse.com/integrations/developer-tools/claude-code
[mlflow-25839]: https://github.com/mlflow/mlflow/issues/25839
[disler-hooks-observability]: https://github.com/disler/claude-code-hooks-multi-agent-observability

[cc-data-usage]: https://code.claude.com/docs/en/data-usage
[honeycomb-agents]: https://docs.honeycomb.io/send-data/use-cases/agents
[honeycomb-pricing]: https://www.honeycomb.io/pricing
[honeycomb-otel]: https://docs.honeycomb.io/send-data/opentelemetry/
[jaeger-arch]: https://www.jaegertracing.io/docs/latest/architecture/
[jaeger-start]: https://www.jaegertracing.io/docs/latest/getting-started/
[jaeger-ui-releases]: https://github.com/jaegertracing/jaeger-ui/releases
[jaeger-ui-4433]: https://github.com/jaegertracing/jaeger-ui/issues/4433
[tempo-config]: https://grafana.com/docs/tempo/latest/configuration/
[otel-lgtm]: https://github.com/grafana/docker-otel-lgtm
[grafana-config]: https://grafana.com/docs/grafana/latest/setup-grafana/configure-grafana/
[grafana-ai-obs]: https://grafana.com/products/cloud/ai-observability/
[grafana-cc]: https://grafana.com/docs/grafana-cloud/observe-and-act/monitor-infrastructure/integrations/integration-reference/integration-claude-code/
[claude-code-otel]: https://github.com/ColeMurray/claude-code-otel
[signoz-repo]: https://github.com/SigNoz/signoz
[signoz-pricing]: https://signoz.io/pricing/
[signoz-ai]: https://signoz.io/docs/ai-observability/
[signoz-cc]: https://signoz.io/docs/claude-code-monitoring/
[signoz-telemetry]: https://signoz.io/docs/telemetry/
[langfuse-selfhost]: https://langfuse.com/self-hosting
[langfuse-compose]: https://langfuse.com/self-hosting/docker-compose
[langfuse-pricing]: https://langfuse.com/pricing
[langfuse-selfhost-pricing]: https://langfuse.com/pricing-self-host
[langfuse-otel]: https://langfuse.com/integrations/native/opentelemetry
[langfuse-cc]: https://langfuse.com/integrations/other/claude-code
[langfuse-telemetry]: https://langfuse.com/self-hosting/security/telemetry
[phoenix-repo]: https://github.com/Arize-ai/phoenix
[phoenix-license]: https://github.com/Arize-ai/phoenix/blob/main/LICENSE
[phoenix-docker]: https://arize.com/docs/phoenix/self-hosting/deployment-options/docker
[phoenix-semconv]: https://arize.com/docs/phoenix/release-notes/05-2026/05-15-2026-otel-semconv-conversion
[phoenix-sessions]: https://arize.com/docs/phoenix/tracing/how-to-tracing/setup-tracing/setup-sessions
[phoenix-cc]: https://arize.com/docs/phoenix/integrations/coding-agents/claude-code
[arize-pricing]: https://arize.com/pricing/
[langsmith-selfhost]: https://docs.langchain.com/langsmith/self-hosted
[langsmith-pricing]: https://www.langchain.com/pricing
[weave-selfhost]: https://docs.coreweave.com/products/wandb/weave/guides/platform/weave-self-managed
[weave-pricing]: https://coreweave.com/forge-pricing
[weave-otel]: https://docs.coreweave.com/weave/guides/tracking/otel
[weave-cc]: https://docs.coreweave.com/weave/guides/integrations/claude_code
[agentops-app]: https://github.com/AgentOps-AI/agentops/blob/main/app/README.md
[agentops-site]: https://www.agentops.ai/
[agentops-concepts]: https://docs.agentops.ai/v2/concepts/core-concepts
[laminar-selfhost]: https://laminar.sh/docs/self-hosting
[laminar-pricing]: https://laminar.sh/pricing
[laminar-otel]: https://laminar.sh/docs/tracing/otel
[laminar-cc]: https://laminar.sh/docs/tracing/integrations/claude-code
[laminar-attrs]: https://laminar.sh/docs/tracing/structure/span-attribute-reference
[laminar-repo]: https://github.com/lmnr-ai/lmnr
[helicone-docker]: https://docs.helicone.ai/getting-started/self-host/docker
[helicone-pricing]: https://www.helicone.ai/pricing
[helicone-cc]: https://docs.helicone.ai/integrations/anthropic/claude-code
[helicone-blog]: https://www.helicone.ai/blog/joining-mintlify
[braintrust-selfhost]: https://www.braintrust.dev/docs/admin/self-hosting
[braintrust-pricing]: https://www.braintrust.dev/pricing
[braintrust-otel]: https://www.braintrust.dev/docs/integrations/sdk-integrations/opentelemetry
[braintrust-cc-otel]: https://www.braintrust.dev/docs/kb/setup-claude-code-with-otel-tracing-1781641599984
[braintrust-cc]: https://www.braintrust.dev/docs/integrations/developer-tools/claude-code
[mlflow-cc]: https://mlflow.org/docs/latest/genai/tracing/integrations/listing/claude_code/
[mlflow-semconv]: https://mlflow.org/docs/latest/genai/tracing/opentelemetry/genai-semconv/
[mlflow-usage]: https://mlflow.org/docs/latest/community/usage-tracking/
[openobserve-repo]: https://github.com/openobserve/openobserve
[openobserve-cc]: https://openobserve.ai/docs/integration/ai/claude-code-tracing/
[otel-desktop-viewer]: https://github.com/CtrlSpice/otel-desktop-viewer
[aspire-standalone]: https://aspire.dev/dashboard/standalone/
[otel-blog-genai]: https://opentelemetry.io/blog/2026/genai-observability/
