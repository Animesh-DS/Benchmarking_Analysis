const express = require("express")
const pool = require("../DB/db_connect")
const router = express.Router()

router.get("/updates/:lastEventID",async (req,res)=>{
    const cursor = parseInt(req.params.lastEventID, 10);
    if(isNaN(cursor) || cursor<0){
        return res.status(400).json({message:"Provide valid ID"})
    }

    try {
        const query = 'SELECT * FROM "update_records" WHERE "id" > $1 ORDER BY "id" ASC LIMIT 20';
        const result = await pool.query(query,[cursor]);
        
        const rows = result.rows;
        
        let next_cursor = cursor;
        if(rows.length>0){
            next_cursor = rows[rows.length-1].id
        }

        return res.status(200).json({
            data:rows,
            NextCursor:next_cursor 
        });
        
    } catch (err) {
        return res.status(500).json({message:"data retrieval from databse failed"});
    }
})

module.exports = router;