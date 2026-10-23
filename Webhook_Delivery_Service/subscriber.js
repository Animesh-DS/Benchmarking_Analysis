const express = require('express');
const app = express();
const subscriberRouter = require('./Routers/subscriber_router');

app.use(express.json());

app.use('/', subscriberRouter);

const PORT = 4000;
app.listen(PORT, () => {
    console.log(`Subscriber server actively listening for webhooks on port ${PORT}`);
});