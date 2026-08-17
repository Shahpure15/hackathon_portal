import sys
import os
import argparse

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from flush_data import get_db, reset_user_passwords, Role

def main():
    parser = argparse.ArgumentParser(description="User Password Reset Utility")
    parser.add_argument("--role", choices=["ADMIN", "VOLUNTEER", "LEADER", "ALL"], default="ALL", help="Target user role")
    parser.add_argument("--mode", choices=["uniform", "random"], default="uniform", help="Password mode: uniform (same for all) or random")
    parser.add_argument("--password", default="Password123!", help="Uniform password value when mode is 'uniform'")

    args = parser.parse_args()

    db = get_db()
    try:
        target_role = None
        if args.role == "ADMIN":
            target_role = Role.ADMIN
        elif args.role == "VOLUNTEER":
            target_role = Role.VOLUNTEER
        elif args.role == "LEADER":
            target_role = Role.LEADER

        print("Executing Password Reset Utility...")
        reset_user_passwords(
            db, 
            target_role=target_role, 
            mode=args.mode, 
            uniform_password=args.password
        )
    finally:
        db.close()

if __name__ == "__main__":
    main()
