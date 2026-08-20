#!/usr/bin/env python3
"""
=============================================================================
CLEAR PS SELECTIONS AND DELETE TEST PROBLEM STATEMENTS
=============================================================================
Safely clears team problem statement selections and deletes test problem statements.

Usage:
    python clear_ps_data.py           # Interactive mode (asks for confirmation)
    python clear_ps_data.py --yes     # Skip prompt and run immediately
    python clear_ps_data.py --keep-ps # Clear team selections only, keep problem statements
=============================================================================
"""

import sys
import os
import argparse

# Add parent dir to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import ProblemStatement, PSSelection

def main():
    parser = argparse.ArgumentParser(description="Clear PS selections and delete test problem statements.")
    parser.add_argument("--yes", "-y", action="store_true", help="Skip confirmation prompt")
    parser.add_argument("--keep-ps", action="store_true", help="Only clear team selections, do NOT delete problem statements")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        total_selections = db.query(PSSelection).count()
        total_ps = db.query(ProblemStatement).count()

        print("=" * 65)
        print("CLEAR PROBLEM STATEMENT SELECTIONS & TEST PS SCRIPT")
        print("=" * 65)
        print(f"Current Selections in DB : {total_selections}")
        print(f"Current Problem Statements: {total_ps}")
        print("=" * 65)

        if not args.yes:
            action_desc = "clear ALL team selections" if args.keep_ps else "clear ALL team selections AND delete ALL test problem statements"
            confirm = input(f"Are you sure you want to {action_desc}? (y/N): ").strip().lower()
            if confirm not in ["y", "yes"]:
                print("[CANCELLED] No data was modified.")
                sys.exit(0)

        # 1. Delete all PS selections
        deleted_selections = db.query(PSSelection).delete(synchronize_session=False)

        # 2. Reset selectedCount = 0
        db.query(ProblemStatement).update({"selectedCount": 0}, synchronize_session=False)

        deleted_ps = 0
        if not args.keep_ps:
            # 3. Delete problem statements
            deleted_ps = db.query(ProblemStatement).delete(synchronize_session=False)

        db.commit()

        print("\n" + "=" * 65)
        print(f"[SUCCESS] Operation Complete!")
        print(f"  - Cleared Selections         : {deleted_selections}")
        if not args.keep_ps:
            print(f"  - Deleted Problem Statements : {deleted_ps}")
        else:
            print(f"  - Reset selectedCount to 0   : {total_ps} problem statements preserved")
        print("=" * 65)

    except Exception as e:
        db.rollback()
        print(f"\n[ERROR] Failed to execute cleanup: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    main()
