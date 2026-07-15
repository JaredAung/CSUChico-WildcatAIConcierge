# Wildcat AI Concierge — Ops Runbook
## Backup Ingestion Pipeline: Kendra → S3 → Bedrock KB

**Region:** `us-west-2`  
**Demo deadline:** EOD July 16, 2026  
**Critical path:** Tasks 1 → 2 → 4 → 5 (Task 3/Kendra runs in parallel)

---

## Known Resource IDs

| Resource | Value |
|---|---|
| Bedrock KB ID | `HWLRSGO6X8` |
| S3 Data Source ID | `BY7N6TNWRR` |
| S3 Bucket | `kendra-webcrawler-test` |
| SAM Stack | `wildcat-ai-concierge` |
| LLM | `us.anthropic.claude-sonnet-5` |

---

## Step 1 — Deploy the SAM Stack

```bash
cd backend

# First build
sam build

# Deploy (confirm_changeset = true, so review the changeset before confirming)
sam deploy
```

`samconfig.toml` already includes:
```
parameter_overrides = "... KnowledgeBaseId=\"HWLRSGO6X8\" S3BucketName=\"kendra-webcrawler-test\""
```

After deploy, capture the queue URL for the seeder:

```bash
export CRAWL_QUEUE_URL=$(aws cloudformation describe-stacks \
  --stack-name wildcat-ai-concierge \
  --region us-west-2 \
  --query "Stacks[0].Outputs[?OutputKey=='CrawlQueueUrl'].OutputValue" \
  --output text)

echo "CrawlQueue: $CRAWL_QUEUE_URL"
```

**Smoke-test the deploy:**

```bash
# Get the API endpoint
API=$(aws cloudformation describe-stacks \
  --stack-name wildcat-ai-concierge \
  --region us-west-2 \
  --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" \
  --output text)

# Health check — should show knowledge_base_id: "HWLRSGO6X8"
curl -s "$API/api/v1/health" | jq .

# Chat without KB docs yet (KB is empty until ingestion runs)
curl -s -X POST "$API/api/v1/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What is CSU Chico?"}]}' | jq .
```

Expected response shape:
```json
{
  "answer": "...",
  "sources": [],
  "session_id": "...",
  "model_used": "us.anthropic.claude-sonnet-5",
  "is_mock": false,
  "retrieval_mode": "knowledge_base"
}
```

If `retrieval_mode` is `"direct"` the KB env var didn't wire through — check the Lambda env vars in the console.

---

## Step 2 — Verify DownloaderFunction with a Single Test Message

Before seeding thousands of URLs, confirm the downloader works end-to-end.

```bash
# Send one test message
aws sqs send-message \
  --queue-url "$CRAWL_QUEUE_URL" \
  --message-body '{"url":"https://www.csuchico.edu/schedule/","crawl_run_id":"smoke-test"}' \
  --region us-west-2
```

Then watch CloudWatch Logs (within ~30 seconds):

```bash
aws logs tail /aws/lambda/wildcat-ai-concierge-downloader \
  --follow \
  --region us-west-2
```

Expect log lines:
```
fetched { url: 'https://www.csuchico.edu/schedule/', status: 200, contentType: 'text/html', bytes: N }
raw html written  raw/html/www.csuchico.edu/schedule/index.html  N bytes
sidecar written   raw/html/www.csuchico.edu/schedule/index.html.metadata.json
normalized text written  normalized/www.csuchico.edu/schedule/index.json  N bytes
sidecar written   normalized/www.csuchico.edu/schedule/index.json.metadata.json
```

Confirm in S3:
```bash
aws s3 ls "s3://kendra-webcrawler-test/raw/html/www.csuchico.edu/" --region us-west-2
aws s3 ls "s3://kendra-webcrawler-test/normalized/www.csuchico.edu/" --region us-west-2
```

Test the DLQ path (known 404):
```bash
aws sqs send-message \
  --queue-url "$CRAWL_QUEUE_URL" \
  --message-body '{"url":"https://www.csuchico.edu/this-page-does-not-exist-404/","crawl_run_id":"dlq-test"}' \
  --region us-west-2
```

