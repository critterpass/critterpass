# GitHub REST fixtures for the feedback tracker

- `repo-public.json`: `GET /repos/critterpass/critterpass`, recorded 2026-10-06 and cut to the
  fields the tracker reads.
- `repo-private.json`, `issue-created.json`, `comment-created.json`: the same cut of the documented
  responses of `GET /repos/{owner}/{repo}`, `POST /repos/{owner}/{repo}/issues` (201) and
  `POST /repos/{owner}/{repo}/issues/{number}/comments` (201) for a private repository; the
  repository name is a stand-in.
