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
    Rules: at least one numeric field; every numeric maxMarks > 0 and weight >= 0; numeric weights total
    exactly 100; labels non-empty and unique case-insensitively; text fields need visibility in
    ('staff', 'participant'); fieldKeys unique; tie_break_keys must be numeric field keys.'''
    errors: List[str] = []

    numeric_fields = [f for f in fields if f.get('type') == 'numeric']
    if not numeric_fields:
        errors.append("At least one numeric field is required.")

    labels_seen = set()
    keys_seen = set()

    for f in fields:
        # Field key uniqueness
        fkey = f.get('fieldKey') or f.get('id')
        if fkey:
            if fkey in keys_seen:
                errors.append(f"Duplicate field key: '{fkey}'.")
            keys_seen.add(fkey)

        # Label non-empty and unique case-insensitively
        lbl = (f.get('label') or '').strip()
        if not lbl:
            errors.append("Field label cannot be empty.")
        else:
            lbl_lower = lbl.lower()
            if lbl_lower in labels_seen:
                errors.append(f"Duplicate field label: '{lbl}'.")
            labels_seen.add(lbl_lower)

        # Type-specific validation
        ftype = f.get('type')
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

    # Numeric weights total exactly 100
    if numeric_fields:
        try:
            total_w = sum((D(str(f.get('weight', 0))) for f in numeric_fields), D('0'))
            if total_w != D('100'):
                errors.append(f"Numeric weights must total exactly 100 (current total is {total_w}).")
        except Exception:
            errors.append("Error calculating total numeric weights.")

    # Tie break keys must be numeric field keys
    numeric_keys = {f.get('fieldKey') or f.get('id') for f in numeric_fields}
    for tbk in tie_break_keys:
        if tbk not in numeric_keys:
            errors.append(f"Tie-break field key '{tbk}' is not a numeric field.")

    return errors
