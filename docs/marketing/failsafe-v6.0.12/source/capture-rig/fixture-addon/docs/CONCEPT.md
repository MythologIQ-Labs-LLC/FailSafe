# Tasklet: concept

*Fictional demo project. Not a product.*

## Why

Small teams lose track of work when tasks live in chat threads. Tasklet is a tiny task service: create a task, give it a due date, mark it done, and list what is overdue.

## Vibe

Small, boring and correct. No dependencies beyond Node itself. Every rule the service enforces has a test that says so.

## What it does

- Stores tasks in memory (see `docs/adr/0001-in-memory-store.md`).
- Validates titles and `YYYY-MM-DD` due dates before a task is stored.
- Lists overdue tasks for a given day.

## What it does not do

- No accounts, no network API, no persistence.

## How changes are made

One issue at a time (`ISSUES.md`). A change starts with a failing test, ends with `npm test` passing, and is reviewed before it is merged.
