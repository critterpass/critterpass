## What changed

<!-- behaviour, not implementation; no plan/phase/task/feature ids -->

## Definition of Done (docs/code-standards.md §20)

- [ ] Only files in the phase `owns` list (plus named dependencies) changed
- [ ] Behaviour matches the design render and task done-when, incl. loading / empty / error / offline states
- [ ] Tests for the change type (§17) written and passing, narrowest first
- [ ] Lint and typecheck clean; no hard-coded strings or colours; a11y roles set
- [ ] Permission/RLS tests if data touched; evals if AI touched
- [ ] No ids or deferral language in code; conventional commits
- [ ] Task status updated in the phase file; undesigned states logged in `docs/undesigned-states.md`
- [ ] Docs updated if architecture, contracts or commands changed
