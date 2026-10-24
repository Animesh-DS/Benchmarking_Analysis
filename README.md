# Real-Time Backend Benchmarks: Polling vs. Webhooks

A simple benchmarking project comparing three ways to send real-time updates from a Node.js/Express server backed by PostgreSQL. 


## What We Tested
We pushed our server to its limits using three different approaches to see how they handle high traffic:
1. **Short Polling:** Clients ask the server for updates every few seconds (`GET /updates/:lastEventID`), and the server immediately replies with up to 20 new rows from PostgreSQL.
2. **Long Polling:** Clients ask for updates (`GET /updates/:lastEventID`), and if no new rows exist yet, the server holds the HTTP connection open for up to 20 seconds waiting for an `EventEmitter` broadcast before replying.
3. **Webhooks:** Clients register a callback URL (`POST /subscribe`), and the server proactively fires an HTTP `POST` request to every subscriber whenever new data is written (`POST /trigger`).

## The Results

Here is how the server performed under load across 10, 100, and 1,000 concurrent connections during 30-second `autocannon` stress tests (each preceded by a 5-second warmup).


### Quick Data Summary
| Method | Avg Response Time (10 / 100 / 1000 Conn) | CPU Usage | Memory Usage | Max Concurrent Users |
| :--- | :--- | :--- | :--- | :--- |
| **Short Polling** | **1.15 ms** / **31.70 ms** / **319.08 ms** | High (constant DB `SELECT` queries and HTTP parsing) | Low (connections open and close right away) | **1,000+ connections** (0 errors; steady 3,115 Req/Sec at peak) |
| **Long Polling** | **1.18 ms** / **25.84 ms** / **558.93 ms** | Moderate (spikes on DB reads and event broadcasts) | High (holds open sockets, `setTimeout` timers, and `EventEmitter` listeners) | **1,000+ connections** (0 errors; hard-capped at 2,000 by `maxListeners`) |
| **Webhooks** | **37.57 ms** / **426.76 ms** / **9,937.76 ms** | Very High on write (DB `INSERT` lock contention plus sequential `fetch` loop) | Moderate (grows with subscriber list and queued outbound requests) | **Under 10 connections** under write load (131 failed responses at 10c; 3,000 socket errors at 1000c) |

#### Detailed Breakdown by Connection Tier

| Method & Load | Avg Latency | p50 Latency | p99 Latency | Max Latency | Avg Throughput (Req/Sec) | Bandwidth (Bytes/Sec) | Total Requests (30s) | Errors / Non-2xx |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Short Polling (10c)** | 1.15 ms | 1 ms | 3 ms | 8 ms | 5,817.47 | 11.70 MB | 175k | 0 |
| **Short Polling (100c)** | 31.70 ms | 31 ms | 53 ms | 90 ms | 3,107.20 | 6.26 MB | 93k | 0 |
| **Short Polling (1000c)** | 319.08 ms | 315 ms | 437 ms | 694 ms | 3,115.67 | 6.28 MB | 94k | 0 |
| **Long Polling (10c)** | 1.18 ms | 1 ms | 3 ms | 10 ms | 5,752.94 | 11.60 MB | 173k | 0 |
| **Long Polling (100c)** | 25.84 ms | 23 ms | 45 ms | 87 ms | 3,796.04 | 7.65 MB | 114k | 0 |
| **Long Polling (1000c)** | 558.93 ms | 648 ms | 826 ms | 881 ms | 2,770.67 | 5.58 MB | 85k | 0 |
| **Webhooks (10c)** | 37.57 ms | 35 ms | 155 ms | 372 ms | 262.80 | 74.70 kB | 8k | 131 non-2xx |
| **Webhooks (100c)** | 426.76 ms | 419 ms | 751 ms | 941 ms | 232.50 | 66.20 kB | 7k | 259 non-2xx |
| **Webhooks (1000c)** | 9,937.76 ms | 8,005 ms | 28,633 ms | 29,109 ms | 207.20 | 59.00 kB | 10k | 273 non-2xx, 3k errors |

