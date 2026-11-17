---
description: Set up a new episode: the v1be-infra PR, then the user's admin steps
argument-hint: <episode name>
disable-model-invocation: true
---

Set up episode `$ARGUMENTS`, the Setup phase of `V1BE_CODING.md` in `v1be-coding/series`. Run it from the template's folder: the episode's own repo doesn't exist until step 4.

This session's container sees only the episode repos. Everything Setup needs is in the public `v1be-coding/v1be-infra` repo, cloned fresh from GitHub. Its `docs/adding-an-episode.md` is the guide, and its rules apply to the whole run.

## 1. Clone `v1be-infra`

```sh
dir="$(mktemp -d)/v1be-infra"
gh repo clone v1be-coding/v1be-infra "$dir" -- --quiet
git -C "$dir" switch -c "setup-$ARGUMENTS" origin/main
```

It lives in `/tmp`, so it's gone when the container ends, and no later session finds a stale copy. Read `$dir/docs/adding-an-episode.md` in full.

## 2. Settle the entry with the user

Ask for each field of the entry the guide lists, plus any AWS service or infra change the app needs. These are the user's choices: suggest values, then wait. Look things up with `research` or `field-reports` when a choice needs evidence, such as which hostname to use.

Keep notes out of this folder, because the template is copied into every episode. Put what's needed in the PR body. Anything worth keeping goes into the new repo after step 4.

Done when the user has agreed every field and every infra change.

## 3. Open the PR

Make the changes in `$dir`, run the guide's checks there, and fix anything they report. Then commit and push, joined with `&&`, and open the PR with the `pr` skill. Its body says what the user should see in the `org` and `deploy-episodes` plans, as the guide asks.

## 4. Walk the user through their steps

Use the `wizard` skill for the guide's steps 2 to 5, one at a time. Check each result before the next:

- **Merge:** `gh pr view <pr> -R v1be-coding/v1be-infra --json state`.
- **`org`:** `gh repo view v1be-coding/<repo>` shows the new repo. The App can't read its variables, so the user confirms those from the plan.
- **`deploy-episodes`:** the apply run on the merge commit is green: `gh run list -R v1be-coding/v1be-infra --workflow deploy-episodes.yml`. Watch it with a background loop every 30 s or so, because `gh run watch` is refused here.
- **Keys and the Anthropic limit:** the user says they're done. A value never passes through this chat.

## 5. Hand over

```sh
gh repo clone "v1be-coding/<repo>" "/workspaces/v1be/episodes/<repo>" -- --quiet
```

Then tell the user Setup is done, and that the spec phase starts in a new session from the episode shortcut, with `<repo>` added to its target.
