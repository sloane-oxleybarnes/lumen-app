import Stripe from "stripe";

// Stripe is stubbed — no live keys yet
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
