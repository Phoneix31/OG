'use strict';

const Stripe = require('stripe');
const config = require('../config');

module.exports = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;
