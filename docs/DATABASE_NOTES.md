# MongoDB data layer

The server selects its repository implementation with `REPOSITORY_DRIVER`.
Use `memory` for local UI work and `mongo` for persistent data. The Mongo
driver uses the same repository interfaces, so controllers and services do
not change when storage changes.

## Production Cloud Setup

### Cloud Database Provisioning
1. Provision a managed MongoDB instance with persistent storage.
2. Configure network isolation and supply `MONGODB_URI` via secure environment variables.
3. Enable automated backups and test restore procedures periodically.

## Data Layer Administration

Access control and administrative roles are governed at the application layer through RBAC middleware and cryptographically signed session tokens. Administrative accounts are managed via authenticated sessions and private configuration parameters.

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
