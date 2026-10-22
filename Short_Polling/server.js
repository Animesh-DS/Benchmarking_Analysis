const express = require("express");
const app = express();
const updateRouter = require("./Routers/update_router")

app.use(express.json());

app.use("/",updateRouter)

const PORT = 3500;
app.listen(PORT, () => {
    console.log(`Short polling server running on port ${PORT}`);
});