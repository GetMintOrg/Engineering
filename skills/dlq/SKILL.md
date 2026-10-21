---
name: dlq
description: "Triage and redrive AWS SQS dead-letter queues: list depths, peek messages without consuming them, find the root cause, redrive only once the fix is deployed. Use when: a DLQ alarm fires, the user says 'redrive', 'DLQ', 'dead letters', or after deploying a fix for failed jobs."
argument-hint: "[aws profile] [queue name]"
---

Set `PROFILE` and `REGION` for the environment you are triaging, and pass them on every call. Never rely on the default profile: confirm the account first.

```bash
aws sts get-caller-identity --profile "$PROFILE" --query Account --output text
```

## Flow

1. **List.** Every DLQ with its depth and oldest-message age. Start with the deepest and the youngest: a young DLQ is a live failure.

   ```bash
   for url in $(aws sqs list-queues --profile "$PROFILE" --region "$REGION" --query 'QueueUrls[?contains(@, `dlq`) || contains(@, `DLQ`) || contains(@, `dead`)]' --output text); do
     printf '%s\t' "${url##*/}"
     aws sqs get-queue-attributes --profile "$PROFILE" --region "$REGION" --queue-url "$url" \
       --attribute-names ApproximateNumberOfMessages --query Attributes.ApproximateNumberOfMessages --output text
   done
   ```

   Oldest-message age: CloudWatch `ApproximateAgeOfOldestMessage` on the queue.

2. **Inspect, without consuming.** Receive with a visibility timeout of 0 so every message is visible again immediately. Never pass the receipt handle to `delete-message`.

   ```bash
   aws sqs receive-message --profile "$PROFILE" --region "$REGION" --queue-url "$DLQ_URL" \
     --max-number-of-messages 10 --visibility-timeout 0 --attribute-names All
   ```

   Group the bodies by job type and shape, note the send window (`SentTimestamp`), keep one sample. The body is the original job: the error is NOT in the message.

3. **Root cause.** Take an id from the sample (job id, correlation id, tenant id) to the service logs around `SentTimestamp` and find the error. Fix it in code. No fix means no redrive: the messages just come back.

4. **The fix is deployed on that environment.** A redrive before the deploy replays into the same bug. Get the deployed commit (from your deploy system, image tag, or a version endpoint), then:

   ```bash
   git fetch origin "$DEPLOYED_SHA"
   git merge-base --is-ancestor "$FIX_COMMIT" "$DEPLOYED_SHA" && echo deployed
   ```

5. **Redrive.** Move the messages back to their source queue with SQS's native move task. Cap the rate for large DLQs feeding expensive work (LLM calls, scrapes, emails) so workers and vendors are not flooded.

   ```bash
   aws sqs start-message-move-task --profile "$PROFILE" --region "$REGION" \
     --source-arn "$DLQ_ARN" --max-number-of-messages-per-second 10
   aws sqs list-message-move-tasks --profile "$PROFILE" --region "$REGION" --source-arn "$DLQ_ARN"
   ```

   Without `--destination-arn`, messages go back to the queue they came from. Poll `list-message-move-tasks` until `Status` is `COMPLETED`.

6. **Watch.** List again a few minutes later: the DLQ must stay at 0. If messages come back, they failed again. Inspect them, and never redrive a second time without a new fix.

## Rules

- A DLQ holds real failures, not noise. Triage, don't purge.
- DLQ retention counts from the message's ORIGINAL enqueue time on standard queues, so a dead letter can expire sooner than you think. If it's gone, say so instead of guessing.
- Purging deletes data. Only on the user's explicit request, never as part of this flow.
- Check whether "non-prod" queues write to a shared database before calling a redrive harmless.
