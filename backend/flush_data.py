import sys
import os
import secrets
import string
import argparse

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import (
    Event, EventConfig, User, Role, CheckpointType, 
    Volunteer, Team, TeamMember, Pod, AttendanceRecord, 
    ProblemStatement, PSSelection, RefreshToken, AuditLog, 
    PendingImport, Panel, EvaluationRound, Submission
)
from app.auth import get_password_hash
from backup_utils import perform_full_backup

def generate_random_password(length=16):
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))

def get_db():
    return SessionLocal()

def auto_backup_before_flush(db):
    """
    Enforces mandatory automatic backup before any flushing operation.
    Returns True if backup succeeded, False if failed.
    """
    try:
        perform_full_backup(db)
        return True
    except Exception as e:
        print(f"\n[FLUSH CANCELLED] Automatic backup failed before data deletion could occur.")
        print(f"Error details: {e}\n")
        return False

# --- Granular Flush Functions ---

def clear_team_data(db):
    if not auto_backup_before_flush(db):
        return
    print("Clearing Team Data (Submissions, PS Selections, Attendance, Members, Teams, Leader Users)...")
    try:
        # Submissions by teams
        db.query(Submission).delete(synchronize_session=False)
        # PS Selections
        db.query(PSSelection).delete(synchronize_session=False)
        # Team Attendance Records
        db.query(AttendanceRecord).delete(synchronize_session=False)
        # Team Members
        db.query(TeamMember).delete(synchronize_session=False)
        # Leader Users linked to teams
        leader_users = db.query(User).filter(User.role == Role.LEADER).all()
        for u in leader_users:
            db.delete(u)
        # Teams
        deleted_count = db.query(Team).delete(synchronize_session=False)
        db.commit()
        print(f"-> Cleared {deleted_count} Teams and all associated data.")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error clearing team data: {e}")

def clear_volunteer_data(db):
    if not auto_backup_before_flush(db):
        return
    print("Clearing Volunteer Data (Volunteer User Accounts & Profiles)...")
    try:
        # Volunteer users
        vol_users = db.query(User).filter(User.role == Role.VOLUNTEER).all()
        for u in vol_users:
            db.delete(u)
        # Volunteers table
        deleted_count = db.query(Volunteer).delete(synchronize_session=False)
        db.commit()
        print(f"-> Cleared {deleted_count} Volunteers and associated user accounts.")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error clearing volunteer data: {e}")

def clear_problem_statements(db):
    if not auto_backup_before_flush(db):
        return
    print("Clearing Problem Statements & Selections...")
    try:
        db.query(PSSelection).delete(synchronize_session=False)
        # Unassign PS from panels
        db.query(Panel).update({Panel.problemStatementId: None}, synchronize_session=False)
        # Unassign PS from volunteers
        db.query(Volunteer).update({Volunteer.problemStatementId: None}, synchronize_session=False)
        deleted_count = db.query(ProblemStatement).delete(synchronize_session=False)
        db.commit()
        print(f"-> Cleared {deleted_count} Problem Statements.")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error clearing problem statements: {e}")

def clear_pods(db):
    if not auto_backup_before_flush(db):
        return
    print("Clearing Pods...")
    try:
        db.query(Team).update({Team.podId: None}, synchronize_session=False)
        db.query(Volunteer).update({Volunteer.podId: None}, synchronize_session=False)
        deleted_count = db.query(Pod).delete(synchronize_session=False)
        db.commit()
        print(f"-> Cleared {deleted_count} Pods.")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error clearing pods: {e}")

def clear_panels(db):
    if not auto_backup_before_flush(db):
        return
    print("Clearing Panels...")
    try:
        db.query(Volunteer).update({Volunteer.panelId: None}, synchronize_session=False)
        deleted_count = db.query(Panel).delete(synchronize_session=False)
        db.commit()
        print(f"-> Cleared {deleted_count} Panels.")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error clearing panels: {e}")

def clear_checkpoints_attendance(db):
    if not auto_backup_before_flush(db):
        return
    print("Clearing Attendance Records & Checkpoint Types...")
    try:
        db.query(AttendanceRecord).delete(synchronize_session=False)
        deleted_cp = db.query(CheckpointType).delete(synchronize_session=False)
        db.commit()
        print(f"-> Cleared {deleted_cp} Checkpoint Types and all attendance records.")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error clearing checkpoints & attendance: {e}")

def clear_evaluation_rounds(db):
    if not auto_backup_before_flush(db):
        return
    print("Clearing Evaluation Rounds & Submissions...")
    try:
        db.query(Submission).delete(synchronize_session=False)
        deleted_rounds = db.query(EvaluationRound).delete(synchronize_session=False)
        db.commit()
        print(f"-> Cleared {deleted_rounds} Evaluation Rounds & Submissions.")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error clearing evaluation rounds: {e}")

