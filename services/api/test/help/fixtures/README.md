# GitHub webhook fixtures for the feedback tracker

`issues-closed.json` is the documented `issues` webhook delivery (action `closed`), cut to the
fields the route reads plus a few it must ignore; the repository name is a stand-in. Suites derive
the other deliveries (reopened, labelled, not planned) from it and sign each body themselves.
