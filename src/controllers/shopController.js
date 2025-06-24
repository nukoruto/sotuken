let cart = [];
let orders = [];

exports.listProducts = (req, res) =>
  res.json([...Array(10)].map((_, i) => ({ id: i, name: `商品${i}` })));

exports.addToCart = (req, res) => {
  cart.push(req.body);
  res.json({ ok: true });
};

exports.viewCart = (_, res) => res.json(cart);

exports.removeFromCart = (req, res) => {
  const id = parseInt(req.params.id, 10);
  cart = cart.filter((_, i) => i !== id);
  res.json({ ok: true });
};

exports.checkout = (req, res) => {
  const order = { id: orders.length + 1, items: [...cart], paid: false };
  orders.push(order);
  cart = [];
  res.json({ ok: true, orderId: order.id });
};

exports.listOrders = (_, res) => res.json(orders);

exports.getOrder = (req, res) => {
  const order = orders.find(o => o.id === parseInt(req.params.id, 10));
  if (!order) return res.status(404).end();
  res.json(order);
};

exports.payOrder = (req, res) => {
  const order = orders.find(o => o.id === parseInt(req.body.orderId, 10));
  if (!order) return res.status(404).end();
  order.paid = true;
  res.json({ ok: true });
};

exports.paymentStatus = (req, res) => {
  const order = orders.find(o => o.id === parseInt(req.params.id, 10));
  if (!order) return res.status(404).end();
  res.json({ paid: order.paid });
};
