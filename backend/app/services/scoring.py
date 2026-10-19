from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Optional, Sequence, Tuple

D = Decimal
THREE = D('0.001')
TWO = D('0.01')


def _q(value: Decimal, places: Decimal = THREE) -> Decimal:
    return value.quantize(places, rounding=ROUND_HALF_UP)


def judge_total_pct(fields: Sequence[dict], marks: Dict[str, object]) -> Decimal:
    '''fields: [{'id', 'maxMarks', 'weight'}] numeric fields only; marks: {id: value}.
    Percent 0..100 = 100 * sum((marks/max) * (weight / total_weight)).'''
    total_weight = sum((D(str(f['weight'])) for f in fields), D('0'))
    if total_weight <= 0:
        raise ValueError('weights must be positive')
    acc = D('0')
    for f in fields:
        mx = D(str(f['maxMarks']))
        if mx <= 0:
            raise ValueError('maxMarks must be positive')
        m = D(str(marks[f['id']]))
        if m < 0 or m > mx:
            raise ValueError('marks out of range')
        acc += (m / mx) * (D(str(f['weight'])) / total_weight)
    return _q(acc * 100)


def aggregate(values: Sequence[Decimal], method: str, trim: int = 1) -> Tuple[Optional[Decimal], bool]:
    '''Returns (score, fell_back). trimmed_mean needs n >= 2*trim+1, else it falls back to mean.'''
    vals = sorted(values)
    n = len(vals)
    if n == 0:
        return None, False
    if method == 'median':
        mid = n // 2
        return _q(vals[mid] if n % 2 else (vals[mid - 1] + vals[mid]) / 2), False
    if method == 'trimmed_mean':
        if trim >= 1 and n >= 2 * trim + 1:
            core = vals[trim:n - trim]
            return _q(sum(core, D('0')) / len(core)), False
        return _q(sum(vals, D('0')) / n), True
    return _q(sum(vals, D('0')) / n), False


def rank_teams(rows: Sequence[dict], tie_break_keys: Sequence[str]) -> List[dict]:
    '''rows: [{'teamId', 'score': Decimal, 'fieldScores': {fieldKey: Decimal}}].
    Sort by score desc then each tie-break field desc; shared rank = competition ranking (1,2,2,4).'''
    def key(r):
        return (r['score'],) + tuple(r['fieldScores'].get(k, D('0')) for k in tie_break_keys)
    ordered = sorted(rows, key=key, reverse=True)
    out, prev, rank = [], None, 0
    for i, r in enumerate(ordered):
        if prev is None or key(r) != prev:
            rank = i + 1
            prev = key(r)
        out.append(dict(r, rank=rank))
    return out


def display_score(pct: Decimal, total_scale: int) -> Decimal:
    return _q(pct * D(total_scale) / 100, TWO)


