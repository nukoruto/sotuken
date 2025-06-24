const r = require('express').Router();
const c = require('../controllers/shopController');
r.get('/products', c.listProducts);
r.post('/cart', c.addToCart);
r.post('/checkout', c.checkout);
module.exports = r;
