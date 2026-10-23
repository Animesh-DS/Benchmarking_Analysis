const express = require('express');
const router = express.Router();
const pool = require('../DB/db_connect');
const EventEmmiter = require('events');

const emitter = new EventEmmiter();

let urls = [];

router.post("/subscribe",(req,res) => {
    const url = req.body.webhookURL;

    let exists = false;
    for(let i=0;i<urls.length;i++){
        if(urls[i] == url){
            exists = true;
            break;
        }
    }
    if(!exists){
        urls.push(url);
        return res.status(200).json({message:"URL Subscribed Successfully"})
    } 
    else{
        return res.status(200).json({message:"URL Already Subscribed"})
    }
})

router.post("/trigger",async (req,res) => {    
    try {
        const query = `
            INSERT INTO "update_records" (id, payload) 
            VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM update_records), $1) 
            RETURNING *
        `;
        const payload = {"event_type": "test_event"};

        const result = await pool.query(query,[payload]);
                
        const newRow = result.rows;
        
        emitter.emit('newData',newRow);
        return res.status(200).json({message: "Data successfully added to database"});
    } catch (err) {
        return res.status(500).json({message:"Adding data to database failed"});   
    }
})

emitter.on('newData',async (newRow)=>{
    for(let i=0;i<urls.length;i++){
        try {
            await fetch(urls[i],{method:"POST",headers:{ 'Content-Type': 'application/json' },body:JSON.stringify(newRow)})
            
        } catch (error) {
        }
    }
})

router.post("/seed/:count", (req, res) => {
    const count = parseInt(req.params.count);
    urls = []; // Clear array before each test
    for (let i = 0; i < count; i++) {
        urls.push(`http://localhost:4000/webhook-receiver?client=${i}`);
    }
    return res.status(200).json({ message: `Seeded ${count} subscribers` });
});

module.exports = router;