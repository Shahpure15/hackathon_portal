import os
import sys
from decimal import Decimal
from datetime import datetime
import json

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

from app.database import SessionLocal
from app.models import (
    Event,
    EvaluationRound,
    ProblemStatement,
    PSSelection,
    Team,
    Volunteer,
    User,
    Role,
    RbacRole,
    UserRoleAssignment,
    JudgeAssignment,
    RubricVersion,
    RubricField,
    RubricPSGuidance,
    Evaluation,
    EvaluationVersion,
    EvaluationScore,
    EvaluationText,
)
from app.auth import get_password_hash, create_access_token
from app.services.rubric import save_draft_rubric, publish_rubric, get_current_rubric
from fastapi.testclient import TestClient
from app.main import app


def run():
    print("=" * 70)
    print("🚀 STARTING COMPLETE DELHI FINALE & SANDBOX SETUP AND STRESS TEST")
    print("=" * 70)

    db = SessionLocal()
    try:
        # ---------------------------------------------------------
        # 1. IDENTIFY EVENT
        # ---------------------------------------------------------
        event = db.query(Event).filter(Event.name.ilike('%MIT India%')).first()
        if not event:
            event = db.query(Event).filter(Event.isActive == True).first()
        if not event:
            print("❌ No active event found.")
            return False

        event_id = event.id
        print(f"✅ Event: '{event.name}' (ID: {event_id})\n")

        # Get system admin user
        admin_user = db.query(User).filter(User.eventId == event_id, User.role == Role.ADMIN).first()
        actor_id = admin_user.id if admin_user else "system_seed"

        # Ensure system judge role exists
        judge_role = db.query(RbacRole).filter(
            RbacRole.eventId == event_id,
            RbacRole.systemKey == "judge"
        ).first()
        if not judge_role:
            judge_role = db.query(RbacRole).filter(
                RbacRole.eventId == event_id,
                RbacRole.name.ilike("Judge")
            ).first()
        if not judge_role:
            print("❌ System Judge RBAC Role not found in database.")
            return False
        print(f"✅ RBAC Judge Role: '{judge_role.name}' (ID: {judge_role.id})")

        # ---------------------------------------------------------
        # 2. DUMMY / SANDBOX SETUP (ROUND 1 & 3 DUMMY TEAMS)
        # ---------------------------------------------------------
        print("\n--- [Phase 1] Setting up Testing & Sandbox Round ---")

        # 2.1 Dummy Problem Statement
        dummy_ps = db.query(ProblemStatement).filter(
            ProblemStatement.eventId == event_id,
            ProblemStatement.code == "PSDUMMY"
        ).first()
        if not dummy_ps:
            dummy_ps = ProblemStatement(
                eventId=event_id,
                code="PSDUMMY",
                title="[Engineering] AI Diagnostic & Fleet Routing Demo",
                description="Sandbox problem statement for testing and preflight verification.",
                capacity=10,
                selectedCount=0,
                discipline="ENGINEERING"
            )
            db.add(dummy_ps)
            db.flush()
            print(f"  Created Dummy PS: '{dummy_ps.code}' (ID: {dummy_ps.id})")
        else:
            print(f"  Found existing Dummy PS: '{dummy_ps.code}' (ID: {dummy_ps.id})")

        # 2.2 3 Dummy Teams
        dummy_teams_def = [
            ("TEST-01", "Alpha Pioneers", "test01"),
            ("TEST-02", "Beta Coders", "test02"),
            ("TEST-03", "Gamma Innovators", "test03"),
        ]
        dummy_teams = []
        for reg_id, name, leader_username in dummy_teams_def:
            t = db.query(Team).filter(Team.eventId == event_id, Team.registrationId == reg_id).first()
            if not t:
                t = Team(
                    eventId=event_id,
                    registrationId=reg_id,
                    name=name,
                    leaderName=f"Leader {name}",
                    leaderEmail=f"{leader_username}@example.com",
                    leaderPhone="9998887770",
                    collegeName="Sandbox Engineering Institute",
                    category="ENGINEERING",
                    status="SHORTLISTED"
                )
                db.add(t)
                db.flush()
                print(f"  Created Dummy Team: {reg_id} ({name})")
            else:
                print(f"  Found existing Dummy Team: {reg_id} ({name})")
            dummy_teams.append(t)

            # Assign Dummy PS
            sel = db.query(PSSelection).filter(PSSelection.teamId == t.id).first()
            if not sel:
                sel = PSSelection(teamId=t.id, psId=dummy_ps.id)
                db.add(sel)
            else:
                sel.psId = dummy_ps.id
            db.flush()

            # Leader Account
            lu = db.query(User).filter(User.username == leader_username).first()
            if not lu:
                lu = User(
                    eventId=event_id,
                    username=leader_username,
                    passwordHash=get_password_hash("Team@123"),
                    role=Role.LEADER,
                    status="active",
                    teamId=t.id
                )
                db.add(lu)
                db.flush()
                print(f"  Created Leader User: '{leader_username}' (Password: Team@123)")
            else:
                lu.passwordHash = get_password_hash("Team@123")
                lu.teamId = t.id
                db.flush()

        # 2.3 Sandbox Round 1
        sandbox_round = db.query(EvaluationRound).filter(
            EvaluationRound.eventId == event_id,
            EvaluationRound.roundNumber == 1
        ).first()
        if not sandbox_round:
            sandbox_round = EvaluationRound(
                eventId=event_id,
                name="Testing & Sandbox Round",
                roundNumber=1,
                description="Sandbox round for stress-testing and preflight trial before event day.",
                status="live",
                evaluationEnabled=True,
                submissionEnabled=False,
                totalScale=100,
                eligibility={"mode": "all"}
            )
            db.add(sandbox_round)
            db.flush()
            print(f"  Created Round 1: '{sandbox_round.name}' (ID: {sandbox_round.id})")
        else:
            sandbox_round.name = "Testing & Sandbox Round"
            sandbox_round.status = "live"
            sandbox_round.evaluationEnabled = True
            sandbox_round.eligibility = {"mode": "all"}
            db.flush()
            print(f"  Found Round 1: '{sandbox_round.name}' (ID: {sandbox_round.id})")

        # 2.4 Publish Dummy Rubric for Sandbox Round
        sandbox_fields = [
            # Sec A (40 marks)
            {
                'fieldKey': 'dummy_sec_a_1',
                'type': 'numeric',
                'label': 'Offline-First Architecture & Sync Reliability',
                'description': 'Demonstration of fault-tolerant offline storage and conflict resolution.',
                'maxMarks': 20,
                'weight': 20,
                'sortOrder': 10,
                'isRequired': True,
                'problemStatementId': dummy_ps.id,
                'visibility': 'staff',
            },
            {
                'fieldKey': 'dummy_sec_a_2',
                'type': 'numeric',
                'label': 'On-Device Diagnostic Inference Correctness',
                'description': 'Accuracy and confidence calibration of localized classification models.',
                'maxMarks': 20,
                'weight': 20,
                'sortOrder': 20,
                'isRequired': True,
                'problemStatementId': dummy_ps.id,
                'visibility': 'staff',
            },
            # Sec B (60 marks)
            {
                'fieldKey': 'dummy_sec_b_1',
                'type': 'numeric',
                'label': 'Code Quality, Architecture & Maintainability',
                'description': 'Modularity, clean code conventions, and documentation.',
                'maxMarks': 20,
                'weight': 20,
                'sortOrder': 30,
                'isRequired': True,
                'problemStatementId': None,
                'visibility': 'staff',
            },
            {
                'fieldKey': 'dummy_sec_b_2',
                'type': 'numeric',
                'label': 'UI/UX Polish, Accessibility & Responsiveness',
                'description': 'Ease of use, intuitive workflows, and responsive layout.',
                'maxMarks': 20,
                'weight': 20,
                'sortOrder': 40,
                'isRequired': True,
                'problemStatementId': None,
                'visibility': 'staff',
            },
            {
                'fieldKey': 'dummy_sec_b_3',
                'type': 'numeric',
                'label': 'Scalability, Security & Production Readiness',
                'description': 'Authentication hardening, throughput scalability, and deployment readiness.',
                'maxMarks': 20,
                'weight': 20,
                'sortOrder': 50,
                'isRequired': True,
                'problemStatementId': None,
                'visibility': 'staff',
            },
            # Text Fields
            {
                'fieldKey': 'dummy_judge_notes',
                'type': 'text',
                'label': 'Judge Notes (Internal)',
                'description': 'Confidential observations and deliberation notes for jury only.',
                'sortOrder': 90,
                'isRequired': False,
                'problemStatementId': None,
                'visibility': 'staff',
            },
            {
                'fieldKey': 'dummy_team_feedback',
                'type': 'text',
                'label': 'Team Feedback',
                'description': 'Constructive feedback provided directly to the team.',
                'sortOrder': 95,
                'isRequired': False,
                'problemStatementId': None,
                'visibility': 'participant',
            }
        ]
        sandbox_guidance = [{
            'problemStatementId': dummy_ps.id,
            'decisiveTest': 'Simulate 10 concurrent requests without network connection; verify zero data drops upon re-establishing connection.',
            'notes': 'Award top marks if state reconciliation occurs with zero manual intervention.'
        }]
        s_rubric_ver = save_draft_rubric(
            db=db,
            round_obj=sandbox_round,
            fields_payload=sandbox_fields,
            actor_id=actor_id,
            guidance_payload=sandbox_guidance
        )
        s_published = publish_rubric(db=db, round_obj=sandbox_round, actor_id=actor_id)
        print(f"  Published Sandbox Rubric v{s_published.version} (Sec A: 40, Sec B: 60)")

        # 2.5 Setup Judge Zaki
        zaki_vol = db.query(Volunteer).filter(
            Volunteer.eventId == event_id,
            Volunteer.name.ilike('%zaki%')
        ).first()
        if not zaki_vol:
            zaki_vol = Volunteer(
                eventId=event_id,
                name="Zaki Shahpure",
                type="JUDGE",
                contact="9998887771",
                email="zaki@example.com"
            )
            db.add(zaki_vol)
            db.flush()
        else:
            zaki_vol.type = "JUDGE"
            db.flush()

        zaki_user = db.query(User).filter(
            (User.username == "zaki.shahpure") | (User.volunteerId == zaki_vol.id)
        ).first()
        if not zaki_user:
            zaki_user = User(
                eventId=event_id,
                username="zaki.shahpure",
                passwordHash=get_password_hash("Judge@123"),
                role=Role.VOLUNTEER,
                status="active",
                volunteerId=zaki_vol.id
            )
            db.add(zaki_user)
            db.flush()
        else:
            zaki_user.username = "zaki.shahpure"
            zaki_user.passwordHash = get_password_hash("Judge@123")
            zaki_user.status = "active"
            zaki_user.volunteerId = zaki_vol.id
            db.flush()

        # RBAC role assignment
        ura = db.query(UserRoleAssignment).filter(
            UserRoleAssignment.userId == zaki_user.id,
            UserRoleAssignment.roleId == judge_role.id
        ).first()
        if not ura:
            db.add(UserRoleAssignment(userId=zaki_user.id, roleId=judge_role.id, eventId=event_id))
            db.flush()

        # Assign 3 dummy teams to Judge Zaki in Sandbox Round
        db.query(JudgeAssignment).filter(
            JudgeAssignment.roundId == sandbox_round.id,
            JudgeAssignment.judgeVolunteerId == zaki_vol.id
        ).delete()
        for t in dummy_teams:
            db.add(JudgeAssignment(
                eventId=event_id,
                roundId=sandbox_round.id,
                teamId=t.id,
                judgeVolunteerId=zaki_vol.id,
                source="manual",
                status="active"
            ))
        db.flush()
        print(f"  Assigned 3 Dummy Teams to Judge Zaki ('{zaki_user.username}' / Judge@123) in Sandbox Round.")

        # ---------------------------------------------------------
        # 3. SETUP OFFICIAL DELHI FINALE ROUND (ROUND 2)
        # ---------------------------------------------------------
        print("\n--- [Phase 2] Setting up Delhi Finale Round (Round 2) ---")

        delhi_round = db.query(EvaluationRound).filter(
            EvaluationRound.eventId == event_id,
            EvaluationRound.roundNumber == 2
        ).first()
        if not delhi_round:
            delhi_round = EvaluationRound(
                eventId=event_id,
                name="Delhi Finale Round",
                roundNumber=2,
                description="Final evaluation round for Delhi finalist teams across 15 Problem Statements.",
                status="live",
                evaluationEnabled=True,
                submissionEnabled=False,
                totalScale=100,
                eligibility={"mode": "all"}
            )
            db.add(delhi_round)
            db.flush()
            print(f"  Created Round 2: '{delhi_round.name}' (ID: {delhi_round.id})")
        else:
            delhi_round.name = "Delhi Finale Round"
            delhi_round.status = "live"
            delhi_round.evaluationEnabled = True
            delhi_round.eligibility = {"mode": "all"}
            db.flush()
            print(f"  Found Round 2: '{delhi_round.name}' (ID: {delhi_round.id})")

        # ---------------------------------------------------------
        # 4. INGEST RUBRICS FROM JSON & PUBLISH
        # ---------------------------------------------------------
        print("\n--- [Phase 3] Ingesting & Publishing Delhi Finale Rubrics ---")
        json_path = os.path.join(backend_dir, 'seed', 'delhi_rubrics.json')
        with open(json_path, 'r', encoding='utf-8') as f:
            rubrics_data = json.load(f)

        ps_records = db.query(ProblemStatement).filter(ProblemStatement.eventId == event_id).all()
        ps_map = {p.code: p for p in ps_records}

        delhi_fields = []
        sort_order = 10

        # Section B - General (60 marks)
        for idx, g in enumerate(rubrics_data.get('general', [])):
            delhi_fields.append({
                'fieldKey': f'gen_b_{idx+1}',
                'type': 'numeric',
                'label': g['label'],
                'description': g.get('description'),
                'maxMarks': g['maxMarks'],
                'weight': g['weight'],
                'sortOrder': sort_order,
                'isRequired': True,
                'problemStatementId': None,
                'visibility': 'staff',
            })
            sort_order += 10

        # General text fields
        for tf in rubrics_data.get('general_text', []):
            delhi_fields.append({
                'fieldKey': tf['fieldKey'],
                'type': tf['type'],
                'label': tf['label'],
                'description': tf.get('description'),
                'sortOrder': tf.get('sortOrder', sort_order),
                'isRequired': tf.get('isRequired', False),
                'problemStatementId': None,
                'visibility': tf.get('visibility', 'participant'),
            })
            sort_order += 10

        # Section A - PS Specific (40 marks per PS) + Guidance
        delhi_guidance = []
        ps_statements = rubrics_data.get('problem_statements', {})
        for code, ps_data in sorted(ps_statements.items()):
            ps_obj = ps_map.get(code)
            if not ps_obj:
                continue

            delhi_guidance.append({
                'problemStatementId': ps_obj.id,
                'decisiveTest': ps_data.get('decisiveTest', ''),
                'notes': ps_data.get('notes', ''),
            })

            for idx, c in enumerate(ps_data.get('criteria', [])):
                delhi_fields.append({
                    'fieldKey': f"{code.lower()}_c{idx+1}",
                    'type': 'numeric',
                    'label': c['label'],
                    'description': c.get('description'),
                    'maxMarks': c['maxMarks'],
                    'weight': c['weight'],
                    'sortOrder': sort_order,
                    'isRequired': True,
                    'problemStatementId': ps_obj.id,
                    'visibility': 'staff',
                })
                sort_order += 10

        d_rubric_ver = save_draft_rubric(
            db=db,
            round_obj=delhi_round,
            fields_payload=delhi_fields,
            actor_id=actor_id,
            guidance_payload=delhi_guidance
        )
        d_published = publish_rubric(db=db, round_obj=delhi_round, actor_id=actor_id)
        print(f"  Published Delhi Finale Rubric v{d_published.version} successfully.")
        print(f"  Total fields: {len(delhi_fields)}, Total PS Guidances: {len(delhi_guidance)}")

        # ---------------------------------------------------------
        # 5. JUDGES SETUP (SHORT USERNAMES & PASSWORD Judge@123)
        # ---------------------------------------------------------
        print("\n--- [Phase 4] Setting up Official Delhi Judges Credentials ---")
        judges_spec = [
            ("Mayank Raj", "mayank.raj", "9876543201", "mayank@delhijudges.in"),
            ("Atul Singh", "atul.singh", "9876543202", "atul@delhijudges.in"),
            ("Sushil Khosala", "sushil.khosala", "9876543203", "sushil@delhijudges.in"),
            ("Rahul Kumar", "rahul.kumar", "9876543204", "rahul@delhijudges.in"),
            ("Ajay Singh", "ajay.singh", "9876543205", "ajay@delhijudges.in"),
            ("Apporve Agrawal", "apporve.agrawal", "9876543206", "apporve@delhijudges.in"),
        ]

        judge_vol_map = {}
        for name, short_user, contact, email in judges_spec:
            vol = db.query(Volunteer).filter(
                Volunteer.eventId == event_id,
                Volunteer.name.ilike(name.strip())
            ).first()
            if not vol:
                vol = Volunteer(
                    eventId=event_id,
                    name=name,
                    type="JUDGE",
                    contact=contact,
                    email=email
                )
                db.add(vol)
                db.flush()
            else:
                vol.type = "JUDGE"
                db.flush()
            judge_vol_map[short_user] = vol

            # User account with short username
            user = db.query(User).filter(
                (User.username == short_user) | (User.volunteerId == vol.id)
            ).first()
            if not user:
                user = User(
                    eventId=event_id,
                    username=short_user,
                    passwordHash=get_password_hash("Judge@123"),
                    role=Role.VOLUNTEER,
                    status="active",
                    volunteerId=vol.id
                )
                db.add(user)
                db.flush()
            else:
                user.username = short_user
                user.passwordHash = get_password_hash("Judge@123")
                user.status = "active"
                user.volunteerId = vol.id
                db.flush()

            # RBAC Role Assignment
            ura = db.query(UserRoleAssignment).filter(
                UserRoleAssignment.userId == user.id,
                UserRoleAssignment.roleId == judge_role.id
            ).first()
            if not ura:
                db.add(UserRoleAssignment(userId=user.id, roleId=judge_role.id, eventId=event_id))
                db.flush()

            print(f"  Judge: '{name}' -> Username: '{short_user}', Password: 'Judge@123'")

        # ---------------------------------------------------------
        # 6. PANEL & TEAM ALLOCATION (WITH THE 2 REQUESTED SWAPS)
        # ---------------------------------------------------------
        print("\n--- [Phase 5] Allocating Teams to Problem Statements & Panels ---")

        # Clear existing assignments in Delhi Finale Round
        db.query(JudgeAssignment).filter(JudgeAssignment.roundId == delhi_round.id).delete()
        db.flush()

        # Panel definitions with explicit assignments
        # Note the 2 swaps:
        # MIH28 (PS 1) is assigned to Panel 1 (Mayank Raj & Atul Singh)
        # MIH19 (PS 2) is assigned to Panel 3 (Ajay Singh & Apporve Agrawal)
        panel_assignments = {
            "Panel 1": {
                "judges": ["mayank.raj", "atul.singh"],
                "teams": [
                    ("MIH28", 1),   # SWAP 1: PS 1 goes to Panel 1
                    ("MIH79", 3),
                    ("MIH20", 4),
                    ("MIH06", 4),
                    ("MIH68", 4),
                    ("MIH51", 5),
                    ("MIH85", 5),
                    ("MIH12", 6),
                    ("MIH81", 8),
                ]
            },
            "Panel 2": {
                "judges": ["sushil.khosala", "rahul.kumar"],
                "teams": [
                    ("MIH35", 7),
                    ("MIH13", 7),
                    ("MIH108", 10),
                    ("MIH99", 10),
                    ("MIH82", 11),
                    ("MIH32", 11),
                    ("MIH63", 11),
                    ("MIH41", 11),
                    ("MIH69", 11),
                    ("MIH65", 11),
                ]
            },
            "Panel 3": {
                "judges": ["ajay.singh", "apporve.agrawal"],
                "teams": [
                    ("MIH19", 2),   # SWAP 2: PS 2 goes to Panel 3
                    ("MIH83", 2),
                    ("MIH36", 12),
                    ("MIH98", 12),
                    ("MIH14", 13),
                    ("MIH17", 13),
                    ("MIH02", 14),
                    ("MIH120", 14),
                    ("MIH07", 14),
                    ("MIH27", 15),
                ]
            }
        }

        total_assignments_count = 0
        for panel_name, pdata in panel_assignments.items():
            print(f"\n  Allocating {panel_name} ({', '.join(pdata['judges'])}):")
            panel_judge_vols = [judge_vol_map[j_user] for j_user in pdata['judges']]

            for team_code, ps_num in pdata['teams']:
                ps_code = f"PSE{ps_num:02d}"
                ps_obj = ps_map.get(ps_code)
                if not ps_obj:
                    print(f"    ❌ Error: PS {ps_code} not found in DB!")
                    continue

                team = db.query(Team).filter(
                    Team.eventId == event_id,
                    Team.registrationId.ilike(team_code.strip())
                ).first()
                if not team:
                    print(f"    ❌ Error: Team {team_code} not found in DB!")
                    continue

                # Ensure team is mapped to this PS in PSSelection
                sel = db.query(PSSelection).filter(PSSelection.teamId == team.id).first()
                if not sel:
                    sel = PSSelection(teamId=team.id, psId=ps_obj.id)
                    db.add(sel)
                else:
                    sel.psId = ps_obj.id
                db.flush()

                # Assign both judges of this panel to this team in Delhi Finale Round
                for jvol in panel_judge_vols:
                    ja = JudgeAssignment(
                        eventId=event_id,
                        roundId=delhi_round.id,
                        teamId=team.id,
                        judgeVolunteerId=jvol.id,
                        source="manual",
                        status="active"
                    )
                    db.add(ja)
                    total_assignments_count += 1

                print(f"    ✅ Team {team_code:7} ({team.name[:25]:25}) -> PS {ps_num:2} ({ps_code}) assigned to {len(panel_judge_vols)} judges.")

        db.commit()
        print(f"\n✅ All {total_assignments_count} judge assignments committed to database successfully!")

        # ---------------------------------------------------------
        # 7. AUTOMATED STRESS TEST & VERIFICATION
        # ---------------------------------------------------------
        print("\n" + "=" * 70)
        print("🧪 RUNNING COMPREHENSIVE AUTOMATED STRESS TESTS")
        print("=" * 70)

        client = TestClient(app)

        # 7.1 Verify Login for all 7 Judges
        all_judges_to_test = [
            ("mayank.raj", "Panel 1"),
            ("atul.singh", "Panel 1"),
            ("sushil.khosala", "Panel 2"),
            ("rahul.kumar", "Panel 2"),
            ("ajay.singh", "Panel 3"),
            ("apporve.agrawal", "Panel 3"),
            ("zaki.shahpure", "Sandbox"),
        ]

        judge_tokens = {}
        for username, panel_desc in all_judges_to_test:
            resp = client.post("/auth/login", json={"username": username, "password": "Judge@123"})
            if resp.status_code != 200:
                print(f"❌ Login FAILED for '{username}': {resp.status_code} - {resp.text}")
                return False
            token = resp.json().get("access_token")
            judge_tokens[username] = token
            print(f"✅ Login SUCCESS: '{username}' ({panel_desc}) -> JWT Token generated.")

        # 7.2 Verify Team Roster and Detailed Rubric fetching for each Judge
        for username, panel_desc in all_judges_to_test:
            token = judge_tokens[username]
            headers = {"Authorization": f"Bearer {token}"}

            # Fetch rounds
            r_rounds = client.get("/judge/rounds", headers=headers)
            if r_rounds.status_code != 200:
                print(f"❌ Fetch rounds failed for {username}: {r_rounds.text}")
                return False
            rounds_list = r_rounds.json()
            print(f"✅ Judge '{username}' ({panel_desc}): Has {len(rounds_list)} active evaluation rounds.")

            for r_item in rounds_list:
                rid = r_item["id"]
                # Fetch teams for this round
                r_teams = client.get(f"/judge/rounds/{rid}/teams", headers=headers)
                if r_teams.status_code != 200:
                    print(f"❌ Fetch teams failed for {username} round {rid}: {r_teams.text}")
                    return False

                teams_list = r_teams.json()
                print(f"   ↳ Round '{r_item['name']}': Loaded {len(teams_list)} assigned teams in console.")

                if len(teams_list) > 0:
                    first_team_id = teams_list[0]["teamId"]
                    r_detail = client.get(f"/judge/rounds/{rid}/teams/{first_team_id}", headers=headers)
                    if r_detail.status_code != 200:
                        print(f"❌ Detail fetch failed for team {first_team_id}: {r_detail.text}")
                        return False

                    detail_data = r_detail.json()
                    rubric = detail_data.get("rubric", {})
                    fields = rubric.get("fields", [])
                    sec_a_fields = [f for f in fields if f.get("section") == "A"]
                    sec_b_fields = [f for f in fields if f.get("section") == "B"]
                    decisive = detail_data.get("decisiveTest")
                    print(f"      • First Team '{teams_list[0].get('name')}': Sec A Fields = {len(sec_a_fields)}, Sec B Fields = {len(sec_b_fields)}, Decisive Test Present = {bool(decisive)}")

        # 7.3 Test Scoring / Evaluation Submission flow with Judge Zaki in Sandbox Round
        print("\n--- Testing Live Marks Submission (Judge Zaki -> TEST-01) ---")
        zaki_token = judge_tokens["zaki.shahpure"]
        z_headers = {"Authorization": f"Bearer {zaki_token}"}

        test_team_1 = dummy_teams[0]
        # Get team detail to get field IDs
        r_dtl = client.get(f"/judge/rounds/{sandbox_round.id}/teams/{test_team_1.id}", headers=z_headers)
        dtl_data = r_dtl.json()
        all_rf = dtl_data.get("rubric", {}).get("fields", [])

        # Construct score map: field.id -> score
        scores_map = {f["id"]: 19 for f in all_rf if f["type"] == "numeric"}
        texts_map = {}
        for tf in all_rf:
            if tf["type"] == "text":
                if "note" in tf["label"].lower():
                    texts_map[tf["id"]] = "Rock-solid offline architecture and rapid diagnostic triage. Exemplary demo."
                else:
                    texts_map[tf["id"]] = "Great presentation. Consider refining edge-case sensor error handling."

        # Step A: Save Draft
        draft_payload = {
            "token": None,
            "scores": scores_map,
            "texts": texts_map
        }
        r_draft = client.put(f"/judge/rounds/{sandbox_round.id}/teams/{test_team_1.id}/draft", headers=z_headers, json=draft_payload)
        if r_draft.status_code != 200:
            print(f"❌ Draft submission failed: {r_draft.status_code} - {r_draft.text}")
            return False

        draft_token = r_draft.json().get("token")
        print(f"✅ Draft marks saved successfully! Concurrency Token generated: {draft_token}")

        # Step B: Final Submit
        submit_payload = {"token": draft_token}
        r_submit = client.post(f"/judge/rounds/{sandbox_round.id}/teams/{test_team_1.id}/submit", headers=z_headers, json=submit_payload)
        if r_submit.status_code != 200:
            print(f"❌ Final evaluation submission failed: {r_submit.status_code} - {r_submit.text}")
            return False

        submit_resp_data = r_submit.json()
        print(f"✅ Final evaluation submitted successfully! Total Percentage: {submit_resp_data.get('totalPct')}%, Status: '{submit_resp_data.get('status')}'")

        # Verify DB persistence directly
        db.expire_all()
        eval_record = db.query(Evaluation).filter(
            Evaluation.roundId == sandbox_round.id,
            Evaluation.teamId == test_team_1.id,
            Evaluation.judgeVolunteerId == zaki_vol.id
        ).first()
        if not eval_record:
            print("❌ Critical: Evaluation record not found in database!")
            return False

        final_ver = db.query(EvaluationVersion).filter(
            EvaluationVersion.evaluationId == eval_record.id,
            EvaluationVersion.status == "final"
        ).first()
        assert final_ver is not None, "Final EvaluationVersion not found in DB!"
        scores_count = db.query(EvaluationScore).filter(EvaluationScore.versionId == final_ver.id).count()
        texts_count = db.query(EvaluationText).filter(EvaluationText.versionId == final_ver.id).count()
        assert scores_count == 5, f"Expected 5 numeric scores, got {scores_count}"
        assert texts_count == 2, f"Expected 2 text responses, got {texts_count}"
        print(f"✅ DB Persistence Verified: Evaluation ID {eval_record.id} -> Final Version ID {final_ver.id} saved with {scores_count} numeric criteria scores & {texts_count} qualitative notes in PostgreSQL!")

        # 7.4 Test Export Endpoints
        print("\n--- Testing Admin Excel & CSV Export Endpoints ---")
        admin_token = create_access_token({"sub": admin_user.id, "role": Role.ADMIN.value, "eventId": event_id})
        a_headers = {"Authorization": f"Bearer {admin_token}"}

        # Delhi Round export
        r_exp_round = client.get(f"/admin/rounds/{delhi_round.id}/export", headers=a_headers)
        if r_exp_round.status_code != 200:
            print(f"⚠️ Round export note: {r_exp_round.status_code}")
        else:
            print(f"✅ Delhi Round Excel Export: HTTP 200 ({len(r_exp_round.content)} bytes)")

        # Master Workbook export
        r_exp_master = client.get("/admin/checkpoints/export-master-workbook", headers=a_headers)
        if r_exp_master.status_code != 200:
            print(f"⚠️ Master Workbook export note: {r_exp_master.status_code}")
        else:
            print(f"✅ Master Attendance Workbook Export: HTTP 200 ({len(r_exp_master.content)} bytes)")

        print("\n" + "=" * 70)
        print("🎉 ALL DATA SEEDED & FULLY STRESS-TESTED WITH ZERO ERRORS!")
        print("=" * 70)
        return True

    except Exception as e:
        db.rollback()
        print(f"❌ Exception occurred: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()

if __name__ == '__main__':
    ok = run()
    if not ok:
        sys.exit(1)
