const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');
const { pool } = require('../config/db.config');
const { v4: uuidv4 } = require('uuid');

class StripeService {
    constructor() {
        this.plans = {
            starter: {
                name: 'Starter',
                priceId: process.env.STRIPE_STARTER_PRICE_ID,
                amount: 2900, // $29.00 in cents
                currency: 'usd',
                interval: 'month',
                features: [
                    '1 Agent',
                    '1,000 Messages/month',
                    'Basic Chat Widget',
                    'Email Support'
                ],
                limits: {
                    maxAgents: 1,
                    maxMessagesPerMonth: 1000
                }
            },
            pro: {
                name: 'Pro',
                priceId: process.env.STRIPE_PRO_PRICE_ID,
                amount: 9900, // $99.00 in cents
                currency: 'usd',
                interval: 'month',
                features: [
                    '5 Agents',
                    '10,000 Messages/month',
                    'Advanced Chat Widget',
                    'WhatsApp Integration',
                    'Google Calendar Integration',
                    'Priority Support'
                ],
                limits: {
                    maxAgents: 5,
                    maxMessagesPerMonth: 10000
                }
            },
            enterprise: {
                name: 'Enterprise',
                priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
                amount: 29900, // $299.00 in cents
                currency: 'usd',
                interval: 'month',
                features: [
                    'Unlimited Agents',
                    'Unlimited Messages',
                    'Advanced Analytics',
                    'Custom Integrations',
                    'Dedicated Support',
                    'White-label Options'
                ],
                limits: {
                    maxAgents: 999,
                    maxMessagesPerMonth: 999999
                }
            }
        };
    }

    // Create Stripe customer
    async createCustomer(email, name, companyId) {
        try {
            const customer = await stripe.customers.create({
                email,
                name,
                metadata: {
                    companyId
                }
            });

            // Update company with Stripe customer ID
            const conn = await pool.getConnection();
            try {
                await conn.query(
                    'UPDATE companies SET stripe_customer_id = ? WHERE id = ?',
                    [customer.id, companyId]
                );
            } finally {
                conn.release();
            }

            return customer;
        } catch (error) {
            console.error('Create Stripe customer error:', error);
            throw error;
        }
    }

    // Create checkout session for subscription
    async createCheckoutSession(companyId, plan, successUrl, cancelUrl) {
        try {
            const planConfig = this.plans[plan];
            if (!planConfig) {
                throw new Error('Invalid plan');
            }

            // Get company details
            const conn = await pool.getConnection();
            try {
                const [companyRows] = await conn.query(
                    'SELECT * FROM companies WHERE id = ?',
                    [companyId]
                );

                if (companyRows.length === 0) {
                    throw new Error('Company not found');
                }

                const company = companyRows[0];

                // Create or get Stripe customer
                let stripeCustomerId = company.stripe_customer_id;
                if (!stripeCustomerId) {
                    const customer = await this.createCustomer(
                        company.email || `company-${companyId}@example.com`,
                        company.name,
                        companyId
                    );
                    stripeCustomerId = customer.id;
                }

                // Create checkout session
                const session = await stripe.checkout.sessions.create({
                    customer: stripeCustomerId,
                    payment_method_types: ['card'],
                    mode: 'subscription',
                    line_items: [
                        {
                            price: planConfig.priceId,
                            quantity: 1
                        }
                    ],
                    success_url: successUrl,
                    cancel_url: cancelUrl,
                    metadata: {
                        companyId,
                        plan
                    },
                    subscription_data: {
                        metadata: {
                            companyId,
                            plan
                        }
                    }
                });

                return session;
            } finally {
                conn.release();
            }
        } catch (error) {
            console.error('Create checkout session error:', error);
            throw error;
        }
    }

