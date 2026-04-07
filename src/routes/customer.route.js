const express = require('express');
const router = express.Router();
const { createCustomerThread } = require('../controllers/customer.control');

router.post('/create-customer-thread', createCustomerThread);

module.exports = router;
