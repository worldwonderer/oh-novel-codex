# Workflow pipeline

`run-workflow` is the highest-level ONX scaffolding command.

It creates:

1. a **draft job**
2. a **review job** already pointed at the draft output
3. a **workflow job** that ties both together

## Example

Original draft:

```bash
onx run-workflow --brief "写一个知乎体第一人称复仇短篇" --project .
```

Rewrite draft:

```bash
onx run-workflow --mode zhihu-remix --source source/original.txt --brief "改成8k-12k低相似度长稿" --project .
```

## Result

The workflow job records:

- where the draft job lives
- where the review job lives
- which draft file reviewers should read
- how to aggregate the final review verdict
- publish-readiness scorecards for each completed review pass

## Default execution order

1. complete the draft job prompts
2. write the full draft to `outputs/draft.md`
3. run the review job prompts
4. aggregate review cards into scorecard + publish-readiness output
5. if readiness fails, run revision and re-review
6. stop only when readiness is green or the loop budget is exhausted