def clear_system_logs(db):
    if not auto_backup_before_flush(db):
        return
    print("Clearing Audit Logs, Pending Imports, & Refresh Tokens...")
    try:
        db.query(AuditLog).delete(synchronize_session=False)
        db.query(PendingImport).delete(synchronize_session=False)
        db.query(RefreshToken).delete(synchronize_session=False)
        db.commit()
        print("-> System logs & refresh tokens cleared.")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error clearing system logs: {e}")

def clear_all_data(db):
    if not auto_backup_before_flush(db):
        return
    print("\nWARNING: Performing Complete Data Flushing...")
    try:
        db.query(Submission).delete(synchronize_session=False)
        db.query(PSSelection).delete(synchronize_session=False)
        db.query(AttendanceRecord).delete(synchronize_session=False)
        db.query(TeamMember).delete(synchronize_session=False)
        
        # Leader & Volunteer Users
        db.query(User).filter(User.role.in_([Role.LEADER, Role.VOLUNTEER])).delete(synchronize_session=False)
        
        db.query(Team).delete(synchronize_session=False)
        db.query(Volunteer).delete(synchronize_session=False)
        db.query(CheckpointType).delete(synchronize_session=False)
        db.query(Pod).delete(synchronize_session=False)
        db.query(Panel).delete(synchronize_session=False)
        db.query(ProblemStatement).delete(synchronize_session=False)
        db.query(EvaluationRound).delete(synchronize_session=False)
        db.query(AuditLog).delete(synchronize_session=False)
        db.query(PendingImport).delete(synchronize_session=False)
        db.query(RefreshToken).delete(synchronize_session=False)
        
        db.commit()
        print("-> ALL event data flushed successfully.\n")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error during full data flush: {e}")

# --- Password Reset Function ---

def reset_user_passwords(db, target_role=None, mode="uniform", uniform_password="Password123!"):
    query = db.query(User)
    if target_role:
        query = query.filter(User.role == target_role)
    users = query.all()

    if not users:
        print("No users found matching the specified role criteria.")
        return

    print(f"\nResetting passwords for {len(users)} user(s) (Role: {target_role.value if target_role else 'ALL'}, Mode: {mode.upper()})...")
    
    credentials = []
    for u in users:
        pwd = uniform_password if mode == "uniform" else generate_random_password()
        u.passwordHash = get_password_hash(pwd)
        credentials.append({
            "username": u.username,
            "role": u.role.value if hasattr(u.role, 'value') else str(u.role),
            "password": pwd
        })

    db.commit()
    print("Password reset complete!")
    print("\n==================================================")
    print("                UPDATED CREDENTIALS               ")
    print("==================================================")
    print(f"{'USERNAME':<20} {'ROLE':<15} {'PASSWORD':<25}")
    print("-" * 60)
    for c in credentials:
        print(f"{c['username']:<20} {c['role']:<15} {c['password']:<25}")
    print("==================================================\n")


# --- Interactive CLI Menu ---

def interactive_menu():
    db = get_db()
    try:
        active_event = db.query(Event).filter_by(isActive=True).first()
        event_name = active_event.name if active_event else "No Active Event Found"

        while True:
            print("\n" + "=" * 55)
            print("   EVENT MANAGEMENT PORTAL - DATA FLUSH & RESET UTILITY  ")
            print("=" * 55)
            print(f"Active Event: {event_name}")
            print("Note: Automatic backup runs BEFORE any data is flushed.")
            print("-" * 55)
            print("Please select an operation:")
            print(" 1. Clear Team Data (Teams, Members, Leaders, Submissions)")
            print(" 2. Clear Volunteer Data (Volunteers & Volunteer Users)")
            print(" 3. Clear Problem Statements & Selections")
            print(" 4. Clear Pods (and unassign from Teams/Volunteers)")
            print(" 5. Clear Panels (and unassign from Volunteers)")
            print(" 6. Clear Checkpoints & Attendance Records")
            print(" 7. Clear Evaluation Rounds & Submissions")
            print(" 8. Clear Audit Logs, Pending Imports & Refresh Tokens")
            print(" 9. FLUSH EVERYTHING (Complete Event Cleanse)")
            print("10. Password Reset Wizard (Reset user passwords)")
            print(" 0. Exit")
            print("-" * 55)

            choice = input("Enter choice (0-10): ").strip()

            if choice == '1':
                clear_team_data(db)
            elif choice == '2':
                clear_volunteer_data(db)
            elif choice == '3':
                clear_problem_statements(db)
            elif choice == '4':
                clear_pods(db)
            elif choice == '5':
                clear_panels(db)
            elif choice == '6':
                clear_checkpoints_attendance(db)
            elif choice == '7':
                clear_evaluation_rounds(db)
            elif choice == '8':
                clear_system_logs(db)
            elif choice == '9':
                confirm = input("Are you sure you want to flush ALL data? (y/N): ").strip().lower()
                if confirm == 'y':
                    clear_all_data(db)
                else:
                    print("Flush cancelled.")
            elif choice == '10':
                prompt_password_reset(db)
            elif choice == '0':
                print("Exiting utility.")
                break
            else:
                print("Invalid choice, please try again.")

            if choice in ['1', '2', '3', '4', '5', '6', '7', '8', '9']:
                pwd_choice = input("\nWould you like to reset user passwords now? (y/N): ").strip().lower()
                if pwd_choice == 'y':
                    prompt_password_reset(db)

    except Exception as e:
        db.rollback()
        print(f"Error during operation: {e}")
    finally:
        db.close()

