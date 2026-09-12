## One-time MongoDB Replica Set Setup (run as Administrator)

Prisma requires MongoDB to run as a replica set for write operations (create/update/delete).
This is a one-time setup on your dev machine.

### Option A — PowerShell (Run as Administrator)

```powershell
# 1. Append replica set config
$cfg = "C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg"
Add-Content $cfg "`nreplication:`n  replSetName: rs0"

# 2. Restart the MongoDB service
Restart-Service MongoDB

# 3. Wait for it to start
Start-Sleep -Seconds 3

# 4. Initiate the replica set (run in mongosh or mongo shell)
# Open a new terminal and run:
#   "C:\Program Files\MongoDB\Server\8.2\bin\mongosh.exe" --eval "rs.initiate()"
# OR if mongosh isn't installed, use mongod directly:
#   netsh ... (see option B)
```

### Option B — mongosh (if installed separately)

```bash
mongosh --eval "rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] })"
```

### Option C — MongoDB Compass

1. Connect to `mongodb://localhost:27017`
2. Open the Shell tab
3. Run: `rs.initiate()`

### After setup, update your .env

```
DATABASE_URL=mongodb://localhost:27017/weathergpt?replicaSet=rs0&directConnection=true
```

---

> **Note**: You only need to do this once. The replica set survives service restarts.
