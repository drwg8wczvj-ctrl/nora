const { z } = require("zod");

function parseBody(res, schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      ok: false,
      response: res.status(400).json({
        error: "Invalid request",
        fields: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      }),
    };
  }
  return { ok: true, data: result.data };
}

const userIdIgnored = z.string().optional();

const schemas = {
  chat: z.object({
    messages: z.array(z.object({
      role: z.enum(["system", "user", "assistant", "tool"]),
      content: z.any().optional(),
      tool_calls: z.array(z.any()).optional(),
      tool_call_id: z.string().optional(),
    }).passthrough()).min(1).max(60),
    tools: z.array(z.any()).max(30).optional(),
    includeResearchTool: z.boolean().optional(),
  }),
  tips: z.object({
    type: z.enum(["morning", "focus_start", "focus_complete", "chat_prompts", "status_coach", "morning_briefing"]),
    context: z.record(z.string(), z.any()).optional(),
  }),
  intelligenceExtract: z.object({
    message: z.string().trim().min(1).max(8_000),
    context: z.string().max(4_000).nullable().optional(),
    sourceType: z.enum(["manual", "gmail", "telegram"]).optional(),
    sourceId: z.string().max(500).nullable().optional(),
    senderName: z.string().max(300).nullable().optional(),
    sourceAccountId: z.uuid().nullable().optional(),
    userId: userIdIgnored,
  }),
  telegramPhone: z.object({
    phone: z.string().trim().min(6).max(30),
    userId: userIdIgnored,
  }),
  telegramCode: z.object({
    code: z.string().trim().min(1).max(20),
    password: z.string().max(300).optional(),
    userId: userIdIgnored,
  }),
  checkout: z.object({
    planKey: z.enum(["plus", "pro", "team"]),
    yearly: z.boolean().optional(),
    userId: userIdIgnored,
    email: z.string().optional(),
  }),
};

module.exports = { parseBody, schemas };
