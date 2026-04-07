const { v4: uuidv4 } = require('uuid');
const customerModel = require('../models/customer.model');

const findCustomer = async ({ phone, companyId, code }) => {
    if (!companyId || !phone) return null;
    return await customerModel.findCustomerByPhone({ phone, companyId }) || null;
};

const createCustomer = async (params) => {
    const customer = {
        id: uuidv4(),
        ...params
    };
    await customerModel.insertCustomer(customer);
    return customer;
};

module.exports = {
    findCustomer,
    createCustomer
};
