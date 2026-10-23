const {Pool} = require("pg")

const pool = new Pool({
    "host":"localhost",
    "user":"postgres",
    "port":"5432",
    "password":"Shinanigan",
    "database":"Polling_Test",
    "max":10,
    "connectionTimeoutMillis":0,
    "idleTimeoutMillis":0,
})

module.exports = pool;