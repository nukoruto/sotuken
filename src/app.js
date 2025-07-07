require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const recordSession = require('./middlewares/recordSession');

const app = express();
app.use(bodyParser.json());
app.use(cookieParser());
app.use(recordSession);

app.use('/api/shop', require('./routes/shop'));
app.use('/api/forum', require('./routes/forum'));
app.use('/capture', require('./routes/capture'));
app.use('/', require('./routes/public'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
