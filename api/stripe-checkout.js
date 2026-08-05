import Stripe from "stripe";
const { applyCors } = require("./_cors");
const { requireUser } = require("./_auth");
const { enforceRateLimit } = require("./_rateLimit");
const { internalError } = require("./_errors");
const { parseBody, schemas } = require("./_validation");

const PRICE_IDS = {
  plus_monthly:  process.env.STRIPE_PRICE_PLUS_MONTHLY,
  plus_yearly:   process.env.STRIPE_PRICE_PLUS_YEARLY,
  pro_monthly:   process.env.STRIPE_PRICE_PRO_MONTHLY,
  pro_yearly:    process.env.STRIPE_PRICE_PRO_YEARLY,
  team_monthly:  process.env.STRIPE_PRICE_TEAM_MONTHLY,
  team_yearly:   process.env.STRIPE_PRICE_TEAM_YEARLY,
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!await enforceRateLimit(req, res, auth.user.id, "checkout")) return;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.status(503).json({ error: "Stripe not configured" });

  const parsedBody = parseBody(res, schemas.checkout, req.body ?? {});
  if (!parsedBody.ok) return;
  const { planKey, yearly = false } = parsedBody.data;
  const userId = auth.user.id;
  const email = auth.user.email;
  const priceId = PRICE_IDS[`${planKey}_${yearly ? "yearly" : "monthly"}`];
  if (!priceId) return res.status(400).json({ error: `Price ID not configured for ${planKey} ${yearly ? "yearly" : "monthly"}. Set STRIPE_PRICE_${planKey.toUpperCase()}_${yearly ? "YEARLY" : "MONTHLY"} in Vercel environment variables.` });

  const stripe = new Stripe(secretKey, { apiVersion: "2023-10-16" });
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.REACT_APP_URL ?? "https://my-planner.vercel.app";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email || undefined,
      subscription_data: {
        trial_period_days: 7,
        metadata: { userId: userId ?? "", plan: planKey },
      },
      metadata: { userId: userId ?? "", plan: planKey },
      success_url: `${baseUrl}/?checkout=success&plan=${planKey}`,
      cancel_url:  `${baseUrl}/?checkout=canceled`,
    });
    return res.json({ url: session.url });
  } catch (e) {
    return internalError(res, e, "stripe-checkout");
  }
}
