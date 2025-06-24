exports.listProducts = (req, res) =>
  res.json([...Array(10)].map((_, i) => ({ id: i, name: `商品${i}` })));
exports.addToCart = (req, res) => res.json({ ok: true });
exports.checkout = (req, res) => res.json({ ok: true, orderId: Date.now() });
