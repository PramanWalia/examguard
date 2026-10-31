# MongoDB data layer

The server selects its repository implementation with `REPOSITORY_DRIVER`.
Use `memory` for local UI work and `mongo` for persistent data. The Mongo
driver uses the same repository interfaces, so controllers and services do
not change when storage changes.

## Local or Atlas setup

1. Create a MongoDB Atlas free-tier cluster.
2. Add the development IP address under **Network Access** (use a narrow
   allowlist; do not use `0.0.0.0/0` outside a temporary local demo).
3. Copy `server/.env.example` to `server/.env` and set:

   ```text
   REPOSITORY_DRIVER=mongo
   MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<database>?retryWrites=true&w=majority
   ```

4. Run `npm run seed --workspace server`. The seed is idempotent and prints
   demo credentials.
5. Start the API with `npm run dev --workspace server`.

Enable Atlas backups (continuous cloud backup when available for the selected
tier) before using production data. Test restoring a backup periodically;
backups do not replace least-privilege users or application-level validation.

## Private administrator provisioning

The seed does not create an administrator and no administrator credentials are
stored in the repository. Create or rotate the private administrator from the
server environment:

```powershell
$env:ADMIN_EMAIL="your-private-email@example.com"
$env:ADMIN_PASSWORD="a-long-random-password"
npm run create-admin --workspace server
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
