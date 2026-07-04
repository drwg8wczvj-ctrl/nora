import Stripe from "stripe";

const PRICE_IDS = {
  plus_monthly:  process.env.STRIPE_PRICE_PLUS_MONTHLY,
  plus_yearly:   process.env.STRIPE_PRICE_PLUS_YEARLY,
  pro_monthly:   process.env.STRIPE_PRICE_PRO_MONTHLY,
  pro_yearly:    process.env.STRIPE_PRICE_PRO_YEARLY,
  team_monthly:  process.env.STRIPE_PRICE_TEAM_MONTHLY,
  team_yearly:   process.env.STRIPE_PRICE_TEAM_YEARLY,
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.status(503).json({ error: "Stripe not configured" });

  const { planKey, yearly, userId, email } = req.body ?? {};
  if (!planKey) return res.status(400).json({ error: "planKey required" });

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
    return res.status(500).json({ error: e.message });
  }
}
