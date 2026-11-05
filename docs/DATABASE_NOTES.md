# MongoDB data layer

The server selects its repository implementation with `REPOSITORY_DRIVER`.
Use `memory` for local UI work and `mongo` for persistent data. The Mongo
driver uses the same repository interfaces, so controllers and services do
not change when storage changes.

## Production & Cloud Setup (Railway or MongoDB Atlas)

### Option A: Railway (Recommended — 1-Click Provision)
1. Add a **MongoDB** service to your Railway project canvas (uses persistent `mongodb-volume`).
2. Link your backend service to `${{MongoDB.MONGO_URL}}` or use the provided connection URI.
3. Railway manages persistence, automated restarts, and internal networking automatically.

### Option B: MongoDB Atlas
1. Create a MongoDB Atlas free-tier (M0) cluster.
2. Add network access under **Network Access** (or `0.0.0.0/0` for cloud services like Render/Railway).
3. Copy `server/.env.example` to `server/.env` and set:

   ```text
   REPOSITORY_DRIVER=mongo
   MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<database>?retryWrites=true&w=majority
   ```

Enable cloud backups before using sensitive production data. Test restoring backups periodically.

## Private administrator provisioning

Administrator credentials are never committed to source control or exposed in documentation. Provision an administrator in one of two ways:

1. **Automatic Initialization on Startup:** Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in your production environment variables (e.g. Railway or Render variables tab). The API server auto-provisions the administrator on first boot if the account does not yet exist.
2. **CLI Command:** Execute the management script directly:
   ```bash
   ADMIN_EMAIL="your-private-email@example.com" ADMIN_PASSWORD="a-long-random-password" npm run create-admin --workspace @examguard/server
   ```

Do not commit those environment variables or publish them in documentation.

## Index verification

Run these commands in `mongosh` after selecting the application database:

```javascript
db.examguardattempts.find({
  status: "in_progress",
  expiresAt: { $lte: new Date() }
}).sort({ expiresAt: 1 }).limit(100).explain("executionStats")

db.examguardexams.find({
  createdBy: ObjectId("<teacher-id>"),
  status: "published"
}).explain("executionStats")

db.examguardattempts.aggregate([
  { $match: { examId: ObjectId("<exam-id>"), status: "submitted" } },
  { $group: { _id: "$studentId", score: { $max: "$gradedPayload.score" } } }
]).explain("executionStats")
```

The first query should use the `{ status: 1, expiresAt: 1 }` index. Teacher
exam lists use `{ createdBy: 1, status: 1 }`. Analytics match stages use the
attempt exam/status indexes where the query shape permits it; inspect
`executionStats.totalDocsExamined` and investigate any unexpected `COLLSCAN`.

The repository contract and Mongo concurrency tests can be run with:

```text
npm test --workspace server -- --runInBand
npm run lint --workspace server
```
