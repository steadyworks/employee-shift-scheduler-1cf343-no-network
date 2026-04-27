# Employee Shift Scheduler

Build a weekly shift scheduling tool that auto-generates fair employee schedules while respecting individual constraints — and lets managers override assignments manually when needed.

## Stack

- **Frontend**: Pure React, port **3000**
- **Backend**: FastAPI, port **3001**
- **Persistence**: MySQL at port **3306**, schema `shifts`

## Overview

The app is a **single-page tool at `/`**. A manager can add employees, configure their availability preferences, generate a weekly schedule automatically, review fairness metrics, and manually adjust any slot — all without leaving the page.

---

## Employee Management

A panel on the left (or top) of the page lets the manager maintain a list of employees.

- **Add employee**: a name field and a role field, plus a button to submit. The new employee appears in the list immediately.
- Each employee entry shows their name and role and is identified by `data-testid="employee-{id}"` where `{id}` is the employee's unique persistent identifier (e.g. a database integer ID).
- Per employee, the manager can configure three constraint properties directly inline:
  - **Max hours per week**: a dropdown offering exactly three options — `20`, `30`, `40`.
  - **Day-off requests**: a multi-select (checkboxes or a multi-select control) for any combination of Monday–Sunday. The employee will never be auto-scheduled on a selected day.
  - **Preferred shifts**: a multi-select for `Morning`, `Afternoon`, and `Night`. These are soft preferences — the scheduler tries to honor them but may deviate to fill all slots.
- Changes to employee settings are persisted immediately (no separate save step).
- The entire employee panel has `data-testid="employee-panel"`.

---

## Schedule Grid

The main area shows the current week's schedule as a grid:

- **Columns**: Monday through Sunday (7 columns).
- **Rows**: three shift rows — `Morning` (06:00–14:00), `Afternoon` (14:00–22:00), `Night` (22:00–06:00). Each shift is exactly 8 hours.
- **Cells**: each cell shows the name(s) of employee(s) assigned to that slot. Unassigned cells appear empty.
- Cell identifiers use the pattern `data-testid="cell-{day}-{shift}"` with day and shift in lowercase (e.g. `cell-monday-morning`, `cell-friday-night`).
- The grid container has `data-testid="schedule-grid"`.

---

## Auto-Generate

A button with `data-testid="generate-btn"` triggers automatic schedule generation for the current week. The algorithm must satisfy all of the following hard constraints:

1. **Max hours**: no employee is assigned more shifts than their weekly hour cap allows. Each shift is 8 hours, so an employee with a 20-hour cap may work at most 2 shifts (16 hours ≤ 20).
2. **Day-off requests**: no employee is assigned to any slot on a day they have marked as a day off.
3. **Rest between shifts**: an employee who works the Night shift on any given day may not work the Morning shift the following day (less than 8 hours rest).
4. **Full coverage**: if sufficient employees exist, every shift slot (all 21 cells) receives at least one assigned employee.

Among all valid assignments the scheduler applies two soft objectives in order:
- Prefer employees for shifts matching their preferred shift types.
- Distribute total assigned hours as evenly as possible across employees (fairness).

When there are not enough available employees to fill every slot, some cells may remain empty — that is acceptable.

---

## Fairness Score

After generation (or after any manual override), a fairness score is displayed with `data-testid="fairness-score"`.

The score is an integer from **0 to 100**:

```
score = clamp(100 - (stddev(hours) / mean(hours) * 100), 0, 100)
```

where `hours` is the list of total assigned hours per employee, `stddev` is the population standard deviation, and `mean` is the arithmetic mean. A score of 100 means all employees have identical hours; the score falls as distribution becomes uneven. If there are no employees or no assignments, display `--` or `N/A` rather than a number.

---

## Manual Override

Clicking any schedule cell opens a UI control (dropdown, popover, or modal) that lets the manager assign or unassign employees for that slot.

- The manager can add any employee to the slot or remove any employee currently in it.
- After the change is confirmed the grid updates immediately and the change is persisted.
- The system immediately re-evaluates all hard constraints for the updated schedule. If violations exist they are shown in the violations panel (see below) — but the override is accepted regardless.

---

## Constraint Violations

A panel with `data-testid="violations"` is always visible. When the current schedule has no violations it may show a neutral message (e.g. "No violations") or be empty.

When violations exist, each one is listed as a separate item with `data-testid="violation-{index}"` (0-based). Violations to detect and report:

- An employee is assigned more total hours than their weekly max.
- An employee is assigned to a slot on one of their requested days off.
- An employee works a Night shift and then the Morning shift the next calendar day (insufficient rest).

The panel updates in real time whenever the schedule changes (generation or manual override).

---

## Persistence

All data — employees (with their constraints and preferences) and the current schedule — persists to MySQL. Reloading the page restores the exact same state the manager left.

---

## Reset

A **"Delete All Data"** button with `data-testid="reset-btn"` permanently deletes all employees, their settings, and the entire schedule, returning the app to a blank state.

---

## `data-testid` Reference

| Attribute | Element |
|---|---|
| `reset-btn` | "Delete All Data" button |
| `employee-panel` | Container wrapping the full employee list and add-employee form |
| `employee-{id}` | Individual employee row/card, where `{id}` is the employee's persistent ID |
| `generate-btn` | "Generate Schedule" button |
| `schedule-grid` | Container wrapping the full 7-day × 3-shift grid |
| `cell-{day}-{shift}` | Individual schedule cell; day is lowercase full name (`monday`–`sunday`), shift is lowercase (`morning`, `afternoon`, `night`) |
| `fairness-score` | Element displaying the numeric fairness score (or placeholder when unavailable) |
| `violations` | Container for the constraint violations list |
| `violation-{index}` | Individual violation item, 0-based index |
