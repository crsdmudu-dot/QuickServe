# FIXTURE texts (tests and the offline dry run only)

Everything in this folder is synthetic test text. None of it is, or is drawn from, a KwikServe legal, support or FAQ text,
draft or approved. It exists only so the tests (and the offline dry run of PM stage 127 W7) can exercise the five
content-rendered pages. It must never be copied into apps/website/content/ in the repository.

The tests copy these files into a temporary folder and write a FIXTURE approval record there (label `v0-fixture`,
effective date 2000-01-01, the Terms file's real sha256). No record file is committed.