    // Create customer portal session
    async createPortalSession(companyId, returnUrl) {
        try {
            // Get company's Stripe customer ID
            const conn = await pool.getConnection();
            try {
                const [companyRows] = await conn.query(
                    'SELECT stripe_customer_id FROM companies WHERE id = ?',
                    [companyId]
                );

                if (companyRows.length === 0 || !companyRows[0].stripe_customer_id) {
                    throw new Error('No Stripe customer found');
                }

                const session = await stripe.billingPortal.sessions.create({
                    customer: companyRows[0].stripe_customer_id,
                    return_url: returnUrl
                });

                return session;
            } finally {
                conn.release();
            }
        } catch (error) {
            console.error('Create portal session error:', error);
            throw error;
        }
    }

    // Handle webhook events
    async handleWebhook(event) {
        switch (event.type) {
            case 'customer.subscription.created':
                await this.handleSubscriptionCreated(event.data.object);
                break;
            case 'customer.subscription.updated':
                await this.handleSubscriptionUpdated(event.data.object);
                break;
            case 'customer.subscription.deleted':
                await this.handleSubscriptionDeleted(event.data.object);
                break;
            case 'invoice.payment_succeeded':
                await this.handlePaymentSucceeded(event.data.object);
                break;
            case 'invoice.payment_failed':
                await this.handlePaymentFailed(event.data.object);
                break;
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
    }

    // Handle subscription created
    async handleSubscriptionCreated(subscription) {
        const conn = await pool.getConnection();
        try {
            const companyId = subscription.metadata.companyId;
            const plan = subscription.metadata.plan;
            const planConfig = this.plans[plan];

            // Create or update subscription record
            await conn.query(`
                INSERT INTO subscriptions (
                    id, company_id, stripe_subscription_id, stripe_customer_id,
                    plan, status, current_period_start, current_period_end,
                    max_agents, max_messages_per_month
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                stripe_subscription_id = VALUES(stripe_subscription_id),
                plan = VALUES(plan),
                status = VALUES(status),
                current_period_start = VALUES(current_period_start),
                current_period_end = VALUES(current_period_end),
                max_agents = VALUES(max_agents),
                max_messages_per_month = VALUES(max_messages_per_month),
                updated_at = CURRENT_TIMESTAMP(3)
            `, [
                uuidv4(),
                companyId,
                subscription.id,
                subscription.customer,
                plan,
                subscription.status,
                new Date(subscription.current_period_start * 1000),
                new Date(subscription.current_period_end * 1000),
                planConfig.limits.maxAgents,
                planConfig.limits.maxMessagesPerMonth
            ]);

            console.log(`Subscription created for company ${companyId}, plan: ${plan}`);
        } finally {
            conn.release();
        }
    }

    // Handle subscription updated
    async handleSubscriptionUpdated(subscription) {
        const conn = await pool.getConnection();
        try {
            const companyId = subscription.metadata.companyId;
            const plan = subscription.metadata.plan;
            const planConfig = this.plans[plan];

            await conn.query(`
                UPDATE subscriptions 
                SET status = ?, current_period_start = ?, current_period_end = ?,
                    max_agents = ?, max_messages_per_month = ?,
                    updated_at = CURRENT_TIMESTAMP(3)
                WHERE stripe_subscription_id = ?
            `, [
                subscription.status,
                new Date(subscription.current_period_start * 1000),
                new Date(subscription.current_period_end * 1000),
                planConfig.limits.maxAgents,
                planConfig.limits.maxMessagesPerMonth,
                subscription.id
            ]);

            console.log(`Subscription updated for company ${companyId}, status: ${subscription.status}`);
        } finally {
            conn.release();
        }
    }

    // Handle subscription deleted
    async handleSubscriptionDeleted(subscription) {
        const conn = await pool.getConnection();
        try {
            const companyId = subscription.metadata.companyId;

            await conn.query(`
                UPDATE subscriptions 
                SET status = 'canceled', updated_at = CURRENT_TIMESTAMP(3)
                WHERE stripe_subscription_id = ?
            `, [subscription.id]);

            console.log(`Subscription deleted for company ${companyId}`);
        } finally {
            conn.release();
        }
    }

    // Handle successful payment
    async handlePaymentSucceeded(invoice) {
        const conn = await pool.getConnection();
        try {
            const subscriptionId = invoice.subscription;
            
            // Update subscription status to active if it was trialing
            await conn.query(`
                UPDATE subscriptions 
                SET status = 'active', updated_at = CURRENT_TIMESTAMP(3)
                WHERE stripe_subscription_id = ?
            `, [subscriptionId]);

            console.log(`Payment succeeded for subscription ${subscriptionId}`);
        } finally {
            conn.release();
        }
    }

    // Handle failed payment
    async handlePaymentFailed(invoice) {
        const conn = await pool.getConnection();
        try {
            const subscriptionId = invoice.subscription;
            
            // Update subscription status to past_due
            await conn.query(`
                UPDATE subscriptions 
                SET status = 'past_due', updated_at = CURRENT_TIMESTAMP(3)
                WHERE stripe_subscription_id = ?
            `, [subscriptionId]);

            console.log(`Payment failed for subscription ${subscriptionId}`);
        } finally {
            conn.release();
        }
    }

    // Get subscription for company
    async getCompanySubscription(companyId) {
        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.query(`
                SELECT * FROM subscriptions 
                WHERE company_id = ? 
                ORDER BY created_at DESC 
                LIMIT 1
            `, [companyId]);

            return rows[0] || null;
        } finally {
            conn.release();
        }
    }

