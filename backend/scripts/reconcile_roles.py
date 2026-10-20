import argparse
import csv
from datetime import datetime
import os
import sys
from typing import Any, Dict, List, Optional

# Ensure backend root is on sys.path without importing FastAPI app
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.dirname(CURRENT_DIR)
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import Event, Role, User, Volunteer, RbacRole, UserRoleAssignment
from app.rbac import default_system_key_for, ensure_system_roles, invalidate_all


def reconcile_roles(db: Session, apply: bool = False, event_id: Optional[str] = None) -> Dict[str, Any]:
    """Reconcile access control roles for volunteers in the database.
    DRY-RUN by default; writes only when apply=True.
    Returns summary dict with changes, skipped, and totals.
    """
    events_query = db.query(Event)
    if event_id:
        events_query = events_query.filter(Event.id == event_id)
    events = events_query.all()

    changes: List[Dict[str, str]] = []
    skipped: List[Dict[str, str]] = []

    for ev in events:
        ensure_system_roles(db, ev.id)
        system_roles = {
            r.systemKey: r
            for r in db.query(RbacRole).filter(RbacRole.eventId == ev.id, RbacRole.isSystem == True).all()  # noqa: E712
        }

        users = db.query(User).filter(User.eventId == ev.id).all()
        for user in users:
            vol = user.volunteer
            vol_name = vol.name if vol else (user.username or "N/A")
            raw_v_type = getattr(vol, "type", None)
            vol_type_str = str(getattr(raw_v_type, "value", raw_v_type) or "").strip()

            # Rule 3: Skip admins and leaders
            if user.role not in (Role.VOLUNTEER, Role.JUDGE, Role.FACULTY):
                skipped.append({
                    "event": ev.id,
                    "username": user.username,
                    "volunteer_name": vol_name,
                    "volunteer_type": vol_type_str or str(user.role.value if hasattr(user.role, "value") else user.role),
                    "reason": f"Non-staff role: {user.role.value if hasattr(user.role, 'value') else user.role}"
                })
                continue

            assignments = (
                db.query(UserRoleAssignment)
                .filter(UserRoleAssignment.userId == user.id, UserRoleAssignment.eventId == ev.id)
                .all()
            )

            # Rule 1: Zero assignments
            if len(assignments) == 0:
                target_key = default_system_key_for(vol.type if vol else None, user.role)
                target_role = system_roles.get(target_key)
                if not target_role:
                    target_role = (
                        db.query(RbacRole)
                        .filter(RbacRole.eventId == ev.id, RbacRole.systemKey == target_key)
                        .first()
                    )

                changes.append({
                    "event": ev.id,
                    "username": user.username,
                    "volunteer_name": vol_name,
                    "volunteer_type": vol_type_str or "NONE",
                    "before": "None",
                    "after": f"Role '{target_key}' (RECONCILE)",
                    "action": "assign",
                    "user_id": user.id,
                    "target_role_id": target_role.id if target_role else None
                })
                if apply and target_role:
                    new_asgn = UserRoleAssignment(
                        eventId=ev.id,
                        userId=user.id,
                        roleId=target_role.id,
                        scope={"teams": {"mode": "all", "ids": []}},
                        createdBy="RECONCILE",
                    )
                    db.add(new_asgn)
                continue

            # Rule 3: Multiple assignments (2+)
            if len(assignments) >= 2:
                skipped.append({
                    "event": ev.id,
                    "username": user.username,
                    "volunteer_name": vol_name,
                    "volunteer_type": vol_type_str or "NONE",
                    "reason": f"Multiple role assignments ({len(assignments)})"
                })
                continue

            # Exactly 1 assignment
            asgn = assignments[0]
            # Rule 3: Not created by SYSTEM
            if asgn.createdBy != "SYSTEM":
                skipped.append({
                    "event": ev.id,
                    "username": user.username,
                    "volunteer_name": vol_name,
                    "volunteer_type": vol_type_str or "NONE",
                    "reason": f"Assignment createdBy is '{asgn.createdBy}' (not 'SYSTEM')"
                })
                continue

            # Check if assignment is system 'volunteer' role
            asgn_role = db.query(RbacRole).filter(RbacRole.id == asgn.roleId).first()
            if asgn_role and asgn_role.systemKey == "volunteer":
                # Rule 2: Single SYSTEM volunteer assignment AND volunteer.type is JUDGE
                if "JUDGE" in vol_type_str.upper():
                    judge_role = system_roles.get("judge")
                    if not judge_role:
                        judge_role = (
                            db.query(RbacRole)
                            .filter(RbacRole.eventId == ev.id, RbacRole.systemKey == "judge")
                            .first()
                        )

                    changes.append({
                        "event": ev.id,
                        "username": user.username,
                        "volunteer_name": vol_name,
                        "volunteer_type": vol_type_str,
                        "before": "Role 'volunteer' (SYSTEM)",
                        "after": "Role 'judge' (RECONCILE)",
                        "action": "replace",
                        "user_id": user.id,
                        "old_asgn_id": asgn.id,
                        "target_role_id": judge_role.id if judge_role else None
                    })
                    if apply and judge_role:
                        db.delete(asgn)
                        new_asgn = UserRoleAssignment(
                            eventId=ev.id,
                            userId=user.id,
                            roleId=judge_role.id,
                            scope={"teams": {"mode": "all", "ids": []}},
                            createdBy="RECONCILE",
                        )
                        db.add(new_asgn)
                else:
                    skipped.append({
                        "event": ev.id,
                        "username": user.username,
                        "volunteer_name": vol_name,
                        "volunteer_type": vol_type_str or "NONE",
                        "reason": f"System volunteer assignment matches volunteer type '{vol_type_str or 'VOLUNTEER'}'"
                    })
            else:
                skipped.append({
                    "event": ev.id,
                    "username": user.username,
                    "volunteer_name": vol_name,
                    "volunteer_type": vol_type_str or "NONE",
                    "reason": f"Assignment is for role '{asgn_role.name if asgn_role else asgn.roleId}' (not system volunteer)"
                })

    csv_file = None
    if apply:
        db.commit()
        invalidate_all()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        csv_file = f"reconcile_roles_{timestamp}.csv"
        with open(csv_file, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["event", "username", "volunteer_name", "volunteer_type", "before", "after"])
            for c in changes:
                writer.writerow([c["event"], c["username"], c["volunteer_name"], c["volunteer_type"], c["before"], c["after"]])

    return {
        "apply": apply,
        "changes": changes,
        "skipped": skipped,
        "totals": {"changed": len(changes), "skipped": len(skipped)},
        "csv_file": csv_file,
    }


