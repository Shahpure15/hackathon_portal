import sys
import os
import csv
import json
from datetime import datetime
from sqlalchemy.orm import joinedload

# Add parent directory to path if needed
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.models import (
    Event, EventConfig, User, Role, CheckpointType, 
    Volunteer, Team, TeamMember, Pod, AttendanceRecord, 
    ProblemStatement, PSSelection, RefreshToken, AuditLog, 
    PendingImport, Panel, EvaluationRound, Submission
)

def safe_str(val):
    if val is None:
        return ""
    if hasattr(val, 'value'):
        return str(val.value)
    if isinstance(val, (dict, list)):
        return json.dumps(val, default=str)
    if isinstance(val, datetime):
        return val.isoformat()
    return str(val)

def perform_full_backup(db, base_backup_dir=None):
    """
    Automatically exports all platform data to CSV files & JSON snapshots inside
    backend/backup/dump/ folder before any database flush operation.
    
    Returns (True, dump_path) on success, or raises RuntimeError on failure.
    """
    if base_backup_dir is None:
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        base_backup_dir = os.path.join(backend_dir, "backup", "dump")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    timestamped_dump_dir = os.path.join(base_backup_dir, f"backup_{timestamp}")

    print(f"\n==================================================")
    print(f"[AUTO-BACKUP] INITIATED")
    print(f"Target Directory: {timestamped_dump_dir}")
    print(f"==================================================")

    try:
        # Create directories if missing
        os.makedirs(timestamped_dump_dir, exist_ok=True)
        os.makedirs(base_backup_dir, exist_ok=True)

        exported_files = []

        # 1. TEAMS ROSTER EXPORT
        teams = db.query(Team).options(
            joinedload(Team.pod),
            joinedload(Team.members),
            joinedload(Team.psSelection).joinedload(PSSelection.ps)
        ).order_by(Team.registrationId).all()

        teams_csv_path = os.path.join(timestamped_dump_dir, "teams_export.csv")
        with open(teams_csv_path, mode="w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            headers = [
                "Team Code", "Team Name", "Leader Name", "Leader Email", "Leader Phone", 
                "College Name", "Category/Discipline", "Status", "Desk Number", 
                "POD Grouping", "Selected PS Code", "Selected PS Title", "Member Count"
            ]
            for i in range(1, 6):
                headers.extend([
                    f"Member {i} Name", f"Member {i} Email", f"Member {i} Phone", f"Member {i} ID Verified"
                ])
            writer.writerow(headers)

            for team in teams:
                pod_name = team.pod.name if team.pod else "Unassigned"
                ps_code = team.psSelection.ps.code if (team.psSelection and team.psSelection.ps) else "None"
                ps_title = team.psSelection.ps.title if (team.psSelection and team.psSelection.ps) else "None"
                
                row = [
                    safe_str(team.registrationId),
                    safe_str(team.name),
                    safe_str(team.leaderName),
                    safe_str(team.leaderEmail),
                    safe_str(team.leaderPhone),
                    safe_str(team.collegeName),
                    safe_str(team.category),
                    safe_str(team.status),
                    safe_str(team.deskNumber),
                    pod_name,
                    ps_code,
                    ps_title,
                    len(team.members)
                ]
                
                members = team.members
                for i in range(5):
                    if i < len(members):
                        m = members[i]
                        row.extend([safe_str(m.name), safe_str(m.email), safe_str(m.phone), "Yes" if m.idVerified else "No"])
                    else:
                        row.extend(["", "", "", ""])
                writer.writerow(row)
        exported_files.append(teams_csv_path)

        # 2. TEAM MEMBERS DETAILED EXPORT
        members_all = db.query(TeamMember).options(joinedload(TeamMember.team)).all()
        members_csv_path = os.path.join(timestamped_dump_dir, "team_members_export.csv")
        with open(members_csv_path, mode="w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow(["Member ID", "Team Reg ID", "Team Name", "Member Name", "Email", "Phone", "ID Verified", "Is Team Leader"])
            for m in members_all:
                team_reg = m.team.registrationId if m.team else ""
                team_name = m.team.name if m.team else ""
                writer.writerow([
                    safe_str(m.id), team_reg, team_name, safe_str(m.name), safe_str(m.email),
                    safe_str(m.phone), "Yes" if m.idVerified else "No", "Yes" if m.isTeamLeader else "No"
                ])
        exported_files.append(members_csv_path)

        # 3. VOLUNTEERS EXPORT
        volunteers = db.query(Volunteer).options(
            joinedload(Volunteer.pod),
            joinedload(Volunteer.panel),
            joinedload(Volunteer.problemStatement),
            joinedload(Volunteer.team),
            joinedload(Volunteer.user)
        ).all()
        vols_csv_path = os.path.join(timestamped_dump_dir, "volunteers_export.csv")
        with open(vols_csv_path, mode="w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow([
                "Volunteer ID", "Name", "Type", "Contact", "Assigned Pod", 
                "Assigned Panel", "Assigned PS Code", "Assigned Team Reg ID", 
                "Remarks", "Login Access Created", "Username"
            ])
            for v in volunteers:
                pod_name = v.pod.name if v.pod else "Unassigned"
                panel_name = v.panel.name if v.panel else "Unassigned"
                ps_code = v.problemStatement.code if v.problemStatement else "Unassigned"
                team_reg = v.team.registrationId if v.team else "Unassigned"
                has_login = "Yes" if v.user else "No"
                username = v.user.username if v.user else ""

                writer.writerow([
                    safe_str(v.id), safe_str(v.name), safe_str(v.type), safe_str(v.contact),
                    pod_name, panel_name, ps_code, team_reg, safe_str(v.remarks), has_login, username
                ])
        exported_files.append(vols_csv_path)

        # 4. PROBLEM STATEMENTS EXPORT
        problem_statements = db.query(ProblemStatement).options(joinedload(ProblemStatement.panel)).all()
        ps_csv_path = os.path.join(timestamped_dump_dir, "problem_statements_export.csv")
        with open(ps_csv_path, mode="w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow([
                "PS Code", "Title", "Description", "Capacity", "Selected Count", 
                "Discipline", "Requirements", "Assigned Panel"
            ])
            for ps in problem_statements:
                panel_name = ps.panel.name if ps.panel else "Unassigned"
                writer.writerow([
                    safe_str(ps.code), safe_str(ps.title), safe_str(ps.description),
                    safe_str(ps.capacity), safe_str(ps.selectedCount), safe_str(ps.discipline),
                    safe_str(ps.requirements), panel_name
                ])
        exported_files.append(ps_csv_path)

        # 5. PODS EXPORT
        pods = db.query(Pod).options(
            joinedload(Pod.teams),
            joinedload(Pod.volunteers)
        ).all()
        pods_csv_path = os.path.join(timestamped_dump_dir, "pods_export.csv")
        with open(pods_csv_path, mode="w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow([
                "Pod ID", "Pod Name", "Capacity", "Assigned Teams Count", 
                "Assigned Teams List", "Assigned Volunteers Count", "Assigned Volunteers List"
            ])
            for p in pods:
                team_list = ", ".join([f"{t.registrationId} ({t.name})" for t in p.teams])
                vol_list = ", ".join([v.name for v in p.volunteers])
                writer.writerow([
                    safe_str(p.id), safe_str(p.name), safe_str(p.capacity),
                    len(p.teams), team_list, len(p.volunteers), vol_list
                ])
        exported_files.append(pods_csv_path)

        # 6. PANELS EXPORT
        panels = db.query(Panel).options(
            joinedload(Panel.problemStatement),
            joinedload(Panel.volunteers)
        ).all()
        panels_csv_path = os.path.join(timestamped_dump_dir, "panels_export.csv")
        with open(panels_csv_path, mode="w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow([
                "Panel ID", "Panel Name", "Faculty Member Name", "Members List", 
                "Assigned PS Code", "Assigned Volunteers List"
            ])
            for pan in panels:
                ps_code = pan.problemStatement.code if pan.problemStatement else "Unassigned"
                members_str = ", ".join(pan.memberNames) if isinstance(pan.memberNames, list) else safe_str(pan.memberNames)
                vols_str = ", ".join([v.name for v in pan.volunteers])
                writer.writerow([
                    safe_str(pan.id), safe_str(pan.name), safe_str(pan.facultyMemberName),
                    members_str, ps_code, vols_str
                ])
        exported_files.append(panels_csv_path)

        # 7. CHECKPOINTS & ATTENDANCE RECORDS EXPORT
        checkpoints = db.query(CheckpointType).all()
        cp_csv_path = os.path.join(timestamped_dump_dir, "checkpoints_export.csv")
        with open(cp_csv_path, mode="w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow(["Checkpoint ID", "Name", "Description"])
            for cp in checkpoints:
                writer.writerow([safe_str(cp.id), safe_str(cp.name), safe_str(cp.description)])
        exported_files.append(cp_csv_path)

        attendance = db.query(AttendanceRecord).options(
            joinedload(AttendanceRecord.teamMember).joinedload(TeamMember.team),
            joinedload(AttendanceRecord.checkpointType)
        ).all()
        att_csv_path = os.path.join(timestamped_dump_dir, "attendance_records_export.csv")
        with open(att_csv_path, mode="w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow(["Record ID", "Member Name", "Team Reg ID", "Team Name", "Checkpoint Name", "Marked By", "Timestamp"])
            for a in attendance:
                m_name = a.teamMember.name if a.teamMember else "Unknown"
                team_reg = a.teamMember.team.registrationId if (a.teamMember and a.teamMember.team) else "Unknown"
                team_name = a.teamMember.team.name if (a.teamMember and a.teamMember.team) else "Unknown"
                cp_name = a.checkpointType.name if a.checkpointType else "Unknown"
                writer.writerow([
                    safe_str(a.id), m_name, team_reg, team_name, cp_name, safe_str(a.markedBy), safe_str(a.timestamp)
                ])
        exported_files.append(att_csv_path)

        # 8. EVALUATION ROUNDS & SUBMISSIONS EXPORT
        rounds = db.query(EvaluationRound).order_by(EvaluationRound.roundNumber).all()
        rounds_csv_path = os.path.join(timestamped_dump_dir, "evaluation_rounds_export.csv")
        with open(rounds_csv_path, mode="w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow(["Round ID", "Round Number", "Name", "Description", "Fields Schema", "Is Submission Open", "Created At"])
            for r in rounds:
                writer.writerow([
                    safe_str(r.id), safe_str(r.roundNumber), safe_str(r.name), safe_str(r.description),
                    safe_str(r.fields), "Yes" if r.isSubmissionOpen else "No", safe_str(r.createdAt)
                ])
        exported_files.append(rounds_csv_path)

        submissions = db.query(Submission).options(
            joinedload(Submission.team),
            joinedload(Submission.round)
        ).all()
        sub_csv_path = os.path.join(timestamped_dump_dir, "submissions_export.csv")
        with open(sub_csv_path, mode="w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow(["Submission ID", "Team Reg ID", "Team Name", "Round Number", "Round Name", "Drive Link", "GitHub Link", "Answers JSON", "Submitted At"])
            for s in submissions:
                team_reg = s.team.registrationId if s.team else "Unknown"
                team_name = s.team.name if s.team else "Unknown"
                r_num = s.round.roundNumber if s.round else "Unknown"
                r_name = s.round.name if s.round else "Unknown"
                writer.writerow([
                    safe_str(s.id), team_reg, team_name, r_num, r_name,
                    safe_str(s.driveLink), safe_str(s.githubLink), safe_str(s.answers), safe_str(s.submittedAt)
                ])
        exported_files.append(sub_csv_path)

        # 9. USER ACCOUNTS EXPORT
        users = db.query(User).options(
            joinedload(User.team),
            joinedload(User.volunteer)
        ).all()
        users_csv_path = os.path.join(timestamped_dump_dir, "users_export.csv")
        with open(users_csv_path, mode="w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow(["User ID", "Username", "Role", "Linked Team Reg ID", "Linked Volunteer Name", "Created At"])
            for u in users:
                team_reg = u.team.registrationId if u.team else ""
                vol_name = u.volunteer.name if u.volunteer else ""
                writer.writerow([
                    safe_str(u.id), safe_str(u.username), safe_str(u.role), team_reg, vol_name, safe_str(u.createdAt)
                ])
        exported_files.append(users_csv_path)

        # Also copy latest export files directly under base_backup_dir for easy reference
        for exported_file in exported_files:
            fname = os.path.basename(exported_file)
            latest_path = os.path.join(base_backup_dir, f"latest_{fname}")
            with open(exported_file, "r", encoding="utf-8-sig") as src, open(latest_path, "w", encoding="utf-8-sig") as dst:
                dst.write(src.read())

        # Verify that all exported files exist and are readable
        for filepath in exported_files:
            if not os.path.exists(filepath):
                raise RuntimeError(f"Backup file validation failed: {filepath} missing.")

        print(f"[AUTO-BACKUP] SUCCESSFUL!")
        print(f"Created {len(exported_files)} CSV data dumps in: {timestamped_dump_dir}")
        print(f"==================================================\n")
        return True, timestamped_dump_dir

    except Exception as e:
        error_msg = f"CRITICAL ERROR: Auto-Backup Failed! Reason: {str(e)}"
        print(f"\n[ERROR] {error_msg}")
        print(f"ABORTING DATABASE FLUSH PROCESS. NO DATA WAS DELETED.")
        print(f"==================================================\n")
        raise RuntimeError(error_msg)