After 3 visibility timeouts (~15 min total with default backoff), check the DLQ:
```bash
DLQ_URL=$(aws cloudformation describe-stacks \
  --stack-name wildcat-ai-concierge \
  --region us-west-2 \
  --query "Stacks[0].Outputs[?OutputKey=='CrawlDLQUrl'].OutputValue" \
  --output text)

aws sqs get-queue-attributes \
  --queue-url "$DLQ_URL" \
  --attribute-names ApproximateNumberOfMessages \
  --region us-west-2
```

---

## Step 3 — Set Up Kendra Index (Manual, Console Only)

> Web Crawler v2.0 is NOT supported by CloudFormation. All steps below are manual.

### 3.1 Create the Index

1. Open [Amazon Kendra Console](https://console.aws.amazon.com/kendra) → **us-west-2**
2. Click **Create index**
3. Settings:
   - **Index name:** `wildcat-csuchico-index`
   - **Edition:** Developer edition
   - **IAM role:** Create a new role (name it `AmazonKendra-us-west-2-wildcat`)
4. Leave all other settings as default → **Create**
5. Wait ~30 min for the index to reach `ACTIVE` status

### 3.2 Add Web Crawler v2.0 Data Source

1. Inside the index → **Data sources** → **Add data source** → **Web Crawler v2**
2. Settings:

   **Source:**
   - Seed URLs (one per line):
     ```
     https://www.csuchico.edu/
     https://library.csuchico.edu/
     https://as.csuchico.edu/
     https://chicostatewildcat.bkstr.com/
     https://csuchico.campuslabs.com/engage/events
     ```
   - Crawl mode: **Seed URL — crawl all pages reachable from seed**
   - Crawl depth: **2**

   **Crawl settings:**
   - Max links per page: **100**
   - Max URLs per minute per host: **3**
   - Max file size (MB): **50**
   - Crawl files: **Enabled**
   - Sync mode: **Full sync**

   **Exclusion filters (URL regex):**
   ```
   .*\?.*
   .*\/login.*
   .*\/signin.*
   .*\/search.*
   .*\/calendar.*
   .*\/directory\/students\/.*
   ```

3. Set sync schedule to **Run on demand**
4. Create the data source

### 3.3 Run the Sync and Export URLs

1. Click **Sync now** → wait for status to show `SUCCEEDED` or `SUCCEEDED_WITH_ERRORS`
2. Check CloudWatch Logs for the Kendra data source — the logs include every crawled URL
3. Export discovered URLs via CLI:

```bash
# Replace INDEX_ID and DATA_SOURCE_ID with values from the Kendra console
KENDRA_INDEX_ID="<your-kendra-index-id>"
KENDRA_DS_ID="<your-kendra-datasource-id>"

# List all indexed documents (paginated; run until NextToken is empty)
aws kendra list-data-source-sync-jobs \
  --index-id "$KENDRA_INDEX_ID" \
  --id "$KENDRA_DS_ID" \
  --region us-west-2

# Extract URLs from CloudWatch log group:
#   /aws/kendra/<INDEX_ID>/DataSource/<DS_ID>
# Then export to a .jsonl file with one URL per line for the seeder.
```

### 3.4 Validation

- Index document count > 0 in the Kendra console
- All 5 seed domains represented
- Known PDFs discovered:
  - `2025-26-student-academic-calendar.pdf`
  - `csci-flowchart-yr-5-25-26.pdf`
- No unexpected external domains in the document list
- CloudWatch shows crawl rate ≤ 3 URLs/min/host

---

## Step 4 — Seed the Crawl Frontier and Run Full Ingestion

### 4.1 Run the Seeder

```bash
# High-value URLs only (no Kendra file yet)
cd /path/to/CSUChico-WildcatAIConcierge
node scripts/seed-crawl-frontier.mjs

# With Kendra-exported URL list
node scripts/seed-crawl-frontier.mjs path/to/kendra-urls.jsonl
```

Supported input formats:
- Plain text: one `https://...` per line
- JSONL: `{"DocumentId":"https://..."}` or `{"url":"https://..."}` per line
- JSON array on a single line

Monitor progress:
```bash
# Queue depth (should drain toward 0)
aws sqs get-queue-attributes \
  --queue-url "$CRAWL_QUEUE_URL" \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible \
  --region us-west-2

# Lambda invocation count in real-time
aws logs tail /aws/lambda/wildcat-ai-concierge-downloader \
  --follow \
  --region us-west-2
```

### 4.2 Trigger Bedrock KB Ingestion

Once the queue drains and S3 has content:

```bash
# Start ingestion job
JOB=$(aws bedrock-agent start-ingestion-job \
  --knowledge-base-id HWLRSGO6X8 \
  --data-source-id BY7N6TNWRR \
  --region us-west-2 \
  --query 'ingestionJob.ingestionJobId' \
  --output text)

echo "Ingestion job: $JOB"

# Poll until COMPLETE (runs every 30s; Ctrl-C when done)
watch -n 30 "aws bedrock-agent get-ingestion-job \
  --knowledge-base-id HWLRSGO6X8 \
  --data-source-id BY7N6TNWRR \
  --ingestion-job-id $JOB \
  --region us-west-2 \
  --query 'ingestionJob.{status:status,new:statistics.numberOfNewDocumentsIndexed,failed:statistics.numberOfDocumentsFailed}' \
  --output table"
```

Success criteria:
- `status: COMPLETE`
- `numberOfNewDocumentsIndexed` > 0
- `numberOfDocumentsFailed` = 0 (or all failures are unsupported file types)

---

## Step 5 — End-to-End Validation Queries

Run these against the live frontend or directly via curl. All 5 should return non-empty answers; at least 3 should include source attribution.

```bash
API="<your-api-endpoint>/Prod"

run_query() {
  local q="$1"
  echo "=== QUERY: $q ==="
  curl -s -X POST "$API/api/v1/chat" \
    -H "Content-Type: application/json" \
    -d "{\"messages\":[{\"role\":\"user\",\"content\":\"$q\"}]}" | jq '{answer:.answer, sources:.sources, mode:.retrieval_mode}'
  echo
}

run_query "What dates are listed in the 2025-26 student academic calendar?"
run_query "What is the recommended first-year course sequence in the Computer Science flowchart?"
run_query "What are the library hours at CSU Chico?"
run_query "What events are happening on campus?"
run_query "Which source URL did this answer come from?"
```

Expected results:

| Query | Expected source | Key check |
|---|---|---|
| Q1 — Academic calendar | academic-calendar.pdf | `sources[0].url` contains `2025-26-student-academic-calendar.pdf` |
| Q2 — CSCI flowchart | csci-flowchart PDF | `sources[0].url` contains `csci-flowchart` — **key multimodal test** |
| Q3 — Library hours | library.csuchico.edu | `sources[0].url` host is `library.csuchico.edu` |
| Q4 — Campus events | campuslabs.com/engage | `sources[0].url` host is `csuchico.campuslabs.com` |
| Q5 — Source attribution | any | `sources` array non-empty |

### Demo Recording Checklist

1. Frontend chat answering Q1 or Q3 — show the source link rendering in the UI
2. S3 console — navigate to the backing file that answered the question (`raw/files/...` for PDFs)
3. Side-by-side Q2 comparison:
   - Approach 1 (this pipeline): CSCI flowchart answer from `raw/files/` + managed Bedrock parser
   - Approach 2 (native web crawler): same question answered via the primary pipeline
   - Highlight the difference in answer quality / structure extraction

### Regression Check (no KB)

Temporarily test the fallback path by calling with an unset KB (or direct Lambda test with `KNOWLEDGE_BASE_ID=""`):

```json
{
  "messages": [{"role": "user", "content": "What is CSU Chico?"}]
}
```

Response must include `"retrieval_mode": "direct"` and a non-empty `"answer"`. This confirms the `ConverseCommand` fallback is intact.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `retrieval_mode: "direct"` when KB is set | `KNOWLEDGE_BASE_ID` env var not deployed | `sam deploy` again; check Lambda env in console |
| `502` on chat with KB set | IAM missing `bedrock-agent-runtime:RetrieveAndGenerate` | Redeploy stack; IAM policy is in `template.yaml` |
| Downloader Lambda errors | S3 `AccessDenied` | Check `S3BucketName` param matches exact bucket name |
| DLQ filling up on valid URLs | Fetch timeouts (15s) | Some sites are slow; acceptable for non-critical pages |
| Bedrock ingestion `FAILED` | Unsupported file type or malformed sidecar | Check `statistics.numberOfDocumentsFailed` details in console |
| `ResourceNotFoundException` on chat | KB ID wrong or KB deleted | Verify `HWLRSGO6X8` exists in Bedrock console; handler falls back to `ConverseCommand` automatically |