def print_summary(result: Dict[str, Any]):
    mode = "APPLY (WRITTEN TO DB)" if result["apply"] else "DRY-RUN (NO DB WRITES)"
    print("=" * 80)
    print(f"RBAC ROLE RECONCILIATION SUMMARY - Mode: {mode}")
    print("=" * 80)

    changes = result["changes"]
    skipped = result["skipped"]

    if changes:
        print(f"\nPlanned Changes ({len(changes)}):")
        print(f"{'Event':<36} | {'Username':<15} | {'Volunteer':<20} | {'Type':<10} | {'Before':<25} | {'After'}")
        print("-" * 120)
        for c in changes:
            print(f"{c['event']:<36} | {c['username']:<15} | {c['volunteer_name'][:20]:<20} | {c['volunteer_type']:<10} | {c['before']:<25} | {c['after']}")
    else:
        print("\nNo changes needed.")

    if skipped:
        print(f"\nSkipped Users (Manual Review) ({len(skipped)}):")
        print(f"{'Event':<36} | {'Username':<15} | {'Volunteer':<20} | {'Reason'}")
        print("-" * 100)
        for s in skipped:
            print(f"{s['event']:<36} | {s['username']:<15} | {s['volunteer_name'][:20]:<20} | {s['reason']}")

    print("\nTotals:")
    print(f"  - Reconciled changes: {len(changes)}")
    print(f"  - Skipped (manual review): {len(skipped)}")
    if result.get("csv_file"):
        print(f"  - Rollback record CSV saved to: {os.path.abspath(result['csv_file'])}")
    if result["apply"]:
        print("  - NOTE: A running server process needs up to 15 s or a restart for its cache.")
    print("=" * 80)


def main():
    parser = argparse.ArgumentParser(description="Operational Role Reconciliation Script")
    parser.add_argument("--apply", action="store_true", help="Apply changes to the database (defaults to dry-run)")
    parser.add_argument("--event-id", type=str, default=None, help="Optional event ID filter")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        result = reconcile_roles(db, apply=args.apply, event_id=args.event_id)
        print_summary(result)
    finally:
        db.close()


if __name__ == "__main__":
    main()
