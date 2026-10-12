from typing import Any


def safe_cell(value: Any) -> Any:
    """Neutralises spreadsheet formula injection.
    
    If the value is a string beginning with '=', '+', '-', or '@',
    prefixes it with a single quote "'" to prevent formula execution in Excel/Sheets.
    """
    if isinstance(value, str) and value:
        stripped = value.lstrip()
        if stripped and stripped[0] in ("=", "+", "-", "@"):
            return f"'{value}"
    return value
