import os
import sys
import json

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import SessionLocal
from app.models import EvaluationRound, ProblemStatement, RubricVersion, RubricField, RubricPSGuidance, User
from app.services.rubric import save_draft_rubric, publish_rubric, get_current_rubric

def seed_delhi_rubrics():
    db = SessionLocal()
    try:
        # 1. Find Delhi Finale Round (Round 2)
        round_id = "68217b7a-6ad8-4f5f-9079-00c284d275eb"
        round_obj = db.query(EvaluationRound).filter(EvaluationRound.id == round_id).first()
        if not round_obj:
            # Fallback to round with roundNumber 2 or name like 'Delhi'
            round_obj = db.query(EvaluationRound).filter(
                (EvaluationRound.roundNumber == 2) | (EvaluationRound.name.ilike('%Delhi%'))
            ).first()

        if not round_obj:
            print(f"Error: Round {round_id} not found in database.")
            return False

        print(f"Found target round: '{round_obj.name}' (ID: {round_obj.id}, Event ID: {round_obj.eventId})")

        # Get an admin user id as actor
        admin_user = db.query(User).filter(User.eventId == round_obj.eventId).first()
        actor_id = admin_user.id if admin_user else "system_seed"

        # 2. Load seed json
        json_path = os.path.join(backend_dir, 'seed', 'delhi_rubrics.json')
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # 3. Map PS codes to IDs
        ps_records = db.query(ProblemStatement).filter(ProblemStatement.eventId == round_obj.eventId).all()
        ps_map = {p.code: p for p in ps_records}
        print(f"Loaded {len(ps_records)} Problem Statements from DB for event {round_obj.eventId}")

        # 4. Build fields payload
        fields_payload = []
        sort_order = 10

        # General numeric criteria (Section B, 60 marks total)
        for idx, g in enumerate(data.get('general', [])):
            fields_payload.append({
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
        for tf in data.get('general_text', []):
            fields_payload.append({
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

        # PS-specific criteria (Section A, 40 marks per PS)
        guidance_payload = []
        ps_statements = data.get('problem_statements', {})

        for code, ps_data in sorted(ps_statements.items()):
            ps_obj = ps_map.get(code)
            if not ps_obj:
                print(f"Warning: PS code {code} not found in DB problem_statements. Skipping.")
                continue

            # Add guidance
            guidance_payload.append({
                'problemStatementId': ps_obj.id,
                'decisiveTest': ps_data.get('decisiveTest', ''),
                'notes': ps_data.get('notes', ''),
            })

            # Add criteria
            for idx, c in enumerate(ps_data.get('criteria', [])):
                fields_payload.append({
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

        print(f"Constructed {len(fields_payload)} fields and {len(guidance_payload)} PS guidances.")

        # 5. Save draft rubric
        rubric_ver = save_draft_rubric(
            db=db,
            round_obj=round_obj,
            fields_payload=fields_payload,
            actor_id=actor_id,
            guidance_payload=guidance_payload,
        )
        print(f"Draft rubric saved as Version {rubric_ver.version} (ID: {rubric_ver.id})")

        # 6. Publish rubric
        published = publish_rubric(
            db=db,
            round_obj=round_obj,
            actor_id=actor_id,
        )
        print(f"Rubric published successfully at {published.publishedAt}!")

        # 7. Verification
        fields_in_db = db.query(RubricField).filter(RubricField.rubricVersionId == published.id).all()
        guidances_in_db = db.query(RubricPSGuidance).filter(RubricPSGuidance.rubricVersionId == published.id).all()
        print(f"Verification: {len(fields_in_db)} fields and {len(guidances_in_db)} guidances in DB.")

        general_sum = sum(f.maxMarks for f in fields_in_db if f.type == 'numeric' and f.problemStatementId is None)
        print(f"Section B (General) Total Marks: {general_sum}/60")
        assert general_sum == 60, f"Expected 60 general marks, got {general_sum}"

        for g in guidances_in_db:
            ps_fields = [f for f in fields_in_db if f.problemStatementId == g.problemStatementId and f.type == 'numeric']
            ps_sum = sum(f.maxMarks for f in ps_fields)
            assert ps_sum == 40, f"Expected 40 marks for PS {g.problemStatementId}, got {ps_sum}"

        print("SUCCESS: Delhi Finale multi-PS rubric seeded and published with 100% mathematical integrity!")
        return True

    except Exception as e:
        db.rollback()
        print(f"Error seeding Delhi rubrics: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()

if __name__ == '__main__':
    success = seed_delhi_rubrics()
    if not success:
        sys.exit(1)
