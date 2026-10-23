const pool = require("../DB/db_connect");
const express = require("express");
const router = express.Router();
const EventEmiter = require("events");

//2000 is the max no of concurrent listeners allowed
const emitter = new EventEmiter();
emitter.setMaxListeners(2000);

router.get("/updates/:lastEventID", async (req,res) => {
    const cursor = parseInt(req.params.lastEventID);
    if(isNaN(cursor) || cursor < 0){
        return res.status(400).json({message:"Invalid ID"});
    }

    try {
        const query = 'SELECT * FROM "update_records" WHERE "id" > $1 ORDER BY "id" ASC LIMIT 20';
    
        const result = await pool.query(query,[cursor]);
        const rows = result.rows;
        let nextcursor = cursor;
        if(rows.length>0){
            nextcursor = rows[rows.length-1].id;
            return res.status(200).json({
                data:rows,
                NextCursor:nextcursor
            });
        }

        else{
            //set a timeout of 20sec and add a event listenerr for new updates
            //if any new updates are detected using the event listener then cancel the timeout and return the new updated data
            //if 20sec pass and no new data return empty response

            const timeoutID = setTimeout(() => {
                //so after 20sec pass and this timeout has not been canceled we return empty response
                emitter.removeListener('newData',newDataAvailable);
                return res.status(200).json({
                    message:"Timeout",
                    data:"NULL"
                });
            }, 20000);

            const newDataAvailable = async (newRow) => {
                clearTimeout(timeoutID);
                nextcursor = newRow[newRow.length-1].id;
                return res.status(200).json({
                    data:newRow,
                    NextCursor:nextcursor
                })
            }

            emitter.once('newData', newDataAvailable);

            req.on('close',()=>{
                clearTimeout(timeoutID);
                emitter.removeListener('newData',newDataAvailable);
            })
        }
    }catch (err) {
        return res.status(500).json({message:"Fetching data from database failed"});
    }
})

router.post("/newdata",(req,res) => {
    let timeDelay = Math.floor(Math.random() * 10000)
    res.status(202).json({message:"Accepted! Data will the shared"})
    setTimeout(async () => {
        try {
            const query = 'INSERT INTO "update_records" (payload) VALUES ($1) RETURNING *';
            const payload = {"event_type": "test_event"};

            const result = await pool.query(query,[payload]);
            
            const newRow = result.rows;
            
            emitter.emit('newData',newRow)  
        } catch (err) {
        }
    }, timeDelay);
})

module.exports = router;