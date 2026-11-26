// Provider 模板 — 知名模型预配置
// 用户只需填入 API Key 即可使用
//
// 2026-08-02：全部模板经官方文档实地查证（base URL + 在售模型 ID），
// 模型 ID 为当前有效版本。已下架的历史 ID（deepseek-chat/reasoner、glm-4-plus、
// moonshot-v1-*、hunyuan-*、step-1/2、qwen3-235b-a22b 等）不再收录。
//
// capabilities 字段语义：**明确支持才声明**。未声明 ≠ 不支持，按"未知"处理。
//   - 这样新模型/第三方 provider 自动归"未知"，UI 不冤枉它
//   - 只有 capabilities 显式存在但不含 'vision' 时，才提示用户"模型可能不支持图片"
//   - vision：支持图片输入（多模态视觉）
//   - tools：支持 function calling / 工具调用
//   - reasoning：原生推理模型（o-series / deepseek-v4-pro / step-3.7 等）

export type ModelCapability = 'vision' | 'tools' | 'reasoning'

export interface ProviderTemplate {
  id: string
  name: string
  type: 'openai-compatible' | 'anthropic'
  endpoint: string
  models: { id: string; name: string; description?: string; capabilities?: ModelCapability[] }[]
  /** 获取 API Key 的环境变量名（供参考） */
  envKey?: string
  website?: string
}

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai-compatible',
    endpoint: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
    website: 'https://platform.openai.com/api-keys',
    models: [
      // gpt-4o / o3 / o4-mini 已 deprecated（o3/o4-mini 由 GPT-5 系列取代）
      { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', description: '均衡旗舰（默认）', capabilities: ['vision', 'tools'] },
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', description: '前沿推理', capabilities: ['vision', 'tools', 'reasoning'] },
      { id: 'gpt-5.5', name: 'GPT-5.5', description: '上一代旗舰', capabilities: ['vision', 'tools'] },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    endpoint: 'https://api.anthropic.com/v1',
    envKey: 'ANTHROPIC_API_KEY',
    website: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', description: '旗舰 Coding，1M 上下文', capabilities: ['vision', 'tools'] },
      { id: 'claude-opus-5', name: 'Claude Opus 5', description: '最强推理', capabilities: ['vision', 'tools', 'reasoning'] },
      { id: 'claude-fable-5', name: 'Claude Fable 5', description: 'Mythos 档新旗舰', capabilities: ['vision', 'tools', 'reasoning'] },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', description: '极速轻量', capabilities: ['vision', 'tools'] },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'openai-compatible',
    endpoint: 'https://api.deepseek.com/v1',
    envKey: 'DEEPSEEK_API_KEY',
    website: 'https://platform.deepseek.com/api_keys',
    models: [
      // 旧 ID deepseek-chat / deepseek-reasoner 已于 2026-07-24 停用，请求直接报错
      { id: 'deepseek-v4-flash', name: 'DeepSeek-V4 Flash', description: '默认模型，性价比', capabilities: ['tools'] },
      { id: 'deepseek-v4-pro', name: 'DeepSeek-V4 Pro', description: '旗舰，默认深度思考', capabilities: ['tools', 'reasoning'] },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    type: 'openai-compatible',
    endpoint: 'https://api.groq.com/openai/v1',
    envKey: 'GROQ_API_KEY',
    website: 'https://console.groq.com/keys',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', description: '通用高速', capabilities: ['tools'] },
      { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', description: '开源旗舰', capabilities: ['tools'] },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', description: '极速轻量', capabilities: ['tools'] },
    ],
  },
  {
    id: 'alibaba',
    name: '阿里云百炼',
    type: 'openai-compatible',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    envKey: 'DASHSCOPE_API_KEY',
    website: 'https://bailian.console.aliyun.com/',
    models: [
      // qwen3-235b-a22b / qwen-coder-plus 已被 qwen3.5 系列取代
      { id: 'qwen3.7-max', name: 'Qwen3.7 Max', description: '旗舰模型', capabilities: ['tools'] },
      { id: 'qwen3.5-plus', name: 'Qwen3.5 Plus', description: '均衡主力', capabilities: ['tools'] },
      { id: 'qwen3.5-flash', name: 'Qwen3.5 Flash', description: '高速经济', capabilities: ['tools'] },
      { id: 'qwen3.5-omni-plus', name: 'Qwen3.5 Omni Plus', description: '多模态旗舰', capabilities: ['vision', 'tools'] },
    ],
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    type: 'openai-compatible',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4',
    envKey: 'ZHIPU_API_KEY',
    website: 'https://open.bigmodel.cn/',
    models: [
      // glm-4-plus / glm-4-flash 已不在官方模型参数可选值
      { id: 'glm-5.2', name: 'GLM-5.2', description: '旗舰，1M 上下文', capabilities: ['tools'] },
      { id: 'glm-5.1', name: 'GLM-5.1', description: '上一代旗舰', capabilities: ['tools'] },
      { id: 'glm-4.7', name: 'GLM-4.7', description: '实惠之选', capabilities: ['tools'] },
    ],
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    type: 'openai-compatible',
    endpoint: 'https://api.moonshot.cn/v1',
    envKey: 'MOONSHOT_API_KEY',
    website: 'https://platform.moonshot.cn/',
    models: [
      // moonshot-v1-8k/32k/128k 已停产，全面转向 K2/K3 系列
      { id: 'kimi-k3', name: 'Kimi K3', description: '最新旗舰，1M 上下文', capabilities: ['tools'] },
      { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', description: 'Coding 专用，始终思考', capabilities: ['tools', 'reasoning'] },
      { id: 'kimi-k2.6', name: 'Kimi K2.6', description: '旗舰模型', capabilities: ['tools'] },
    ],
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    type: 'openai-compatible',
    endpoint: 'https://api.siliconflow.cn/v1',
    envKey: 'SILICONFLOW_API_KEY',
    website: 'https://siliconflow.cn/',
    models: [
      // 具体 ID 以 GET https://api.siliconflow.cn/v1/models 为准（{org}/{model} 格式）
      // 9B 以下模型永久免费
      { id: 'deepseek-ai/DeepSeek-V3.2', name: 'DeepSeek-V3.2', description: '通用旗舰', capabilities: ['tools'] },
      { id: 'Qwen/Qwen3.5-Plus', name: 'Qwen3.5 Plus', description: '阿里旗舰', capabilities: ['tools'] },
    ],
  },
  {
    id: 'volcengine',
    name: '火山方舟（豆包）',
    type: 'openai-compatible',
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3',
    envKey: 'ARK_API_KEY',
    website: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apikey',
    models: [
      // 注意：通用接口 /api/v3 与 Coding Plan（/api/coding/v3）两套 Key 不可混用，否则产生额外费用
      // 豆包全系有每人 50 万 tokens 免费推理额度
      { id: 'doubao-seed-2-1-pro-260628', name: 'Doubao Seed 2.1 Pro', description: '旗舰深度思考，Coding+Agent 长链路', capabilities: ['vision', 'tools', 'reasoning'] },
      { id: 'doubao-seed-2-1-turbo-260628', name: 'Doubao Seed 2.1 Turbo', description: '轻量深度思考', capabilities: ['vision', 'tools', 'reasoning'] },
      { id: 'doubao-seed-1-6', name: 'Doubao Seed 1.6', description: '多模态 + 工具调用', capabilities: ['vision', 'tools'] },
      { id: 'doubao-1.5-vision-pro-250328', name: 'Doubao 1.5 Vision Pro', description: '视觉理解', capabilities: ['vision'] },
      { id: 'doubao-lite-32k', name: 'Doubao Lite 32K', description: '免费额度主力' },
    ],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    type: 'openai-compatible',
    endpoint: 'https://api.minimaxi.com/v1',
    envKey: 'MINIMAX_API_KEY',
    website: 'https://platform.minimaxi.com',
    models: [
      // 国内域名 minimaxi.com 与国际 minimax.io 的 Key 不互通；abab 系列已停售
      { id: 'MiniMax-M3', name: 'MiniMax-M3', description: '旗舰，原生多模态，1M 上下文', capabilities: ['vision', 'tools', 'reasoning'] },
      { id: 'MiniMax-M2.7', name: 'MiniMax-M2.7', description: '推理 + 工具调用', capabilities: ['tools', 'reasoning'] },
      { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax-M2.7 HighSpeed', description: '高速版', capabilities: ['tools'] },
    ],
  },
  {
    id: 'stepfun',
    name: '阶跃星辰',
    type: 'openai-compatible',
    endpoint: 'https://api.stepfun.com/v1',
    envKey: 'STEP_API_KEY',
    website: 'https://platform.stepfun.com/interface-key',
    models: [
      // step-1/step-2 系列已于 2026-07-08 下线
      { id: 'step-3.7-flash', name: 'Step 3.7 Flash', description: '旗舰多模态推理，256K', capabilities: ['vision', 'tools', 'reasoning'] },
      { id: 'step-3.5-flash', name: 'Step 3.5 Flash', description: '语言推理', capabilities: ['tools', 'reasoning'] },
      { id: 'step-1o-turbo-vision', name: 'Step-1o Turbo Vision', description: '视觉理解', capabilities: ['vision'] },
    ],
  },
  {
    id: 'xfyun',
    name: '讯飞星火',
    type: 'openai-compatible',
    endpoint: 'https://spark-api-open.xf-yun.com/v1',
    envKey: 'SPARK_API_KEY',
    website: 'https://console.xfyun.cn/services/cbm',
    models: [
      // 模型 ID 大小写敏感（4.0Ultra）；各版本 APIPassword 独立，需在控制台对应页面获取
      // 深度推理模型 spark-x 走 /x2/ 独立端点，不在此模板内
      { id: 'lite', name: '星火 Lite', description: '官方免费' },
      { id: '4.0Ultra', name: '星火 4.0 Ultra', description: '旗舰，工具调用', capabilities: ['tools'] },
      { id: 'max-32k', name: '星火 Max 32K', description: '长上下文' },
    ],
  },
  {
    id: 'baidu',
    name: '百度千帆（文心）',
    type: 'openai-compatible',
    endpoint: 'https://qianfan.baidubce.com/v2',
    envKey: 'QIANFAN_API_KEY',
    website: 'https://console.bce.baidu.com/qianfan/ais/console/apiKey',
    models: [
      // API Key 为 bce-v3/ALTAK- 开头（IAM Bearer 体系）
      // ernie-speed/lite/tiny 系列官方免费（限 RPM/TPM）
      { id: 'ernie-5.1', name: 'ERNIE 5.1', description: '通用旗舰', capabilities: ['tools'] },
      { id: 'ernie-4.5', name: 'ERNIE 4.5', description: '文本旗舰', capabilities: ['tools'] },
      { id: 'ernie-x1', name: 'ERNIE X1', description: '深度推理', capabilities: ['tools', 'reasoning'] },
      { id: 'ernie-4.5-turbo-vl-preview', name: 'ERNIE 4.5 Turbo VL', description: '多模态视觉', capabilities: ['vision', 'tools'] },
      { id: 'ernie-speed-8k', name: 'ERNIE Speed 8K', description: '官方免费（限流）' },
    ],
  },
  {
    id: 'tokenhub',
    name: '腾讯混元（TokenHub）',
    type: 'openai-compatible',
    endpoint: 'https://tokenhub.tencentmaas.com/v1',
    envKey: 'TOKENHUB_API_KEY',
    website: 'https://console.cloud.tencent.com/tokenhub/apikey',
    models: [
      // 老混元平台（hunyuan-pro/turbo/lite/t1 等 46 款）已于 2026-06-22 下线，勿用旧 ID
      { id: 'hy3', name: '混元 Hy3', description: '256K，工具 + 推理', capabilities: ['tools', 'reasoning'] },
      { id: 'hy3-preview', name: '混元 Hy3 Preview', description: '推理增强版', capabilities: ['tools', 'reasoning'] },
    ],
  },
  {
    id: 'opencode',
    name: 'OpenCode Zen',
    type: 'openai-compatible',
    endpoint: 'https://opencode.ai/zen/v1',
    envKey: 'OPENCODE_API_KEY',
    website: 'https://opencode.ai/auth',
    models: [
      // 免费模型列表会轮换，完整目录见 GET https://opencode.ai/zen/v1/models
      // 部分免费模型可用 public 匿名 Key；OpenCode Go 订阅服务走 /zen/go/v1
      { id: 'deepseek-v4-flash-free', name: 'DeepSeek-V4 Flash Free', description: '免费模型' },
      { id: 'qwen3.6-plus-free', name: 'Qwen3.6 Plus Free', description: '免费模型' },
      { id: 'minimax-m3-free', name: 'MiniMax-M3 Free', description: '免费模型' },
    ],
  },
]

/** Coding Plan — 推荐用于编程的模型组合 */
export const CODING_PLANS = [
  {
    name: 'MiMo Free',
    description: 'MiMo 免费模型，随时可用',
    providerId: 'mimo',
    modelId: '',
    icon: '🚀',
    requiresKey: false,
  },
  {
    name: 'Claude Code',
    description: 'Claude Sonnet 5 — AI 编程标杆',
    providerId: 'anthropic',
    modelId: 'claude-sonnet-5',
    icon: '🧠',
    requiresKey: true,
  },
  {
    name: 'GPT Coder',
    description: 'GPT-5.6 Terra — OpenAI 均衡旗舰',
    providerId: 'openai',
    modelId: 'gpt-5.6-terra',
    icon: '⚡',
    requiresKey: true,
  },
  {
    name: 'DeepSeek Coder',
    description: 'DeepSeek-V4 Flash — 国产性价比之选',
    providerId: 'deepseek',
    modelId: 'deepseek-v4-flash',
    icon: '🐋',
    requiresKey: true,
  },
  {
    name: 'Kimi Coder',
    description: 'Kimi K2.7 Code — Coding 专用推理',
    providerId: 'moonshot',
    modelId: 'kimi-k2.7-code',
    icon: '🔷',
    requiresKey: true,
  },
  {
    name: 'GLM Coder',
    description: 'GLM-5.2 — 智谱旗舰 1M 上下文',
    providerId: 'zhipu',
    modelId: 'glm-5.2',
    icon: '💠',
    requiresKey: true,
  },
  {
    name: 'Qwen Coder',
    description: 'Qwen3.5 Plus — 通义千问旗舰',
    providerId: 'alibaba',
    modelId: 'qwen3.5-plus',
    icon: '☁️',
    requiresKey: true,
  },
  {
    name: '豆包 Coder',
    description: 'Doubao Seed 2.1 — 深度思考 Coding',
    providerId: 'volcengine',
    modelId: 'doubao-seed-2-1-pro-260628',
    icon: '🔥',
    requiresKey: true,
  },
]
