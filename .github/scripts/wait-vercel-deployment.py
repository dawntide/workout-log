#!/usr/bin/env python3
"""Poll the Vercel REST API until the production deployment for TARGET_SHA is READY.

Env:
  VERCEL_TOKEN       (required)
  VERCEL_PROJECT_ID  (required)
  TARGET_SHA         (required) — commit SHA to match against deployment metadata
  VERCEL_TEAM_ID     (optional)

Exits 0 when READY, 1 on ERROR/CANCELED or after the timeout.
"""

import json
import os
import sys
import time
from typing import Optional
import urllib.error
import urllib.parse
import urllib.request

token = os.environ["VERCEL_TOKEN"]
project_id = os.environ["VERCEL_PROJECT_ID"]
team_id = os.environ.get("VERCEL_TEAM_ID", "")
target_sha = os.environ["TARGET_SHA"]

print("Waiting for Vercel deployment...")
print(f"Target commit SHA: {target_sha}")

base_url = "https://api.vercel.com/v6/deployments"


def fetch_page(until_cursor: Optional[str]):
    params = {
        "projectId": project_id,
        "limit": "100",
        "target": "production",
    }
    if team_id:
        params["teamId"] = team_id
    if until_cursor:
        params["until"] = until_cursor
    query = urllib.parse.urlencode(params)
    req = urllib.request.Request(
        f"{base_url}?{query}",
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def deployment_commit_sha(deployment):
    meta = deployment.get("meta") or {}
    if meta.get("githubCommitSha"):
        return meta["githubCommitSha"]

    git_source = deployment.get("gitSource") or {}
    if git_source.get("sha"):
        return git_source["sha"]

    return ""


def find_target(deployments):
    for deployment in deployments:
        commit_sha = deployment_commit_sha(deployment)
        if commit_sha == target_sha:
            return deployment
    return None


max_attempts = 40
for attempt in range(1, max_attempts + 1):
    try:
        page_count = 0
        until = None
        found = None

        latest_seen_sha = ""

        while page_count < 10:
            payload = fetch_page(until)
            page_count += 1
            deployments = payload.get("deployments") or []
            if not latest_seen_sha and deployments:
                latest_seen_sha = deployment_commit_sha(deployments[0])
            found = find_target(deployments)
            if found:
                break
            pagination = payload.get("pagination") or {}
            until = pagination.get("next")
            if not until or not deployments:
                break

        state = "NOT_FOUND"
        if found:
            state = found.get("readyState") or "UNKNOWN"

        print(f"[{attempt}/{max_attempts}] State for {target_sha}: {state}")

        if state == "READY":
            print("Vercel deployment is READY.")
            sys.exit(0)
        if state in {"ERROR", "CANCELED"}:
            print(f"Vercel deployment failed: {state}")
            sys.exit(1)
        if state == "NOT_FOUND":
            print("Vercel deployment for commit is not visible yet.")
            if latest_seen_sha:
                print(f"Most recent deployment commit seen: {latest_seen_sha}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(f"Vercel API HTTP error {exc.code}: {detail}")
    except urllib.error.URLError as exc:
        print(f"Network error while polling Vercel API: {exc}")

    time.sleep(15)

print(f"Timed out waiting for Vercel deployment for commit {target_sha}.")
sys.exit(1)
