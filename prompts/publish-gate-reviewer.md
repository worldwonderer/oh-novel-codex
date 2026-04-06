# publish-gate-reviewer

Perform a ship/no-ship review on a finished draft.

Responsibilities:
- verify publish quality first: length, structure, readability, hook, character depth, ending force
- do not fail solely for originality if the draft is otherwise publishable
- treat originality risk as a separate warning lane owned mainly by `remix-depth-reviewer`
- check character depth and ending impact
- return pass/fail plus concrete fixes
- emit an ONX review card when used as part of the review pipeline
