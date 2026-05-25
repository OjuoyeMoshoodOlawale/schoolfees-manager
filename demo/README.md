# Demo Database

Copy `demo.db` to the `database/` folder and rename it `schoolfees.db` to load demo data.

```
cp demo/demo.db database/schoolfees.db
```

## Login Credentials
| Role   | Username | Password   |
|--------|----------|------------|
| Admin  | admin    | admin123   |
| Bursar | bursar   | bursar123  |

## Demo Data
- **School:** Bright Future Academy
- **Session:** 2024/2025 First Term
- **25 students** across JSS 1 – SS 3
- **137 bill lines** generated
- **₦1,858,000** total billed
- **₦608,000** collected (12 payments)
- **₦1,250,000** outstanding (13 debtors)
- **6 classes** with full bill configs
- **Sample journal entries** in accounting module

## Re-generate
Run `node seed_demo.js` from the project root to regenerate.
