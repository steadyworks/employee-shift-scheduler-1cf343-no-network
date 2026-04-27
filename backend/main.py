import json
import math
import os
from typing import List, Optional

import mysql.connector
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
SHIFTS = ['morning', 'afternoon', 'night']

DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 3306,
    "user": "root",
    "password": "",
    "database": "shifts",
}


def get_db():
    return mysql.connector.connect(**DB_CONFIG)


def init_db():
    conn = mysql.connector.connect(
        host="127.0.0.1", port=3306, user="root", password=""
    )
    cursor = conn.cursor()
    cursor.execute("CREATE DATABASE IF NOT EXISTS shifts")
    cursor.execute("USE shifts")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS employees (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            role VARCHAR(255) NOT NULL,
            max_hours INT NOT NULL DEFAULT 40,
            days_off JSON NOT NULL,
            preferred_shifts JSON NOT NULL
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS schedule (
            day VARCHAR(20) NOT NULL,
            shift_type VARCHAR(20) NOT NULL,
            employee_ids JSON NOT NULL,
            PRIMARY KEY (day, shift_type)
        )
    """)
    # Initialize empty schedule cells
    for day in DAYS:
        for shift in SHIFTS:
            cursor.execute(
                """INSERT INTO schedule (day, shift_type, employee_ids)
                   VALUES (%s, %s, %s)""",
                (day, shift, json.dumps([]))
            )
    conn.commit()
    cursor.close()
    conn.close()


init_db()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class EmployeeCreate(BaseModel):
    name: str
    role: str
    max_hours: int = 40
    days_off: List[str] = []
    preferred_shifts: List[str] = []


class EmployeeUpdate(BaseModel):
    max_hours: Optional[int] = None
    days_off: Optional[List[str]] = None
    preferred_shifts: Optional[List[str]] = None


class CellUpdate(BaseModel):
    employee_ids: List[int]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_all_employees(cursor):
    cursor.execute(
        "SELECT id, name, role, max_hours, days_off, preferred_shifts FROM employees ORDER BY id"
    )
    rows = cursor.fetchall()
    result = []
    for row in rows:
        result.append({
            "id": row[0],
            "name": row[1],
            "role": row[2],
            "max_hours": row[3],
            "days_off": json.loads(row[4]) if isinstance(row[4], str) else (row[4] or []),
            "preferred_shifts": json.loads(row[5]) if isinstance(row[5], str) else (row[5] or []),
        })
    return result


def get_schedule_map(cursor):
    cursor.execute("SELECT day, shift_type, employee_ids FROM schedule")
    rows = cursor.fetchall()
    schedule = {}
    for row in rows:
        ids = json.loads(row[2]) if isinstance(row[2], str) else (row[2] or [])
        schedule[(row[0], row[1])] = ids
    return schedule


def compute_violations(employees, schedule):
    emp_map = {e['id']: e for e in employees}
    violations = []

    # Count hours per employee
    emp_hours = {e['id']: 0 for e in employees}
    for (day, shift), emp_ids in schedule.items():
        for eid in emp_ids:
            if eid in emp_hours:
                emp_hours[eid] += 8

    # Max hours violation
    for emp in employees:
        if emp_hours[emp['id']] > emp['max_hours']:
            violations.append(
                f"{emp['name']} is assigned {emp_hours[emp['id']]}h which exceeds their {emp['max_hours']}h cap"
            )

    # Day-off violation
    for (day, shift), emp_ids in schedule.items():
        for eid in emp_ids:
            emp = emp_map.get(eid)
            if emp:
                days_off_lower = [d.lower() for d in emp.get('days_off', [])]
                if day.lower() in days_off_lower:
                    violations.append(
                        f"{emp['name']} is assigned on {day.capitalize()} which is their day off"
                    )

    # Rest violation: Night then next-day Morning
    for i, day in enumerate(DAYS):
        if i + 1 >= len(DAYS):
            break
        next_day = DAYS[i + 1]
        night_ids = set(schedule.get((day, 'night'), []))
        morning_ids = set(schedule.get((next_day, 'morning'), []))
        for eid in night_ids & morning_ids:
            emp = emp_map.get(eid)
            if emp:
                violations.append(
                    f"{emp['name']} works Night on {day.capitalize()} and Morning on {next_day.capitalize()} (insufficient rest)"
                )

    return violations


def compute_fairness(employees, schedule):
    if not employees:
        return None
    emp_hours = {e['id']: 0 for e in employees}
    for (day, shift), emp_ids in schedule.items():
        for eid in emp_ids:
            if eid in emp_hours:
                emp_hours[eid] += 8
    hours_list = list(emp_hours.values())
    total = sum(hours_list)
    if total == 0:
        return None
    mean = total / len(hours_list)
    if mean == 0:
        return None
    variance = sum((h - mean) ** 2 for h in hours_list) / len(hours_list)
    stddev = math.sqrt(variance)
    score = 100 - (stddev / mean * 100)
    return max(0, min(100, round(score)))


def generate_schedule_algorithm(employees):
    """Greedy scheduler that respects all hard constraints."""
    # Each shift = 8 hours; max_shifts = max_hours // 8
    assignments = {(day, shift): [] for day in DAYS for shift in SHIFTS}
    emp_shift_count = {emp['id']: 0 for emp in employees}

    for day_idx, day in enumerate(DAYS):
        # Who worked Night the previous day?
        prev_night_workers = set()
        if day_idx > 0:
            prev_day = DAYS[day_idx - 1]
            prev_night_workers = set(assignments.get((prev_day, 'night'), []))

        for shift in SHIFTS:
            eligible = []
            for emp in employees:
                eid = emp['id']
                max_shifts = emp['max_hours'] // 8

                # Max hours check
                if emp_shift_count[eid] >= max_shifts:
                    continue

                # Day-off check
                days_off_lower = [d.lower() for d in emp.get('days_off', [])]
                if day.lower() in days_off_lower:
                    continue

                # Rest constraint: can't work Morning if worked Night previous day
                if shift == 'morning' and eid in prev_night_workers:
                    continue

                eligible.append(emp)

            # Sort: prefer matching shift type, then fewest hours (fairness)
            preferred_shifts_lower = lambda e: [s.lower() for s in e.get('preferred_shifts', [])]

            def sort_key(emp):
                prefers = 0 if shift.lower() in preferred_shifts_lower(emp) else 1
                return (prefers, emp_shift_count[emp['id']])

            eligible.sort(key=sort_key)

            if eligible:
                best = eligible[0]
                assignments[(day, shift)].append(best['id'])
                emp_shift_count[best['id']] += 1

    return assignments


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)
