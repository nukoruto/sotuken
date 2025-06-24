let posts = [];
exports.getPosts = (_, res) => res.json(posts);
exports.newPost = (req, res) => {
  posts.push({ id: posts.length + 1, ...req.body });
  res.json({ ok: true });
};