### Key Takeaways
- **Short Polling:** Handled 1,000 concurrent connections without a single dropped request, locking into a ceiling of roughly 3,115 requests per second once the PostgreSQL connection pool saturated. It is dead simple and predictable, though it wastes CPU and database bandwidth whenever clients poll for data that has not changed.
- **Long Polling:** Outperformed short polling at 100 connections (25.84 ms average latency vs. 31.70 ms), but latency nearly doubled to 558.93 ms at 1,000 connections. Even when rows are immediately available in the database, managing open socket state, 20-second `setTimeout` handles, and `req.on('close')` cleanup listeners adds noticeable memory and event-loop overhead at high concurrency.
- **Webhooks:** Great for saving bandwidth when updates are rare (using just 59 kB/sec to 74.7 kB/sec compared to 6+ MB/sec for polling), but our synchronous implementation buckled when we hammered the `/trigger` write endpoint directly. Average latency hit nearly 10 seconds at 1,000 connections because of two code-level bottlenecks:
  1. **Database Write Contention:** The `/trigger` query calculates the next ID manually using `SELECT COALESCE(MAX(id), 0) + 1`. Under concurrent load, multiple requests read the same maximum ID simultaneously and fail with primary key collisions, causing the 131 to 273 `non-2xx` (`500`) responses.
  2. **Sequential Fan-Out Loop:** Inside the `newData` event listener, outbound webhook deliveries run inside a standard `for` loop using `await fetch(urls[i])`. Waiting for each subscriber one by one blocks the fan-out cycle and exhausts local sockets under heavy trigger traffic.

#### What We Would Change for Production
If you take these patterns into production, three small changes fix the bottlenecks shown above:
- **Use `SERIAL` or `IDENTITY` columns** in PostgreSQL instead of `MAX(id) + 1` so concurrent inserts never collide.
- **Offload Webhook fan-out to a background queue** (like BullMQ/Redis) or fire requests in parallel batches with `Promise.allSettled()` and a timeout so one slow subscriber cannot stall the rest.
- **Add an in-memory cache or cursor check** in front of Short Polling so repeated requests for the latest `lastEventID` do not hit PostgreSQL every time.

## How to Run This Locally

Want to run the stress test yourself? 

1. **Clone and Install**
   ```bash
   git clone <your-repo-url>
   cd SP_LP_WH_Benchmark
   npm install
   ```

2. **Set Up PostgreSQL**
   Make sure PostgreSQL is running locally and create the `update_records` table:
   ```sql
   CREATE TABLE update_records (
       id SERIAL PRIMARY KEY,
       payload JSONB
   );
   ```
   Update `DB/db_connect.js` with your local PostgreSQL credentials.

3. **Start the Server**
   Start the Express benchmark server on port `3500` (and the webhook receiver on port `4000` when testing webhooks):
   ```bash
   node index.js
   ```

4. **Run the Benchmarks (`autocannon`)**
   We used `autocannon` with a 5-second warmup followed by a 30-second test run across 10, 100, and 1,000 concurrent connections:

   * **Short Polling & Long Polling (`GET /updates/0`):**
     ```bash
     # 10 connections
     npx autocannon -c 10 -d 30 --warmup [ -c 10 -d 5 ] --renderLatencyTable "http://localhost:3500/updates/0"

     # 100 connections
     npx autocannon -c 100 -d 30 --warmup [ -c 100 -d 5 ] --renderLatencyTable "http://localhost:3500/updates/0"

     # 1000 connections
     npx autocannon -c 1000 -d 30 --warmup [ -c 1000 -d 5 ] --renderLatencyTable "http://localhost:3500/updates/0"
     ```

   * **Webhooks (`POST /trigger`):**
     First seed the subscriber URLs, then run `autocannon` against the trigger endpoint:
     ```bash
     # Seed 100 webhook subscribers on port 4000
     curl -X POST http://localhost:3500/seed/100

     # Run 10, 100, or 1000 concurrent connections against /trigger
     npx autocannon -c 10 -d 30 --warmup [ -c 10 -d 5 ] --renderLatencyTable "http://localhost:3500/trigger"
     npx autocannon -c 100 -d 30 --warmup [ -c 100 -d 5 ] --renderLatencyTable "http://localhost:3500/trigger"
     npx autocannon -c 1000 -d 30 --warmup [ -c 1000 -d 5 ] --renderLatencyTable "http://localhost:3500/trigger"
     ```