def prompt_password_reset(db):
    print("\n--- PASSWORD RESET WIZARD ---")
    print("Select Target Users:")
    print(" 1. All Leader Users (Role: LEADER)")
    print(" 2. All Volunteer Users (Role: VOLUNTEER)")
    print(" 3. All Admin Users (Role: ADMIN)")
    print(" 4. ALL Users")
    role_choice = input("Enter choice (1-4): ").strip()

    target_role = None
    if role_choice == '1':
        target_role = Role.LEADER
    elif role_choice == '2':
        target_role = Role.VOLUNTEER
    elif role_choice == '3':
        target_role = Role.ADMIN

    print("\nSelect Password Reset Mode:")
    print(" 1. Uniform Password (Same password for all selected users)")
    print(" 2. Random Password (Unique 16-character secure random password for each user)")
    mode_choice = input("Enter choice (1-2): ").strip()

    mode = "random"
    uniform_pwd = "Password123!"

    if mode_choice == '1':
        mode = "uniform"
        custom_pwd = input("Enter uniform password [Default: Password123!]: ").strip()
        if custom_pwd:
            uniform_pwd = custom_pwd

    reset_user_passwords(db, target_role=target_role, mode=mode, uniform_password=uniform_pwd)


def main():
    parser = argparse.ArgumentParser(description="Event Management Portal - Data Flushing & Password Reset Utility")
    parser.add_argument("--teams", action="store_true", help="Clear team data")
    parser.add_argument("--volunteers", action="store_true", help="Clear volunteer data")
    parser.add_argument("--ps", action="store_true", help="Clear problem statements")
    parser.add_argument("--pods", action="store_true", help="Clear pods")
    parser.add_argument("--panels", action="store_true", help="Clear panels")
    parser.add_argument("--checkpoints", action="store_true", help="Clear checkpoints & attendance")
    parser.add_argument("--rounds", action="store_true", help="Clear evaluation rounds & submissions")
    parser.add_argument("--logs", action="store_true", help="Clear audit logs & refresh tokens")
    parser.add_argument("--all", action="store_true", help="Flush ALL data")
    parser.add_argument("--reset-passwords", action="store_true", help="Reset user passwords")
    parser.add_argument("--role", choices=["ADMIN", "VOLUNTEER", "LEADER", "ALL"], default="ALL", help="Target role for password reset")
    parser.add_argument("--password-mode", choices=["uniform", "random"], default="uniform", help="Password mode")
    parser.add_argument("--password", default="Password123!", help="Uniform password string")

    args = parser.parse_args()

    # Check if any CLI flag was provided
    cli_flags = [args.teams, args.volunteers, args.ps, args.pods, args.panels, args.checkpoints, args.rounds, args.logs, args.all, args.reset_passwords]

    if not any(cli_flags):
        interactive_menu()
    else:
        db = get_db()
        try:
            if args.all:
                clear_all_data(db)
            else:
                if args.teams: clear_team_data(db)
                if args.volunteers: clear_volunteer_data(db)
                if args.ps: clear_problem_statements(db)
                if args.pods: clear_pods(db)
                if args.panels: clear_panels(db)
                if args.checkpoints: clear_checkpoints_attendance(db)
                if args.rounds: clear_evaluation_rounds(db)
                if args.logs: clear_system_logs(db)

            if args.reset_passwords:
                target_role = None
                if args.role == "ADMIN": target_role = Role.ADMIN
                elif args.role == "VOLUNTEER": target_role = Role.VOLUNTEER
                elif args.role == "LEADER": target_role = Role.LEADER

                reset_user_passwords(db, target_role=target_role, mode=args.password_mode, uniform_password=args.password)
        finally:
            db.close()

if __name__ == "__main__":
    main()
