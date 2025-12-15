# XTRF Dashboard – Tampermonkey Scripts

This repository contains Tampermonkey user scripts that enhance the XTRF dashboard by highlighting jobs and projects based on status and deadlines.

The scripts are read-only and only affect the visual display.

### Instructions
Please check [THIS LINK](https://docs.google.com/document/d/1UrRioFHJKnSvAN2dCohNaRYcsPUhvmhOsUE1EXboRV8/edit?tab=t.0) for the full instructions.

---

## Features

### Requested / Open – Status highlighting
- Colors the **Job Status** column:
  - **Open** → red
  - **Offers sent / requested** → blue

Smart View title:
Requested / Open


---

### Jobs due today and earlier – Overdue jobs
- Highlights overdue jobs in red
- Applies only to jobs with specific statuses:
- Open
- Started
- Accepted
- Offers sent / requested

Smart View title:
Jobs due today and earlier


---

### Projects due today – Deadline urgency
Rows are highlighted as follows:
- **Red**: deadline passed
- **Orange**: deadline within one hour
- **Light blue**: deadline today, more than one hour away

Smart View title:
Projects due today


This script may also highlight rows in other Smart Views that contain a **Deadline** column.  
This behavior is intentional.

---

## Installation

1. Install the Tampermonkey browser extension.
2. Create a new script in Tampermonkey.
3. Copy and paste the script code from this repository.
4. Save the script.
5. Reload the XTRF dashboard.

---

## Smart View requirements

### Requested / Open
Required columns:
- **Job Status**
- **Deadline**

---

### Jobs due today and earlier
Required columns:
- **Deadline**
- **Job Status**

---

### Projects due today
Required columns:
- **Deadline**

Deadlines must be displayed as:

DD/MM/YYYY HH:MM


Example:

13/12/2025 09:30 CET


---

## Notes

- Scripts only work on the XTRF dashboard.
- No data is modified.
- Renaming Smart Views or removing required columns may disable a script.
