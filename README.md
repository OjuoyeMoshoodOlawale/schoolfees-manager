# SchoolFees Manager — Phase 1

School Fees Management System for Nigerian Secondary Schools.

## Setup (Run once on your Windows machine)

### Prerequisites
- Node.js 18+ (https://nodejs.org)
- Windows 10/11

### Install & Run

```bash
# 1. Extract this folder anywhere on your PC
# 2. Open a terminal in the folder

# Install all dependencies (first time only)
npm install

# Run in development mode
npm run dev
```

### Build Installer (.exe)

```bash
npm run build
# Output: dist-electron/SchoolFees Manager Setup.exe
```

## Project Structure

```
electron/
  main.js       ← Backend: SQLite, all IPC handlers, file I/O
  preload.js    ← Secure bridge: exposes window.api to React

src/
  main.jsx      ← React entry point
  App.jsx       ← Routes
  index.css     ← Tailwind + custom classes

  components/
    layout/     ← Sidebar, Layout wrapper
    ui/         ← Modal, DataTable, Field, Badge, etc.

  pages/
    Dashboard.jsx
    BackupPage.jsx
    settings/SettingsPage.jsx
    sessions/SessionsPage.jsx
    classes/ClassesPage.jsx
    students/
      StudentsPage.jsx    ← List with DataTable + drawer
      StudentForm.jsx     ← Register / edit form
      PromotePage.jsx     ← Promote & change term
```

## Phase 1 Features (Complete)
- [x] School settings (name, address, logo, bank details)
- [x] Session & term management (CRUD, set current)
- [x] Class management (CRUD with level ordering)
- [x] Student registration (full profile, photo, boarding type)
- [x] Student list with search, filter, sort, Excel export
- [x] Student profile drawer with status history
- [x] Promote students to new session/class
- [x] Change term (move all active students to next term)
- [x] Status management (active / inactive / graduated)
- [x] Local backup & restore
- [x] Dashboard with getting-started checklist

## Phase 2 (Next)
- Fee items CRUD
- Bill configuration per class/term with all 4 rules
  (gender / student type / boarding type / compulsory)
- Copy bill config between terms/classes

## Database
Single file: `database/schoolfees.db`
To backup manually, copy that file anywhere.
