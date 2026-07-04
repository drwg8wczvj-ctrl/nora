import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end",  () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const secretKey     = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl   = process.env.REACT_APP_SUPABASE_URL;
  const serviceKey    = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secretKey || !webhookSecret) return res.status(503).end();

  const stripe = new Stripe(secretKey, { apiVersion: "2023-10-16" });
  const rawBody = await getRawBody(req);
  const sig     = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (e) {
    return res.status(400).json({ error: `Webhook signature failed: ${e.message}` });
  }

  // Only update Supabase if service role key is configured
  const updateUser = async (userId, subscriptionPatch) => {
    if (!supabaseUrl || !serviceKey || !userId) return;
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: existing } = await supabase
      .from("user_app_data")
      .select("preferences")
      .eq("user_id", userId)
      .single();
    const prefs = existing?.preferences ?? {};
    await supabase
      .from("user_app_data")
      .upsert({ user_id: userId, preferences: { ...prefs, subscription: subscriptionPatch } });
  };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId  = session.metadata?.userId;
        const plan    = session.metadata?.plan;
        if (userId && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          await updateUser(userId, {
            plan, status: sub.status,
            interval: sub.items.data[0]?.plan?.interval ?? "month",
            stripeCustomerId:     session.customer,
            stripeSubscriptionId: session.subscription,
            currentPeriodEnd:     sub.current_period_end,
            cancelAtPeriodEnd:    sub.cancel_at_period_end,
          });
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub    = event.data.object;
        const userId = sub.metadata?.userId;
        if (userId) {
          await updateUser(userId, {
            status:              sub.status,
            currentPeriodEnd:    sub.current_period_end,
            cancelAtPeriodEnd:   sub.cancel_at_period_end,
          });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub    = event.data.object;
        const userId = sub.metadata?.userId;
        if (userId) {
          await updateUser(userId, { plan: "free", status: "canceled" });
        }
        break;
      }
    }
    return res.json({ received: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
