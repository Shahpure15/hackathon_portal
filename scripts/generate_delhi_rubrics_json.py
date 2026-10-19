import os
import re
import json

def generate():
    dump_path = os.path.join(os.path.dirname(__file__), '..', 'scratch_docx_dump.txt')
    with open(dump_path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()

    rubrics = {
        'general': [],
        'general_text': [
            {
                'fieldKey': 'gen_judge_notes',
                'type': 'text',
                'label': 'Judge Notes (Internal)',
                'description': 'Private notes and observations for the jury panel.',
                'visibility': 'staff',
                'isRequired': False,
                'sortOrder': 90
            },
            {
                'fieldKey': 'gen_team_feedback',
                'type': 'text',
                'label': 'Team Feedback',
                'description': 'Constructive feedback visible to the participants.',
                'visibility': 'participant',
                'isRequired': False,
                'sortOrder': 95
            }
        ],
        'problem_statements': {}
    }

    current_ps = None
    in_sec_a = False
    in_sec_b = False

    for line in lines:
        line_s = line.strip()
        m_ps = re.match(r'\[P\]\s*PS\s*(\d+)\s*[—\-]\s*(.+)', line_s)
        if m_ps:
            current_ps = int(m_ps.group(1))
            code = f"PSE{current_ps:02d}"
            if code not in rubrics['problem_statements']:
                rubrics['problem_statements'][code] = {
                    'psNumber': current_ps,
                    'title': m_ps.group(2).strip(),
                    'decisiveTest': '',
                    'notes': '',
                    'criteria': []
                }
            in_sec_a = False
            in_sec_b = False
            continue

        if 'SECTION A' in line_s:
            in_sec_a = True
            in_sec_b = False
            continue
        elif 'SECTION B' in line_s:
            in_sec_a = False
            in_sec_b = True
            continue
        elif 'decisive test:' in line_s.lower():
            in_sec_a = False
            in_sec_b = False
            content = line_s.replace('|', '').strip()
            decisive = content
            note = ''
            if 'Judge note:' in content:
                parts = content.split('Judge note:')
                decisive = parts[0].strip()
                note = parts[1].strip()
            elif 'Judge notes:' in content:
                parts = content.split('Judge notes:')
                decisive = parts[0].strip()
                note = parts[1].strip()
            decisive = re.sub(r'Judge[’\']s decisive test:\s*', '', decisive, flags=re.I).strip()
            if current_ps:
                code = f"PSE{current_ps:02d}"
                rubrics['problem_statements'][code]['decisiveTest'] = decisive
                rubrics['problem_statements'][code]['notes'] = note
            continue

        if line_s.startswith('|'):
            parts = [p.strip() for p in line_s.split('|')[1:] if p.strip() or p == '']
            if len(parts) >= 3:
                crit = parts[0]
                desc = parts[1]
                max_m = parts[2]
                if crit.lower() in ('criterion', 'section a total', 'section b total') or not max_m.isdigit():
                    continue
                item = {
                    'label': crit,
                    'description': desc,
                    'maxMarks': int(max_m),
                    'weight': int(max_m)
                }
                if in_sec_a and current_ps:
                    code = f"PSE{current_ps:02d}"
                    rubrics['problem_statements'][code]['criteria'].append(item)
                elif in_sec_b:
                    if not any(g['label'] == crit for g in rubrics['general']):
                        item['sortOrder'] = len(rubrics['general']) + 1
                        rubrics['general'].append(item)

    # If PSE09 not in docx, supply balanced 40M criteria as fallback
    if 'PSE09' not in rubrics['problem_statements']:
        rubrics['problem_statements']['PSE09'] = {
            'psNumber': 9,
            'title': 'AI-Driven Crop Price Forecasting & Market Routing App',
            'decisiveTest': 'Run forecasting model on price history; inspect price trend projection and routing recommendations.',
            'notes': 'Check accuracy across seasonal variations and market volatility.',
            'criteria': [
                {
                    'label': 'Price Forecasting Accuracy & Validation',
                    'description': 'Price prediction model validity on historical data and error analysis across seasonal variations.',
                    'maxMarks': 20,
                    'weight': 20
                },
                {
                    'label': 'Market Routing & Logistics Optimization',
                    'description': 'Practicality and optimality of market selection, transport cost estimation, and net profit advice for farmers.',
                    'maxMarks': 20,
                    'weight': 20
                }
            ]
        }

    out_path = os.path.join(os.path.dirname(__file__), '..', 'backend', 'seed', 'delhi_rubrics.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(rubrics, f, indent=2, ensure_ascii=False)

    print(f"Generated {out_path}")
    print(f"General criteria count: {len(rubrics['general'])} (Total: {sum(g['maxMarks'] for g in rubrics['general'])} marks)")
    print(f"Problem statements count: {len(rubrics['problem_statements'])}")
    for code, data in sorted(rubrics['problem_statements'].items()):
        total = sum(c['maxMarks'] for c in data['criteria'])
        print(f"  {code}: {len(data['criteria'])} criteria, {total} marks. Decisive test: {bool(data['decisiveTest'])}")

if __name__ == '__main__':
    generate()
