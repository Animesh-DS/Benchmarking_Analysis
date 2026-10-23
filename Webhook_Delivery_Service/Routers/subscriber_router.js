const express = require('express');
const router = express.Router();

router.post('/webhook-receiver', (req, res) => {
    
    // console.log("Received Webhook Data:", req.body);
    
    return res.status(200).send("OK");
});

module.exports = router;