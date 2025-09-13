const express = require('express');
// config/paymentMethods.js
module.exports = {
  bankCard: {
    id: 'visa_mastercard',
    name: 'Visa/Mastercard',
    type: 'bank_card',
    fees: '2.9%',
    limits: {
      minimum: 50,
      maximum: 50000,
      daily: 100000,
    },
    processingTime: '2-3 minutes',
    countries: ['GH', 'NG', 'KE', 'ZA'],
  },
};
