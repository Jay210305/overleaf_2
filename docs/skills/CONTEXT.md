# Skill Selection Context

## Inputs

Reference: [Project Skill Catalog](README.md), [Architecture](../planning/02-architecture.md), the selected task and the current session's available skills.

## Process

Match the task to a catalog entry; check its trigger and actual availability; read the applicable skill and needed references. For external additions, inspect the pinned full directory, license and platform assumptions. Follow user/runtime authorization for installation, scripts and tests.

## Outputs

A scoped skill choice in the work report; catalog/revision updates only when actual research or installation supplies evidence. The catalog's `recommended` state never means installed.

## Human Check

Maintainers review changes to tool/dependency choices and the recorded installation scope. Existing user authorization applies; the catalog introduces no blanket approval to install or publish.
