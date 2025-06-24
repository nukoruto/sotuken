const r = require('express').Router();
const c = require('../controllers/forumController');
r.get('/posts', c.getPosts);
r.post('/posts', c.newPost);
module.exports = r;
