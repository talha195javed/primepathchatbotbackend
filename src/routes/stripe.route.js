const express = require('express');
const router = express.Router();
const stripeService = require('../services/stripe.service');
const { authenticateToken } = require('../middleware/auth.middleware');

// Get available plans
router.get('/plans', (req, res) => {
    try {
        const plans = stripeService.getPlans();
        res.json({ plans });
    } catch (error) {
        console.error('Get plans error:', error);
        res.status(500).json({ error: 'Failed to get plans' });
    }
});

// Get plan by ID
router.get('/plans/:planId', (req, res) => {
    try {
        const { planId } = req.params;
        const plan = stripeService.getPlan(planId);
        
        if (!plan) {
            return res.status(404).json({ error: 'Plan not found' });
        }

        res.json({ plan });
    } catch (error) {
        console.error('Get plan error:', error);
        res.status(500).json({ error: 'Failed to get plan' });
    }
});

// Create checkout session
router.post('/checkout', authenticateToken, async (req, res) => {
    try {
        const { plan, successUrl, cancelUrl } = req.body;
        
        if (!plan || !successUrl || !cancelUrl) {
            return res.status(400).json({ 
                error: 'Missing required fields: plan, successUrl, cancelUrl' 
            });
        }

        const companyId = req.user.company_id || req.user.id;
        
        const session = await stripeService.createCheckoutSession(
            companyId,
            plan,
            successUrl,
            cancelUrl
        );

        res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
        console.error('Create checkout session error:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// Create customer portal session
router.post('/portal', authenticateToken, async (req, res) => {
    try {
        const { returnUrl } = req.body;
        
        if (!returnUrl) {
            return res.status(400).json({ error: 'Return URL is required' });
        }

        const companyId = req.user.company_id || req.user.id;
        
        const session = await stripeService.createPortalSession(companyId, returnUrl);
        res.json({ url: session.url });
    } catch (error) {
        console.error('Create portal session error:', error);
        res.status(500).json({ error: 'Failed to create portal session' });
    }
});

// Get current subscription
router.get('/subscription', authenticateToken, async (req, res) => {
    try {
        const companyId = req.user.company_id || req.user.id;
        const subscription = await stripeService.getCompanySubscription(companyId);
        
        if (!subscription) {
            return res.status(404).json({ error: 'No subscription found' });
        }

        // Get plan details
        const plan = stripeService.getPlan(subscription.plan);
        
        res.json({ 
            subscription: {
                ...subscription,
                planDetails: plan
            }
        });
    } catch (error) {
        console.error('Get subscription error:', error);
        res.status(500).json({ error: 'Failed to get subscription' });
    }
});

// Check if company has active subscription
router.get('/subscription-status', authenticateToken, async (req, res) => {
    try {
        const companyId = req.user.company_id || req.user.id;
        const hasActive = await stripeService.hasActiveSubscription(companyId);
        const limits = await stripeService.getCompanyLimits(companyId);
        
        res.json({ 
            hasActiveSubscription: hasActive,
            limits
        });
    } catch (error) {
        console.error('Check subscription status error:', error);
        res.status(500).json({ error: 'Failed to check subscription status' });
    }
});

// Check if company can add more agents
router.get('/can-add-agent', authenticateToken, async (req, res) => {
    try {
        const companyId = req.user.company_id || req.user.id;
        const canAdd = await stripeService.canAddAgent(companyId);
        
        res.json({ canAdd });
    } catch (error) {
        console.error('Check can add agent error:', error);
        res.status(500).json({ error: 'Failed to check agent limit' });
    }
});

// Cancel subscription
router.post('/cancel', authenticateToken, async (req, res) => {
    try {
        const { immediate = false } = req.body;
        const companyId = req.user.company_id || req.user.id;
        
        await stripeService.cancelSubscription(companyId, immediate);
        
        res.json({ 
            success: true,
            message: immediate ? 'Subscription cancelled immediately' : 'Subscription will be cancelled at period end'
        });
    } catch (error) {
        console.error('Cancel subscription error:', error);
        res.status(500).json({ error: 'Failed to cancel subscription' });
    }
});

// Update subscription plan
router.post('/update-plan', authenticateToken, async (req, res) => {
    try {
        const { newPlan } = req.body;
        
        if (!newPlan) {
            return res.status(400).json({ error: 'New plan is required' });
        }

        const companyId = req.user.company_id || req.user.id;
        
        const updatedSubscription = await stripeService.updateSubscriptionPlan(companyId, newPlan);
        
        res.json({ 
            success: true,
            subscription: updatedSubscription
        });
    } catch (error) {
        console.error('Update subscription plan error:', error);
        res.status(500).json({ error: 'Failed to update subscription plan' });
    }
});

// Stripe webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.log(`Webhook signature verification failed:`, err.message);
        return res.sendStatus(400);
    }

    try {
        await stripeService.handleWebhook(event);
        res.sendStatus(200);
    } catch (error) {
        console.error('Webhook handling error:', error);
        res.sendStatus(500);
    }
});

// Get billing history
router.get('/billing-history', authenticateToken, async (req, res) => {
    try {
        const companyId = req.user.company_id || req.user.id;
        
        // Get company's Stripe customer ID
        const { pool } = require('../config/db.config');
        const conn = await pool.getConnection();
        
        try {
            const [companyRows] = await conn.query(
                'SELECT stripe_customer_id FROM companies WHERE id = ?',
                [companyId]
            );

            if (!companyRows[0]?.stripe_customer_id) {
                return res.json({ invoices: [] });
            }

            const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
            const invoices = await stripe.invoices.list({
                customer: companyRows[0].stripe_customer_id,
                limit: 50
            });

            res.json({ 
                invoices: invoices.data.map(invoice => ({
                    id: invoice.id,
                    amount: invoice.amount_paid,
                    currency: invoice.currency,
                    status: invoice.status,
                    date: new Date(invoice.created * 1000),
                    download_url: invoice.invoice_pdf
                }))
            });
        } finally {
            conn.release();
        }
    } catch (error) {
        console.error('Get billing history error:', error);
        res.status(500).json({ error: 'Failed to get billing history' });
    }
});

// Get usage statistics
router.get('/usage', authenticateToken, async (req, res) => {
    try {
        const companyId = req.user.company_id || req.user.id;
        const { startDate, endDate } = req.query;
        
        const { pool } = require('../config/db.config');
        const conn = await pool.getConnection();
        
        try {
            // Get message count for the period
            let messageQuery = `
                SELECT COUNT(*) as message_count 
                FROM chat_messages cm
                JOIN chat_threads ct ON cm.thread_id = ct.id
                WHERE ct.company_id = ?
            `;
            const messageParams = [companyId];

            if (startDate && endDate) {
                messageQuery += ' AND cm.created_at BETWEEN ? AND ?';
                messageParams.push(startDate, endDate);
            }

            const [messageRows] = await conn.query(messageQuery, messageParams);

            // Get agent count
            const [agentRows] = await conn.query(
                'SELECT COUNT(*) as agent_count FROM agents WHERE company_id = ? AND is_active = TRUE',
                [companyId]
            );

            // Get limits
            const limits = await stripeService.getCompanyLimits(companyId);

            res.json({
                usage: {
                    messages: messageRows[0].message_count,
                    agents: agentRows[0].agent_count,
                    limits: {
                        maxMessages: limits.maxMessagesPerMonth,
                        maxAgents: limits.maxAgents
                    },
                    period: {
                        startDate: startDate || null,
                        endDate: endDate || null
                    }
                }
            });
        } finally {
            conn.release();
        }
    } catch (error) {
        console.error('Get usage statistics error:', error);
        res.status(500).json({ error: 'Failed to get usage statistics' });
    }
});

module.exports = router;