def validate_rubric(fields: Sequence[dict], tie_break_keys: Sequence[str] = ()) -> List[str]:
    '''Returns a list of human-readable errors (empty means valid for publishing).
    Rules: at least one numeric field; every numeric maxMarks > 0 and weight >= 0;
    If standard rubric: numeric weights total exactly 100, labels unique across all fields.
    If multi-PS rubric: general numeric weights total exactly 60, each PS numeric weights
    total exactly 40 (combined 100), labels unique within General + each PS;
    text fields need visibility in ('staff', 'participant'); fieldKeys unique;
    tie_break_keys must be numeric (and general in multi-PS).'''
    errors: List[str] = []

    numeric_fields = [f for f in fields if f.get('type') == 'numeric']
    if not numeric_fields:
        errors.append("At least one numeric field is required.")

    keys_seen = set()
    for f in fields:
        # Field key uniqueness
        fkey = f.get('fieldKey') or f.get('id')
        if fkey:
            if fkey in keys_seen:
                errors.append(f"Duplicate field key: '{fkey}'.")
            keys_seen.add(fkey)

        # Type-specific validation
        ftype = f.get('type')
        lbl = (f.get('label') or '').strip()
        if ftype == 'numeric':
            try:
                mx = D(str(f.get('maxMarks', 0)))
                if mx <= 0:
                    errors.append(f"Field '{lbl or fkey}' must have maxMarks > 0.")
            except Exception:
                errors.append(f"Field '{lbl or fkey}' has invalid maxMarks.")

            try:
                w = D(str(f.get('weight', 0)))
                if w < 0:
                    errors.append(f"Field '{lbl or fkey}' cannot have negative weight.")
            except Exception:
                errors.append(f"Field '{lbl or fkey}' has invalid weight.")

        elif ftype == 'text':
            vis = f.get('visibility')
            if vis not in ('staff', 'participant'):
                errors.append(f"Text field '{lbl or fkey}' must have visibility 'staff' or 'participant'.")

    has_ps = any(bool(f.get('problemStatementId')) for f in fields)
    if not has_ps:
        # Single rubric: all fields belong to general scope
        labels_seen = set()
        for f in fields:
            lbl = (f.get('label') or '').strip()
            if not lbl:
                errors.append("Field label cannot be empty.")
            else:
                lbl_lower = lbl.lower()
                if lbl_lower in labels_seen:
                    errors.append(f"Duplicate field label: '{lbl}'.")
                labels_seen.add(lbl_lower)

        if numeric_fields:
            try:
                total_w = sum((D(str(f.get('weight', 0))) for f in numeric_fields), D('0'))
                if total_w != D('100'):
                    errors.append(f"Numeric weights must total exactly 100 (current total is {total_w}).")
            except Exception:
                errors.append("Error calculating total numeric weights.")

        numeric_keys = {f.get('fieldKey') or f.get('id') for f in numeric_fields}
        for tbk in tie_break_keys:
            if tbk not in numeric_keys:
                errors.append(f"Tie-break field key '{tbk}' is not a numeric field.")
    else:
        # Multi-PS rubric
        general_fields = [f for f in fields if not f.get('problemStatementId')]
        general_numeric = [f for f in general_fields if f.get('type') == 'numeric']

        gen_w = D('0')
        if not general_numeric:
            errors.append("At least one general numeric field is required in multi-PS rubrics.")
        else:
            try:
                gen_w = sum((D(str(f.get('weight', 0))) for f in general_numeric), D('0'))
            except Exception:
                errors.append("Error calculating general numeric weights.")

        expected_ps_w = D('100') - gen_w
        if expected_ps_w <= D('0') or expected_ps_w >= D('100'):
            errors.append(f"General numeric weights ({gen_w}%) must be between 1% and 99% to allow PS-specific criteria.")

        gen_labels_seen = set()
        for f in general_fields:
            lbl = (f.get('label') or '').strip()
            if not lbl:
                errors.append("General field label cannot be empty.")
            else:
                lbl_lower = lbl.lower()
                if lbl_lower in gen_labels_seen:
                    errors.append(f"Duplicate general field label: '{lbl}'.")
                gen_labels_seen.add(lbl_lower)

        # PS-specific fields grouped by problemStatementId
        ps_map = {}
        for f in fields:
            ps_id = f.get('problemStatementId')
            if ps_id:
                ps_map.setdefault(ps_id, []).append(f)

        for ps_id, ps_fields in ps_map.items():
            ps_numeric = [f for f in ps_fields if f.get('type') == 'numeric']
            if not ps_numeric:
                errors.append(f"Problem statement '{ps_id}' must have at least one numeric field.")
            else:
                try:
                    ps_w = sum((D(str(f.get('weight', 0))) for f in ps_numeric), D('0'))
                    if ps_w != expected_ps_w:
                        errors.append(f"Problem statement '{ps_id}' numeric weights must total exactly {expected_ps_w}% (currently {ps_w}%) to combine with general criteria ({gen_w}%) for 100% total.")
                except Exception:
                    errors.append(f"Error calculating numeric weights for problem statement '{ps_id}'.")

            scoped_labels_seen = set(gen_labels_seen)
            for f in ps_fields:
                lbl = (f.get('label') or '').strip()
                if not lbl:
                    errors.append(f"Field label cannot be empty in problem statement '{ps_id}'.")
                else:
                    lbl_lower = lbl.lower()
                    if lbl_lower in scoped_labels_seen:
                        errors.append(f"Duplicate field label '{lbl}' in problem statement '{ps_id}' evaluation criteria.")
                    scoped_labels_seen.add(lbl_lower)

        gen_numeric_keys = {f.get('fieldKey') or f.get('id') for f in general_numeric}
        for tbk in tie_break_keys:
            if tbk not in gen_numeric_keys:
                errors.append(f"Tie-break field key '{tbk}' must be a general numeric field in multi-PS rubrics.")

    return errors
