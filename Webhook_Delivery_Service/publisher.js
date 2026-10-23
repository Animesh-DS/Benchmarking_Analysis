const express = require('express');
const app = express()
const publish = require('./Routers/publisher_router');

app.use(express.json())

app.use('/',publish);

const PORT = 3500;
app.listen(PORT, () => {
    console.log(`Subscriber server actively listening for webhooks on port ${PORT}`);
});