    // Check if company has active subscription
    async hasActiveSubscription(companyId) {
        const subscription = await this.getCompanySubscription(companyId);
        return subscription && (subscription.status === 'active' || subscription.status === 'trialing');
    }

    // Get plan limits for company
    async getCompanyLimits(companyId) {
        const subscription = await this.getCompanySubscription(companyId);
        
        if (!subscription) {
            return this.plans.starter.limits; // Default to starter limits
        }

        const planConfig = this.plans[subscription.plan];
        return planConfig ? planConfig.limits : this.plans.starter.limits;
    }

    // Check if company can add more agents
    async canAddAgent(companyId) {
        const conn = await pool.getConnection();
        try {
            const [agentRows] = await conn.query(
                'SELECT COUNT(*) as count FROM agents WHERE company_id = ? AND is_active = TRUE',
                [companyId]
            );

            const currentAgents = agentRows[0].count;
            const limits = await this.getCompanyLimits(companyId);
            
            return currentAgents < limits.maxAgents;
        } finally {
            conn.release();
        }
    }

    // Get available plans
    getPlans() {
        return Object.keys(this.plans).map(key => ({
            id: key,
            ...this.plans[key]
        }));
    }

    // Get plan by ID
    getPlan(planId) {
        return this.plans[planId] || null;
    }

    // Cancel subscription
    async cancelSubscription(companyId, immediate = false) {
        try {
            const subscription = await this.getCompanySubscription(companyId);
            
            if (!subscription || !subscription.stripe_subscription_id) {
                throw new Error('No active subscription found');
            }

            if (immediate) {
                await stripe.subscriptions.del(subscription.stripe_subscription_id);
            } else {
                await stripe.subscriptions.update(subscription.stripe_subscription_id, {
                    cancel_at_period_end: true
                });
            }

            return true;
        } catch (error) {
            console.error('Cancel subscription error:', error);
            throw error;
        }
    }

    // Update subscription plan
    async updateSubscriptionPlan(companyId, newPlan) {
        try {
            const subscription = await this.getCompanySubscription(companyId);
            
            if (!subscription || !subscription.stripe_subscription_id) {
                throw new Error('No active subscription found');
            }

            const planConfig = this.plans[newPlan];
            if (!planConfig) {
                throw new Error('Invalid plan');
            }

            const updatedSubscription = await stripe.subscriptions.update(
                subscription.stripe_subscription_id,
                {
                    items: [{
                        id: subscription.stripe_subscription_id,
                        price: planConfig.priceId
                    }],
                    metadata: {
                        companyId,
                        plan: newPlan
                    }
                }
            );

            return updatedSubscription;
        } catch (error) {
            console.error('Update subscription error:', error);
            throw error;
        }
    }
}

module.exports = new StripeService();
