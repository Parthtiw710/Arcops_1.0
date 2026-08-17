# Contributing to DBMux

Thank you for your interest in contributing to DBMux!

## Developer Certificate of Origin (DCO) Sign-off

To ensure that all contributions to DBMux are legally compliant under the MIT License, we enforce the **Developer Certificate of Origin (DCO)**.

Every commit submitted to this repository must include a `Signed-off-by` line in the commit message.

### How to Sign Off Your Commits

Pass the `-s` or `--signoff` flag when committing with `git`:

```bash
git commit -s -m "feat: add new database provider handler"
```

This appends a line to your commit message:

```text
Signed-off-by: Your Name <your.email@example.com>
```

### DCO Agreement Text

By signing off your commits (`Signed-off-by`), you certify the following agreement:

```text
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

## Pull Request Guidelines

1. All CI checks (**Pillar 1**, **Pillar 3A**, **Pillar 3B & 3C Stress Tests**) must pass 100% before merging.
2. DCO Sign-off is strictly enforced on all commits.
